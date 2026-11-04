import { describe, expect, it } from "vitest";
import type { RawItem } from "@/lib/sources/types";
import { scoreItems } from "./combine";
import { applyPreferenceSignal, preferenceKey } from "@/lib/preferences/ledger";
import type { MatchingSeed } from "@/lib/seed-pool/scoring";
const now = Date.parse("2026-10-10T00:00:00Z");
const seed: MatchingSeed = { id: "seed", canonicalKey: "doi:1", features: { topic: ["forest canopy"], object: ["rainforest tree"], method: ["satellite imaging"] } };
const item = (id: string, title: string): RawItem => ({ id, source: "openalex", title, authors: [], abstract: "", url: `https://example.test/${id}`, publishedAt: "2026-10-09", tags: [], metadata: {} });
describe("seed scoring", () => {
  it("preserves existing scores without usable seeds", () => {
    const pool = [item("x", "Lithium battery study")]; const profile = { topics: ["lithium"] };
    expect(scoreItems(pool, profile, undefined, now, [])).toEqual(scoreItems(pool, profile, undefined, now));
  });
  it("admits a grounded separate seed topic after hard exclusions and gives a grounded reason", () => {
    const candidate = item("x", "Forest canopy and rainforest tree by satellite imaging");
    expect(scoreItems([candidate], { topics: ["lithium battery"] }, undefined, now)).toEqual([]);
    const ranked = scoreItems([candidate], { topics: ["lithium battery"] }, undefined, now, [seed]);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].relevanceReason).toContain("forest canopy");
    expect(ranked[0].relevanceReason).not.toContain("lithium battery");
    expect(scoreItems([candidate], { topics: ["lithium battery"], exclusions: ["rainforest"] }, undefined, now, [seed])).toEqual([]);
  });
  it("does not admit a single incidental method or unrelated paper", () => {
    const unrelated = [item("x", "Satellite imaging of distant galaxies")];
    expect(scoreItems(unrelated, { topics: ["lithium battery"] }, undefined, now, [seed])).toEqual([]);
  });
});


it("retains gradual negative feedback once with a seed", () => {
  const concept = { key: preferenceKey("satellite imaging", "openalex_topic", "T123"), label: "satellite imaging", source: "openalex_topic" as const };
  let ledger = applyPreferenceSignal(undefined, [concept], "negative", { at: "2026-10-10T00:00:00.000Z" });
  ledger = applyPreferenceSignal(ledger, [concept], "negative", { at: "2026-10-10T00:00:00.000Z" });
  const candidate = { ...item("a", "Forest canopy and rainforest tree by satellite imaging"), metadata: { preferenceSignals: [concept] } };
  const profile = { topics: ["forest canopy"] };
  const baseline = scoreItems([candidate], profile, undefined, now, [seed])[0];
  const disliked = scoreItems([candidate], { ...profile, preferenceLedger: ledger }, undefined, now, [seed])[0];
  expect(disliked.score).toBeLessThan(baseline.score);
  expect(disliked.score).toBeGreaterThan(0);
});

describe("R-C7 seed blend scale and inspectable breakdown", () => {
  const pool = [
    item("p1", "Lithium battery anode coatings for lithium battery packs"),
    item("p2", "Forest canopy and rainforest tree by satellite imaging"),
    item("p3", "Lithium battery separators in forest canopy field stations"),
  ];
  const profile = { topics: ["lithium battery"] };
  it("feeds intent on the pool-relative topicality scale and exposes every component and weight", () => {
    const ranked = scoreItems(pool, profile, undefined, now, [seed]);
    expect(ranked.length).toBeGreaterThan(1);
    for (const row of ranked) {
      const b = row.scoreBreakdown;
      const blend = b.seedBlend;
      if (!blend) throw new Error("seeded item lacks seedBlend");
      expect(blend.intent).toBeCloseTo((b.keyword + b.topicality) / 2, 12);
      expect(blend.weights).toEqual({ seed: 0.4, intent: 0.5, feedback: 0, recencySource: 0.1 });
      expect(blend.feedback).toBeNull();
      expect(blend.recencySource).toBeCloseTo((b.recency + b.source) / 2, 12);
      expect(blend.blended).toBeCloseTo(0.4 * blend.seed + 0.5 * blend.intent + 0.1 * blend.recencySource, 12);
      expect(b.combined).toBeCloseTo(blend.blended * blend.preferencePenalty, 12);
      expect(row.score).toBe(b.combined);
    }
    // The pool's most topical intent paper reaches topicality 1, so intent can use its full range.
    expect(Math.max(...ranked.map((r) => r.scoreBreakdown.topicality))).toBe(1);
    expect(ranked.some((r) => r.scoreBreakdown.topicality !== r.scoreBreakdown.tfidf)).toBe(true);
    const p2 = ranked.find((r) => r.id === "p2")!.scoreBreakdown.seedBlend!;
    expect(p2.seed).toBeCloseTo(1);
    expect(p2.seedFacets.sort()).toEqual(["method", "object", "topic"]);
  });
  it("carries only numbers and facet labels, never seed phrases, and is absent without a seed", () => {
    const ranked = scoreItems(pool, profile, undefined, now, [seed]);
    const serialized = JSON.stringify(ranked.map((r) => r.scoreBreakdown.seedBlend));
    for (const phrase of [...seed.features.topic, ...seed.features.object, ...seed.features.method]) expect(serialized).not.toContain(phrase);
    for (const row of scoreItems(pool, profile, undefined, now)) expect(row.scoreBreakdown).not.toHaveProperty("seedBlend");
  });
  it("reports the 40/35/15/10 weights once positive feedback history exists", () => {
    const concept = { key: preferenceKey("satellite imaging", "openalex_topic", "T9"), label: "satellite imaging", source: "openalex_topic" as const };
    const ledger = applyPreferenceSignal(undefined, [concept], "positive", { at: "2026-10-10T00:00:00.000Z" });
    const ranked = scoreItems(pool, { ...profile, preferenceLedger: ledger }, undefined, now, [seed]);
    for (const row of ranked) expect(row.scoreBreakdown.seedBlend?.weights).toEqual({ seed: 0.4, intent: 0.35, feedback: 0.15, recencySource: 0.1 });
  });
});

describe("R-C18 seed reason only when the seed admits the item", () => {
  it("gives the ordinary reason when the seed match is below the admission bar", () => {
    const candidate = item("m", "Satellite imaging of lithium battery plants");
    const [row] = scoreItems([candidate], { topics: ["lithium battery"] }, undefined, now, [seed]);
    expect(row.scoreBreakdown.seedBlend?.seed).toBeGreaterThan(0);
    expect(row.relevanceReason).not.toContain("seed paper");
  });
  it("names the strongest matched facet when the seed does admit", () => {
    const candidate = item("y", "Rainforest tree crowns by satellite imaging");
    const [row] = scoreItems([candidate], { topics: ["lithium battery"] }, undefined, now, [seed]);
    expect(row.relevanceReason).toBe("Shares rainforest tree and satellite imaging with a seed paper.");
  });
});
