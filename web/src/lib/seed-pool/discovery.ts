import { fetchCitationNeighborhood } from "@/lib/affiliation/openalex";
import { fetchSemanticScholarRecommendations } from "@/lib/sources/semantic-scholar-recommendations";
import { dedupItems } from "@/lib/feed/dedup";
import type { RawItem } from "@/lib/sources/types";
import type { SeedPaper } from "./types";
import { groupSeedCopies } from "./scoring";

interface PublicClients {
  citations(ids: string[]): Promise<RawItem[]>;
  recommendations(ids: string[]): Promise<RawItem[]>;
}
const clients: PublicClients = {
  citations: (ids) => fetchCitationNeighborhood(ids, { limit: 40 }),
  recommendations: (ids) => fetchSemanticScholarRecommendations(ids, { limit: 25 }),
};

/** Only verified public identifiers leave this process. No extracted feature,
 * seed title, upload identifier, or source text is passed to either client. */
export async function discoverSeedNeighbors(seeds: readonly SeedPaper[], api: PublicClients = clients): Promise<RawItem[]> {
  const distinct = groupSeedCopies(seeds).map((group) => group.find((seed) => seed.publicIds?.openAlexId || seed.publicIds?.semanticScholarId) ?? group[0]).slice(0, 5);
  const oa = [...new Set(distinct.map((s) => s.publicIds?.openAlexId?.replace(/^https?:\/\/openalex\.org\//i, ""))
    .filter((id): id is string => !!id && /^W\d+$/i.test(id)))];
  const s2 = [...new Set(distinct.map((s) => s.publicIds?.semanticScholarId)
    .filter((id): id is string => !!id && /^[a-f0-9]{40}$/i.test(id)))];
  const attempts = await Promise.allSettled([
    oa.length ? api.citations(oa) : Promise.resolve([]),
    s2.length ? api.recommendations(s2) : Promise.resolve([]),
  ]);
  return dedupItems(attempts.flatMap((r) => r.status === "fulfilled" ? r.value : []));
}
