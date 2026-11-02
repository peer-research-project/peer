import { tokenizeFolded } from "@/lib/scoring/tokenize";

/** This shape describes only extracted matching facets, never PDF text. */
export interface SeedFacets { topic: readonly string[]; object: readonly string[]; method: readonly string[] }
export interface MatchingSeed { id: string; canonicalKey: string; features: SeedFacets }
export type SeedFacet = keyof SeedFacets;
export interface FacetHit { facet: SeedFacet; phrase: string }
export interface SeedMatch { seedId: string; canonicalKey: string; score: number; hits: FacetHit[] }

const FACETS: ReadonlyArray<{ name: SeedFacet; weight: number }> = [
  { name: "topic", weight: 0.5 }, { name: "object", weight: 0.3 }, { name: "method", weight: 0.2 },
];
const clamp = (n: number) => Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;

/** Match only extracted phrases actually present in the public candidate text. */
export function matchSeed(candidateText: string, seed: MatchingSeed): SeedMatch {
  const tokens = tokenizeFolded(candidateText);
  const hits: FacetHit[] = [];
  let score = 0;
  for (const { name, weight } of FACETS) {
    const phrases = [...new Set(seed.features[name].map((v) => v.trim()).filter(Boolean))];
    if (!phrases.length) continue;
    let matched = 0;
    for (const phrase of phrases) {
      const parts = tokenizeFolded(phrase);
      if (!parts.length) continue;
      const present = tokens.some((_, i) => parts.every((part, j) => tokens[i + j] === part));
      if (present) { matched++; hits.push({ facet: name, phrase }); }
    }
    score += weight * matched / phrases.length;
  }
  return { seedId: seed.id, canonicalKey: seed.canonicalKey, score: clamp(score), hits };
}

/** Keep the strongest two distinct papers, never add duplicate copies' scores. */
export function strongestSeedMatches(candidateText: string, seeds: readonly MatchingSeed[]): SeedMatch[] {
  const distinct = new Map<string, SeedMatch>();
  for (const seed of seeds) {
    if (!seed.canonicalKey) continue;
    const hit = matchSeed(candidateText, seed);
    const previous = distinct.get(seed.canonicalKey);
    if (!previous || hit.score > previous.score) distinct.set(seed.canonicalKey, hit);
  }
  return [...distinct.values()].filter((m) => m.score > 0).sort((a, b) => b.score - a.score).slice(0, 2);
}

/** A generic method or object alone does not establish topical relevance. */
export function admitsBySeed(match: SeedMatch | undefined): boolean {
  if (!match || match.score < 0.3) return false;
  return match.hits.some((hit) => hit.facet === "topic" && tokenizeFolded(hit.phrase).length >= 2)
    || new Set(match.hits.map((hit) => hit.facet)).size >= 2;
}

/** Comparable, separately calculated components; feedback null means no feedback history. */
export function mixSeedScore(seed: number, intent: number, feedback: number | null, recencySource: number): number {
  return clamp(0.4 * clamp(seed) + (feedback === null ? 0.5 : 0.35) * clamp(intent)
    + (feedback === null ? 0 : 0.15 * clamp(feedback)) + 0.1 * clamp(recencySource));
}
