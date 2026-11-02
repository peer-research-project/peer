import { describe, expect, it } from "vitest";
import type { RawItem } from "@/lib/sources/types";
import { scoreItems } from "./combine";
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
