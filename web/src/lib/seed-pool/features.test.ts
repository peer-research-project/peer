import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExtractedDocument } from "@/lib/papers/html-text";
import { seedFromExtractedDocument, verifiedPublicDoi } from "./features";
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
    expect(one?.canonicalKey).toBe(two?.canonicalKey);
    expect(one?.features.topic.length! + one?.features.object.length! + one?.features.method.length!).toBeGreaterThan(0);
    expect(JSON.stringify(one)).not.toContain(doc.sections[0].text);
    expect(seedFromExtractedDocument(doc, Buffer.from("one"), "10.1234/example")?.canonicalKey).toBe("doi:10.1234/example");
    expect(seedFromExtractedDocument(doc, Buffer.from("two"), "10.1234/example")?.canonicalKey).toBe("doi:10.1234/example");
  });
  it("sends only a DOI to verify public identity and refuses a mismatched title", async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request) => Response.json({ message: { DOI: "10.1234/example", title: ["Fictional Sodium Cathode Study"] } }));
    vi.stubGlobal("fetch", fetcher);
    expect(await verifiedPublicDoi("10.1234/example", doc.title!)).toBe("10.1234/example");
    expect(String(fetcher.mock.calls[0][0])).not.toContain("Sodium");
    expect(await verifiedPublicDoi("10.1234/example", "Other Fictional Paper")).toBeUndefined();
  });
});
