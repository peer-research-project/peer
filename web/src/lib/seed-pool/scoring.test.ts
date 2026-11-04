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


it("matches folded facet terms regardless of order using TF-IDF and grounds the reason", () => {
  const reordered = matchSeed("Electrolytes with solid interfaces", battery);
  expect(reordered.score).toBeGreaterThan(0.3);
  expect(reordered.hits).toContainEqual({ facet: "topic", phrase: "solid / electrolyte" });
  expect(admitsBySeed(reordered)).toBe(true);
  expect(admitsBySeed(matchSeed("galactic neutron diffraction", battery))).toBe(false);
  expect(matchSeed("galactic observation", battery).score).toBe(0);
  expect(matchSeed("solid lithium neutron astronomy", battery).score).toBe(0);
});

describe("R-C6 facet weights renormalized over the facets a seed has", () => {
  const facets = (topic: string[], object: string[], method: string[]): MatchingSeed => ({ id: "r", canonicalKey: "sha256:r", features: { topic, object, method } });
  it("lets a topic-only seed's topic count in full", () => {
    const topicOnly = facets(["peat bog carbon"], [], []);
    expect(matchSeed("Peat bog carbon flux in a fictional fen", topicOnly).score).toBeCloseTo(1);
    expect(admitsBySeed(matchSeed("Peat bog carbon flux in a fictional fen", topicOnly))).toBe(true);
  });
  it("shares 50/20 over topic+method as 50/70 and 20/70", () => {
    const topicMethod = facets(["peat bog carbon"], [], ["eddy covariance"]);
    expect(matchSeed("Peat bog carbon budgets", topicMethod).score).toBeCloseTo(0.5 / 0.7);
    expect(matchSeed("Eddy covariance towers", topicMethod).score).toBeCloseTo(0.2 / 0.7);
    expect(matchSeed("Peat bog carbon by eddy covariance", topicMethod).score).toBeCloseTo(1);
  });
  it("keeps a full three-facet seed on the 50/30/20 scale and a facetless seed at zero", () => {
    expect(matchSeed("Peat bog carbon", facets(["peat bog carbon"], ["sphagnum moss"], ["eddy covariance"])).score).toBeCloseTo(0.5);
    expect(matchSeed("Peat bog carbon", facets([], [], [])).score).toBe(0);
    expect(matchSeed("Peat bog carbon", facets(["  "], [], [])).score).toBe(0);
  });
});

describe("R-C18 grounded, informative seed reason phrases", () => {
  it("leads with the strongest facet and never joins scattered words with slashes", () => {
    const wide = { id: "w", canonicalKey: "sha256:w", features: { topic: ["forest canopy", "leaf litter", "soil fungi", "root depth"], object: ["moraine lake"], method: ["dye tracing"] } };
    const match = matchSeed("Forest canopy over a moraine lake studied by dye tracing", wide);
    expect(match.reasonPhrases[0]).toBe("moraine lake");
    expect(match.reasonPhrases).toHaveLength(2);
    expect(match.reasonPhrases).not.toContain("forest canopy");
    const scattered = matchSeed("Electrolytes with solid interfaces", battery);
    expect(scattered.reasonPhrases).toEqual(["the terms solid and electrolyte"]);
    expect(scattered.reasonPhrases.join(" ")).not.toContain("/");
  });
  it("prefers a phrase found as written and skips one already covered", () => {
    const s = { id: "c", canonicalKey: "sha256:c", features: { topic: ["water retention", "forest canopy water", "canopy water"], object: [], method: [] } };
    expect(matchSeed("Water retention by the forest canopy: canopy water after rain", s).reasonPhrases).toEqual(["water retention", "canopy water"]);
  });
});

// W11 R-C18 (Round-1 scorecard C18): a seed reason never quotes a phrase that
// still holds a verb-like token from the R-P1 boundary list anywhere in it
// ("density affects water", "retention after rain"). The cleanest matched
// phrases lead; a verb-holding phrase that is still needed is named as its
// words ("the terms density and water"). Every word named is in the candidate,
// and the hits behind admission are unchanged.
describe("R-C18 seed reasons read grammatically (W11)", () => {
  const BOUNDARY = new Set("affects affect affected using used shows show is are was were of for with and the a an to in on after under than how".split(" "));
  // A phrase quotes a verb-like token when one remains after the "the terms" lead-in ("and" there is the list joiner).
  const quotesVerb = (phrase: string) => phrase.replace(/^the terms? /, "").split(/\s+/).some((word) => BOUNDARY.has(word) && word !== "and");
  const canopy: MatchingSeed = { id: "c", canonicalKey: "sha256:c", features: {
    topic: ["density affects water", "retention after rain", "forest canopy water", "leaf canopy density"], object: [], method: [] } };
  const text = "Leaf canopy density affects water retention after rain in forest canopy water studies.";

  it("prefers clean phrases over verb-holding ones, keeping the hits behind admission", () => {
    const match = matchSeed(text, canopy);
    expect(match.reasonPhrases).toEqual(["forest canopy water", "leaf canopy density"]);
    expect(match.hits.map((hit) => hit.phrase)).toEqual(canopy.features.topic);
    expect(admitsBySeed(match)).toBe(admitsBySeed({ ...match, reasonPhrases: [] }));
  });

  it("names a verb-holding phrase only as its words when nothing cleaner covers it", () => {
    const only: MatchingSeed = { id: "o", canonicalKey: "sha256:o", features: { topic: ["density affects water", "retention after rain"], object: [], method: [] } };
    const match = matchSeed("Canopy density affects water retention after rain.", only);
    expect(match.reasonPhrases).toEqual(["the terms density and water", "the terms retention and rain"]);
    for (const phrase of match.reasonPhrases) expect(quotesVerb(phrase), phrase).toBe(false);
    const candidate = new Set("canopy density affects water retention after rain".split(" "));
    for (const phrase of match.reasonPhrases) for (const word of phrase.replace(/^the terms /, "").split(/, | and /)) expect(candidate.has(word), word).toBe(true);
  });

  it("never quotes a boundary word inside a phrase, whatever the facet order", () => {
    const mixed: MatchingSeed = { id: "m", canonicalKey: "sha256:m", features: {
      topic: ["canopy moisture"], object: ["concentration affects cycling"], method: ["field sensors"] } };
    const match = matchSeed("Concentration affects cycling; canopy moisture from field sensors.", mixed);
    expect(match.reasonPhrases.length).toBeGreaterThan(0);
    for (const phrase of match.reasonPhrases) expect(quotesVerb(phrase), phrase).toBe(false);
  });
});
