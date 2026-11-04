import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExtractedDocument } from "@/lib/papers/html-text";
import { extractUploadConcepts } from "@/lib/preferences/upload-concepts";
import { SEED_BOILERPLATE_PHRASES, SEED_CONDITION_PHRASES, isSeedBoilerplate, seedFromExtractedDocument, verifiedPublicDoi } from "./features";
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
