import { fetchCitationNeighborhood } from "@/lib/affiliation/openalex";
import { fetchSemanticScholarRecommendations } from "@/lib/sources/semantic-scholar-recommendations";
import { resolveOpenAlexSeed } from "@/lib/evaluation/live-channels/seed-resolution";
import { normalizePreferenceLabel } from "@/lib/preferences/ledger";
import { dedupItems } from "@/lib/feed/dedup";
import type { RawItem } from "@/lib/sources/types";
import type { SeedPaper } from "./types";
import { groupSeedCopies } from "./scoring";

interface PublicClients {
  citations(ids: string[]): Promise<RawItem[]>;
  recommendations(ids: string[]): Promise<RawItem[]>;
  resolveDoi?(doi: string): Promise<{ workId: string; title: string }>;
}
const clients: PublicClients = {
  citations: (ids) => fetchCitationNeighborhood(ids, { limit: 40 }),
  recommendations: (ids) => fetchSemanticScholarRecommendations(ids, { limit: 25 }),
  resolveDoi: (doi) => resolveOpenAlexSeed(doi, { timeoutMs: 2500 }),
};

/** Only verified public identifiers leave this process. No extracted feature,
 * seed title, upload identifier, or source text is passed to either client. */
export async function discoverSeedNeighbors(seeds: readonly SeedPaper[], api: PublicClients = clients): Promise<RawItem[]> {
  const distinct = groupSeedCopies(seeds).map((group) => group.find((seed) => seed.publicIds?.openAlexId || seed.publicIds?.semanticScholarId || seed.publicIds?.doi) ?? group[0]).slice(0, 5);
  const resolved = await Promise.all(distinct.map(async (seed) => {
    const direct = seed.publicIds?.openAlexId?.replace(/^https?:\/\/openalex\.org\//i, "");
    if (direct && /^W\d+$/i.test(direct)) return direct;
    const doi = seed.publicIds?.doi?.trim().toLowerCase();
    if (!api.resolveDoi || !doi || !/^10\.\d{4,9}\/[\w.()/:;-]+$/i.test(doi) || seed.canonicalKey.toLowerCase() !== `doi:${doi}`) return undefined;
    try {
      // Only the verified DOI is sent. The seed title comparison happens here.
      const publicWork = await api.resolveDoi(doi);
      const title = normalizePreferenceLabel(seed.title);
      if (title.split(" ").length < 3 || title !== normalizePreferenceLabel(publicWork.title) || !/^W\d+$/i.test(publicWork.workId)) return undefined;
      return publicWork.workId;
    } catch { return undefined; }
  }));
  const oa = [...new Set(resolved.filter((id): id is string => !!id))];
  const s2 = [...new Set(distinct.map((s) => s.publicIds?.semanticScholarId)
    .filter((id): id is string => !!id && /^[a-f0-9]{40}$/i.test(id)))];
  const attempts = await Promise.allSettled([
    oa.length ? api.citations(oa) : Promise.resolve([]),
    s2.length ? api.recommendations(s2) : Promise.resolve([]),
  ]);
  return dedupItems(attempts.flatMap((r) => r.status === "fulfilled" ? r.value : []));
}
