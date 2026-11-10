// R-T1 (W9, 2026-11-04): a text PDF whose title line is set in the body's own
// size has no layout title, so its seed read "Untitled PDF" although the PDF's
// Info dictionary names it. Invented PDFs, built in the test and read by the
// real pdf.js; no network, no model.
import { describe, expect, it } from "vitest";
import { extractPdfTextFromBytes } from "@/lib/papers/pdf-text";
import { minimalPdf, prose, type Run } from "@/lib/papers/minimal-pdf.test-helper";
import { seedFromExtractedDocument, usableInfoTitle } from "./features";

const BODY = [
  "Glacier meltwater sediment transport was traced through fictional outwash channels.",
  "Glacier meltwater sediment transport rose with discharge in every invented season.",
  "Suspended sediment load was sampled with turbidity sensors along the fictional channels.",
  "Glacier meltwater sediment transport stayed highest during the invented melt season.",
];
const INFO_TITLE = "Fictional study: glacier meltwater sediment transport";

/** Page 1: a title line in the body's 11 pt regular face, then the body. */
function sameSizeTitlePdf(infoTitle?: string): Buffer {
  const runs: Run[] = [["Fictional study of glacier meltwater sediment transport", 72, 80, 11], ...prose(BODY, 110)];
  return minimalPdf([runs], infoTitle === undefined ? {} : { infoTitle });
}

async function seedTitle(bytes: Buffer): Promise<string | undefined> {
  const extracted = await extractPdfTextFromBytes(bytes);
  if (!extracted.ok || !extracted.doc) throw new Error(`expected readable text, got ${extracted.reason}`);
  expect(extracted.doc.title ?? null).toBeNull(); // the layout gives no title: same size as the body
  return seedFromExtractedDocument(extracted.doc, bytes, undefined, extracted.infoTitle)?.title;
}

describe("R-T1 seed title from the PDF's Info /Title", () => {
  it("uses a non-generic Info /Title when the layout title is missing", async () => {
    expect(await seedTitle(sameSizeTitlePdf(INFO_TITLE))).toBe(INFO_TITLE);
  });
  it("keeps Untitled PDF when the PDF has no Info /Title or a generic one", async () => {
    expect(await seedTitle(sameSizeTitlePdf())).toBe("Untitled PDF");
    expect(await seedTitle(sameSizeTitlePdf("untitled"))).toBe("Untitled PDF");
    expect(await seedTitle(sameSizeTitlePdf("Microsoft Word - draft 3.docx"))).toBe("Untitled PDF");
  });
  it("prefers the layout title when there is one", async () => {
    const runs: Run[] = [["Fictional glacier meltwater pathways", 72, 80, 20, true], ...prose(BODY, 130)];
    const bytes = minimalPdf([runs], { infoTitle: INFO_TITLE });
    const extracted = await extractPdfTextFromBytes(bytes);
    if (!extracted.ok || !extracted.doc) throw new Error("expected readable text");
    expect(seedFromExtractedDocument(extracted.doc, bytes, undefined, extracted.infoTitle)?.title).toBe("Fictional glacier meltwater pathways");
  });
  it("refuses empty, generic, file-name-like and over-long Info titles", () => {
    for (const raw of [undefined, "", "   ", "untitled", "Untitled document", "unspecified", "Microsoft Word - fictional draft", "fictional-draft.pdf", "x".repeat(301)]) {
      expect(usableInfoTitle(raw)).toBeUndefined();
    }
    expect(usableInfoTitle("  Fictional study:\n glacier  meltwater ")).toBe("Fictional study: glacier meltwater");
    expect(usableInfoTitle("y".repeat(300))).toBe("y".repeat(300));
  });
});
