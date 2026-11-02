import { describe, expect, it } from "vitest";
import { admitsBySeed, diversifySeedRanking, matchSeed, mixSeedScore, strongestSeedMatches, type MatchingSeed } from "./scoring";
const seed = (id: string, canonicalKey: string, topic: string, object: string, method: string): MatchingSeed => ({ id, canonicalKey, features: { topic: [topic], object: [object], method: [method] } });
const battery = seed("a", "doi:a", "solid electrolyte", "lithium oxide", "neutron diffraction");
const ecology = seed("b", "doi:b", "forest canopy", "rainforest tree", "satellite imaging");
describe("seed matching", () => {
  it("scores facets separately and describes only actual matches", () => {
    const hit = matchSeed("A solid electrolyte and lithium oxide were measured.", battery);
    expect(hit.score).toBeCloseTo(0.8);
    expect(hit.hits).toEqual([{ facet: "topic", phrase: "solid electrolyte" }, { facet: "object", phrase: "lithium oxide" }]);
  });
  it("keeps unrelated papers distinct and chooses the strong match", () => {
    const matches = strongestSeedMatches("Forest canopy and rainforest tree with satellite imaging", [battery, ecology]);
    expect(matches).toHaveLength(1); expect(matches[0].seedId).toBe("b"); expect(matches[0].score).toBeCloseTo(1);
  });
  it("never multiplies canonical copies or invents substring matches", () => {
    expect(strongestSeedMatches("Solid electrolytes in lithium oxide", [battery, { ...battery, id: "copy" }])).toHaveLength(1);
    expect(strongestSeedMatches("electrolyte-free computation", [battery])).toEqual([]);
  });
  it("treats identical bytes with different identifiers as one seed", () => {
    const first = { ...battery, contentHash: "a".repeat(64) };
    const alias = { ...battery, id: "alias", canonicalKey: "doi:other", contentHash: first.contentHash };
    expect(strongestSeedMatches("solid electrolyte lithium oxide", [first, alias])).toHaveLength(1);
  });
  it("admits only grounded, sufficiently specific matches", () => {
    expect(admitsBySeed(matchSeed("A solid electrolyte improves transport", battery))).toBe(true);
    expect(admitsBySeed(matchSeed("Neutron diffraction measured crystals", battery))).toBe(false);
    expect(admitsBySeed(undefined)).toBe(false);
  });
  it("balances distinct strong matches within a narrow score band", () => {
    const rows = [
      { id: "a1", title: "solid electrolyte lithium oxide", score: 0.9 },
      { id: "a2", title: "solid electrolyte lithium oxide", score: 0.89 },
      { id: "b1", title: "forest canopy rainforest tree", score: 0.88 },
      { id: "b2", title: "forest canopy rainforest tree", score: 0.6 },
    ];
    expect(diversifySeedRanking(rows, [battery, ecology]).map((r) => r.id)).toEqual(["a1", "b1", "a2", "b2"]);
  });
  it("uses a separate normalized blend and returns the missing feedback weight to intent", () => {
    expect(mixSeedScore(1, 1, 1, 1)).toBeCloseTo(1);
    expect(mixSeedScore(1, 1, null, 0)).toBeCloseTo(0.9);
    expect(mixSeedScore(1, 1, 0, 0)).toBeCloseTo(0.75);
    expect(mixSeedScore(5, -1, null, NaN)).toBeCloseTo(0.4);
  });
});
