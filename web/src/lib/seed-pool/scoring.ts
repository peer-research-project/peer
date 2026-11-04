import { buildIndex, scoreTfidf } from "@/lib/scoring/tfidf";
import type { RawItem } from "@/lib/sources/types";
import { tokenizeFolded } from "@/lib/scoring/tokenize";
import { PHRASE_BOUNDARY_WORDS } from "@/lib/preferences/upload-concepts";

/** This shape describes only extracted matching facets, never PDF text. */
export interface SeedFacets { topic: readonly string[]; object: readonly string[]; method: readonly string[] }
export interface MatchingSeed { id: string; canonicalKey: string; contentHash?: string; features: SeedFacets }
export type SeedFacet = keyof SeedFacets;
export interface FacetHit { facet: SeedFacet; phrase: string }
export interface SeedMatch {
  seedId: string; canonicalKey: string; score: number; hits: FacetHit[];
  /** R-C18: up to two matched seed phrases for a reason, strongest facet and most informative first, rendered without slashes. */
  reasonPhrases: string[];
}

const FACETS: ReadonlyArray<{ name: SeedFacet; weight: number }> = [
  { name: "topic", weight: 0.5 }, { name: "object", weight: 0.3 }, { name: "method", weight: 0.2 },
];
export const hasUsableSeed = (seed: MatchingSeed): boolean => Boolean(seed.canonicalKey)
  && Object.values(seed.features).some((phrases: readonly string[]) => phrases.some((phrase: string) => tokenizeFolded(phrase).length > 0));
const clamp = (n: number) => Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;

/** Compare each facet independently using local folded-token TF-IDF. The
 * candidate vector contains only supported facet words: unrelated title or
 * abstract length cannot dilute a clear match. A reason/admission requires
 * every meaningful word of at least one actual facet phrase to be present. */
export function matchSeed(candidateText: string, seed: MatchingSeed): SeedMatch {
  const tokens = tokenizeFolded(candidateText);
  const candidate = new Set(tokens);
  const hits: FacetHit[] = [];
  const ranked: RankedPhrase[] = [];
  let score = 0;
  const facets = FACETS.map(({ name, weight }) => {
    const phrases = [...new Set(seed.features[name].map((v) => v.trim()).filter(Boolean))];
    return { name, weight, phrases, terms: [...new Set(phrases.flatMap(tokenizeFolded))] };
  });
  // R-C6: 50/30/20 is shared over the facets this seed actually has, the same
  // way the missing feedback share returns to intent. A topic-only seed's
  // topic counts in full; a seed with no facet terms contributes nothing.
  const presentWeight = facets.reduce((sum, facet) => sum + (facet.terms.length ? facet.weight : 0), 0);
  for (const { name, weight: absoluteWeight, phrases, terms } of facets) {
    if (!terms.length) continue;
    const weight = absoluteWeight / presentWeight;
    const matching = terms.filter((term) => candidate.has(term));
    if (!matching.length) continue;
    const doc = (id: string, title: string): RawItem => ({ id, title, source: "openalex", authors: [], url: "", publishedAt: "", metadata: {} });
    const index = buildIndex([doc("candidate", matching.join(" ")), doc("facet", terms.join(" "))], tokenizeFolded);
    const facetScore = weight * scoreTfidf("candidate", terms.join(" "), index, tokenizeFolded);
    score += facetScore;
    for (const phrase of phrases) {
      const parts = tokenizeFolded(phrase);
      if (!parts.length || !parts.every((part) => candidate.has(part))) continue;
      const contiguous = tokens.some((_, i) => parts.every((part, j) => tokens[i + j] === part));
      hits.push({ facet: name, phrase: contiguous ? phrase : parts.join(" / ") });
      // R-C18 (W11): a phrase holding a verb-like boundary word anywhere
      // ("density affects water") is never quoted as written; it is named by
      // its other words, and ranks after every clean phrase of its facet.
      const clean = !phrase.toLowerCase().split(/\s+/).concat(parts).some((word) => PHRASE_BOUNDARY_WORDS.has(word));
      if (clean) {
        ranked.push({ facetScore, clean, contiguous, parts, text: contiguous ? phrase : `the terms ${listWords([...new Set(parts)])}` });
      } else {
        const words = [...new Set(parts.filter((part) => !PHRASE_BOUNDARY_WORDS.has(part)))];
        if (words.length) ranked.push({ facetScore, clean, contiguous, parts: words, text: words.length === 1 ? `the term ${words[0]}` : `the terms ${listWords(words)}` });
      }
    }
  }
  return { seedId: seed.id, canonicalKey: seed.canonicalKey, score: hits.length ? clamp(score) : 0, hits, reasonPhrases: reasonPhrases(ranked) };
}

const listWords = (words: readonly string[]) => words.length < 2 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;

interface RankedPhrase { facetScore: number; clean: boolean; contiguous: boolean; parts: string[]; text: string }

/** R-C18: the strongest facet first (an object or method beats a weaker
 * topic), then a phrase with no verb-like boundary word before one that has
 * it (W11), then a phrase found as written before scattered words, then the
 * longer phrase; skip a phrase whose words a chosen phrase already covers. */
function reasonPhrases(ranked: RankedPhrase[]): string[] {
  const chosen: string[] = [];
  const covered = new Set<string>();
  const order = [...ranked].sort((a, b) => b.facetScore - a.facetScore || Number(b.clean) - Number(a.clean)
    || Number(b.contiguous) - Number(a.contiguous) || b.parts.length - a.parts.length);
  for (const hit of order) {
    if (chosen.length === 2) break;
    if (hit.parts.every((part) => covered.has(part))) continue;
    chosen.push(hit.text);
    for (const part of hit.parts) covered.add(part);
  }
  return chosen;
}

/** Group exact-byte or canonical duplicates, including transitive aliases. */
export function groupSeedCopies<T extends MatchingSeed>(seeds: readonly T[]): T[][] {
  const groups: T[][] = [];
  for (const seed of seeds) {
    if (!seed.canonicalKey) continue;
    const overlaps = groups.filter((group) => group.some((other) => other.canonicalKey === seed.canonicalKey || (!!seed.contentHash && other.contentHash === seed.contentHash)));
    if (!overlaps.length) { groups.push([seed]); continue; }
    const group = overlaps[0]; group.push(seed);
    for (const merged of overlaps.slice(1)) { group.push(...merged); groups.splice(groups.indexOf(merged), 1); }
  }
  return groups;
}

/** Keep the strongest two distinct papers, never add duplicate copies' scores. */
export function strongestSeedMatches(candidateText: string, seeds: readonly MatchingSeed[]): SeedMatch[] {
  return groupSeedCopies(seeds).map((group) => ({ ...group.map((seed) => matchSeed(candidateText, seed)).sort((a, b) => b.score - a.score)[0], canonicalKey: group[0].canonicalKey }))
    .filter((m) => m.score > 0).sort((a, b) => b.score - a.score).slice(0, 2);
}

/** A generic method or object alone does not establish topical relevance. */
export function admitsBySeed(match: SeedMatch | undefined): boolean {
  if (!match || match.score < 0.3) return false;
  return match.hits.some((hit) => hit.facet === "topic" && tokenizeFolded(hit.phrase).length >= 2)
    || new Set(match.hits.map((hit) => hit.facet)).size >= 2;
}

export interface SeedBlendWeights { seed: number; intent: number; feedback: number; recencySource: number }
/** 40/35/15/10; with no feedback history its 15 returns to intent (50). */
export function seedBlendWeights(feedback: number | null): SeedBlendWeights {
  return feedback === null
    ? { seed: 0.4, intent: 0.5, feedback: 0, recencySource: 0.1 }
    : { seed: 0.4, intent: 0.35, feedback: 0.15, recencySource: 0.1 };
}

/** Comparable, separately calculated components; feedback null means no feedback history. */
export function mixSeedScore(seed: number, intent: number, feedback: number | null, recencySource: number): number {
  const w = seedBlendWeights(feedback);
  return clamp(w.seed * clamp(seed) + w.intent * clamp(intent)
    + (feedback === null ? 0 : w.feedback * clamp(feedback)) + w.recencySource * clamp(recencySource));
}

/** Promote a different genuinely matched seed only within a small score band. */
export function diversifySeedRanking<T extends { title: string; abstract?: string; tags?: string[]; score: number }>(items: readonly T[], seeds: readonly MatchingSeed[]): T[] {
  const remaining = [...items];
  const out: T[] = [];
  let previous: string | undefined;
  const cache = new Map<T, string | undefined>();
  const strongest = (item: T) => {
      if (cache.has(item)) return cache.get(item);
      const match = strongestSeedMatches([item.title, item.abstract ?? "", ...(item.tags ?? [])].join(" "), seeds)[0];
      const key = admitsBySeed(match) ? match?.canonicalKey : undefined;
      cache.set(item, key);
      return key;
    };
  while (remaining.length) {
    let at = 0;
    if (previous && strongest(remaining[0]) === previous) {
      const alternate = remaining.findIndex((item, i) => i > 0 && remaining[0].score - item.score <= 0.03 && !!strongest(item) && strongest(item) !== previous);
      if (alternate > 0) at = alternate;
    }
    const [chosen] = remaining.splice(at, 1);
    out.push(chosen);
    previous = strongest(chosen);
  }
  return out;
}
