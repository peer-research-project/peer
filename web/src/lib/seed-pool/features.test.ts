import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExtractedDocument } from "@/lib/papers/html-text";
import { extractUploadConcepts } from "@/lib/preferences/upload-concepts";
import { SEED_BOILERPLATE_PHRASES, SEED_CONDITION_PHRASES, isSeedBoilerplate, seedFromExtractedDocument, trimSeedEdgeBoilerplate, verifiedPublicDoi } from "./features";
// Calls through to the real extractor; one W23 case swaps in a fixed concept list once.
vi.mock("@/lib/preferences/upload-concepts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/preferences/upload-concepts")>();
  return { ...actual, extractUploadConcepts: vi.fn(actual.extractUploadConcepts) };
});
const doc: ExtractedDocument = { title: "Fictional Sodium Cathode Study", source: "pdf", figureCaptions: [], sections: [{ id: "s0", heading: "Methods", canonical: "methods", text: "Sodium cathode materials were tested using microscopy and diffraction. ".repeat(10) }] };
afterEach(() => vi.unstubAllGlobals());
describe("private seed features", () => {
  it("requires real readable text; a title or scanned PDF creates no seed", () => {
    expect(seedFromExtractedDocument({ ...doc, sections: [] }, Buffer.from("pdf"))).toBeNull();
    expect(seedFromExtractedDocument({ ...doc, sections: [{ ...doc.sections[0], text: "unreadable" }] }, Buffer.from("pdf"))).toBeNull();
  });
  it("keeps real concepts and deduplicates exact bytes or verified DOI without raw text", () => {
    const one = seedFromExtractedDocument(doc, Buffer.from("one"));
    const two = seedFromExtractedDocument(doc, Buffer.from("one"));
    if (!one || !two) throw new Error("Expected readable seeds");
    expect(one.canonicalKey).toBe(two.canonicalKey);
    expect(one.features.topic.length + one.features.object.length + one.features.method.length).toBeGreaterThan(0);
    expect(JSON.stringify(one)).not.toContain(doc.sections[0].text);
    expect(seedFromExtractedDocument(doc, Buffer.from("one"), "10.1234/example")?.canonicalKey).toBe("doi:10.1234/example");
    expect(seedFromExtractedDocument(doc, Buffer.from("two"), "10.1234/example")?.canonicalKey).toBe("doi:10.1234/example");
  });
  it("sends only a DOI to verify public identity and refuses a mismatched title", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => { void input; return Response.json({ message: { DOI: "10.1234/example", title: ["Fictional Sodium Cathode Study"] } }); });
    vi.stubGlobal("fetch", fetcher);
    expect(await verifiedPublicDoi("10.1234/example", doc.title!)).toBe("10.1234/example");
    expect(String(fetcher.mock.calls[0][0])).not.toContain("Sodium");
    expect(await verifiedPublicDoi("10.1234/example", "Other Fictional Paper")).toBeUndefined();
  });
});

describe("R-C18 seed boilerplate stoplist", () => {
  const boiler: ExtractedDocument = { title: "Glacier Meltwater Pathways", source: "pdf", figureCaptions: [], sections: [{ id: "s0", heading: "Results", canonical: "results", text: "Glacier meltwater pathways were traced in a real experiment. We release test data and a synthetic example for glacier meltwater. ".repeat(8) }] };
  it("drops research boilerplate at seed creation and keeps the subject", () => {
    const seed = seedFromExtractedDocument(boiler, Buffer.from("boiler"));
    if (!seed) throw new Error("Expected a readable seed");
    const all = [...seed.features.topic, ...seed.features.object, ...seed.features.method];
    expect(all.some((label) => label.includes("glacier meltwater"))).toBe(true);
    for (const label of all) expect(isSeedBoilerplate(label)).toBe(false);
    expect(all.join(" | ")).not.toMatch(/test data|real experiment|synthetic example/);
  });
  it("names only the explicit stoplist and all-boilerplate labels", () => {
    for (const label of ["test data", "real experiment", "synthetic example", "this paper", "synthetic example denser", "experiment results"]) expect(isSeedBoilerplate(label)).toBe(true);
    for (const label of ["glacier meltwater", "impedance spectroscopy", "battery electrolyte stability", "synthetic aperture radar", "test bench"]) expect(isSeedBoilerplate(label)).toBe(false);
  });
});

describe("R-C6d generic condition phrases are seed boilerplate (W21)", () => {
  // Invented text shaped like the fictional canopy fixture's methods sentence.
  const canopy: ExtractedDocument = { title: "Fictional Canopy Moisture Study", source: "pdf", figureCaptions: [], sections: [{ id: "s0", heading: "Methods", canonical: "methods", text: "Leaf canopy density and canopy moisture were measured under identical conditions with field sensors. Canopy moisture and leaf canopy density were compared under identical conditions. ".repeat(6) }] };
  it("keeps 'identical conditions' out of seed facets but leaves the upload concept itself alone", () => {
    expect(extractUploadConcepts(canopy).map((c) => c.label)).toContain("identical conditions");
    const seed = seedFromExtractedDocument(canopy, Buffer.from("canopy-conditions"));
    if (!seed) throw new Error("Expected a readable seed");
    const all = [...seed.features.topic, ...seed.features.object, ...seed.features.method];
    expect(all).not.toContain("identical conditions");
    expect(all.join(" | ")).not.toMatch(/\bconditions\b/);
    expect(all).toEqual(expect.arrayContaining(["leaf canopy density", "canopy moisture"]));
  });
  it("names exactly the closed list of five and leaves domain condition terms", () => {
    expect([...SEED_CONDITION_PHRASES].sort()).toEqual(["different conditions", "experimental conditions", "identical conditions", "same conditions", "similar conditions"]);
    for (const phrase of SEED_CONDITION_PHRASES) {
      expect(SEED_BOILERPLATE_PHRASES).toContain(phrase);
      expect(isSeedBoilerplate(phrase)).toBe(true);
      expect(isSeedBoilerplate(`under ${phrase}`)).toBe(true);
    }
    for (const label of ["standard conditions", "boundary conditions", "initial conditions", "reaction conditions", "conditions", "identical twins", "canopy conditions"]) expect(isSeedBoilerplate(label)).toBe(false);
  });
});

describe("R-C3c boilerplate words trimmed from seed facet label edges (W23)", () => {
  // Invented text shaped like the fictional canopy fixture's "In this synthetic example denser foliage…" sentence.
  const foliage: ExtractedDocument = { title: "Fictional Foliage Study", source: "pdf", figureCaptions: [], sections: [{ id: "s0", heading: "Results", canonical: "results", text: "In this synthetic example denser foliage retained water after rain. Canopy moisture and leaf canopy density were measured with field sensors. ".repeat(6) }] };
  const edgeWord = /^(?:test|data|real|experiments?|synthetic|examples?|this|paper|study|results?)|(?:test|data|real|experiments?|synthetic|examples?|this|paper|study|results?)$/;
  it("seeds 'denser foliage' where the upload concept reads 'example denser foliage', and leaves the upload concept alone", () => {
    expect(extractUploadConcepts(foliage).map((c) => c.label)).toContain("example denser foliage");
    const seed = seedFromExtractedDocument(foliage, Buffer.from("foliage-edge"));
    if (!seed) throw new Error("Expected a readable seed");
    const all = [...seed.features.topic, ...seed.features.object, ...seed.features.method];
    expect(seed.features.topic).toContain("denser foliage");
    expect(all).not.toContain("example denser foliage");
    for (const label of all) expect(label).not.toMatch(edgeWord);
    expect(all).toEqual(expect.arrayContaining(["leaf canopy density", "canopy moisture", "field sensors"]));
  });
  it("trims only edge words, keeps two-word remainders, and drops what is too short, boilerplate or verb-holding", () => {
    expect(trimSeedEdgeBoilerplate("example denser foliage")).toBe("denser foliage");
    expect(trimSeedEdgeBoilerplate("denser foliage example")).toBe("denser foliage");
    expect(trimSeedEdgeBoilerplate("this example denser foliage results")).toBe("denser foliage");
    expect(trimSeedEdgeBoilerplate("canopy example density")).toBe("canopy example density");
    expect(trimSeedEdgeBoilerplate("leaf canopy density")).toBe("leaf canopy density");
    expect(trimSeedEdgeBoilerplate("example foliage")).toBeUndefined();
    expect(trimSeedEdgeBoilerplate("foliage data")).toBeUndefined();
    expect(trimSeedEdgeBoilerplate("example test bench data")).toBeUndefined();
    expect(trimSeedEdgeBoilerplate("example foliage using sensors")).toBeUndefined();
    expect(trimSeedEdgeBoilerplate("example using sensors")).toBeUndefined();
  });
  it("keeps one label when the trimmed label repeats one already in the same facet", () => {
    vi.mocked(extractUploadConcepts).mockReturnValueOnce([
      { key: "a", label: "denser foliage", source: "uploaded_article", facet: "topic" },
      { key: "b", label: "example denser foliage", source: "uploaded_article", facet: "topic" },
      { key: "c", label: "denser foliage data", source: "uploaded_article", facet: "topic" },
      { key: "d", label: "canopy moisture", source: "uploaded_article", facet: "topic" },
    ]);
    const seed = seedFromExtractedDocument(foliage, Buffer.from("foliage-dup"));
    expect(seed?.features.topic).toEqual(["denser foliage", "canopy moisture"]);
  });
});
