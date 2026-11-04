import { createHash, randomUUID } from "node:crypto";
import type { ExtractedDocument } from "@/lib/papers/html-text";
import { hasReadableText } from "@/lib/papers/readability";
import { extractUploadConcepts } from "@/lib/preferences/upload-concepts";
import { normalizePreferenceLabel } from "@/lib/preferences/ledger";
import type { SeedPaper } from "./types";

/** A public DOI may be checked against Crossref using the DOI alone. */
export async function verifiedPublicDoi(rawDoi: string | undefined, extractedTitle: string): Promise<string | undefined> {
  const doi = rawDoi?.trim().replace(/[.,;:)\]]+$/, "").toLowerCase();
  if (!doi || !/^10\.\d{4,9}\/[\w.()/:;-]+$/i.test(doi) || !extractedTitle.trim()) return undefined;
  try {
    const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, { redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(2500), headers: { Accept: "application/json" } });
    if (!res.ok || Number(res.headers.get("content-length")) > 256_000 || !res.body) return undefined;
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = []; let length = 0;
    try {
      while (true) {
        const part = await reader.read(); if (part.done) break;
        length += part.value.length;
        if (length > 256_000) { await reader.cancel(); return undefined; }
        chunks.push(part.value);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const body = JSON.parse(new TextDecoder().decode(bytes)) as { message?: { DOI?: string; title?: string[] } };
    const returned = body.message?.DOI?.toLowerCase();
    const title = body.message?.title?.[0];
    if (returned !== doi || !title) return undefined;
    const expected = normalizePreferenceLabel(extractedTitle);
    const actual = normalizePreferenceLabel(title);
    return expected.split(" ").length >= 3 && expected === actual ? doi : undefined;
  } catch { return undefined; }
}
/**
 * R-C18: research boilerplate that says nothing about what a paper is about.
 * Applied only when a seed is created (ordinary upload concepts are
 * unchanged): a label containing one of these phrases, or made only of these
 * words, never becomes a seed facet, so it can neither score nor be named in
 * a recommendation reason.
 */
/**
 * R-C6d (W21, 2026-11-04): generic experimental-condition phrases. "Measured
 * under identical conditions" says how a study was run, not what it is about.
 * A closed list, matched as whole phrases: domain terms such as "standard
 * conditions", "boundary conditions", "initial conditions" and "reaction
 * conditions" are not on it and stay facets.
 */
export const SEED_CONDITION_PHRASES: readonly string[] = [
  "identical conditions", "same conditions", "similar conditions", "experimental conditions", "different conditions",
];
export const SEED_BOILERPLATE_PHRASES: readonly string[] = [
  "test data", "real experiment", "synthetic example", "this paper", "this study",
  "our results", "real data", "toy example", "example data",
  ...SEED_CONDITION_PHRASES,
];
const SEED_BOILERPLATE_WORDS = new Set([
  "test", "data", "real", "experiment", "experiments", "synthetic", "example", "examples",
  "this", "paper", "study", "result", "results",
]);
export function isSeedBoilerplate(label: string): boolean {
  const words = label.toLowerCase().split(/\s+/).filter(Boolean);
  const padded = ` ${words.join(" ")} `;
  return words.length > 0 && (words.every((word) => SEED_BOILERPLATE_WORDS.has(word))
    || SEED_BOILERPLATE_PHRASES.some((phrase) => padded.includes(` ${phrase} `)));
}

/**
 * R-T1 (W9, 2026-11-04): the PDF's Info /Title, when it names the paper. A
 * title line set in the body's own size gives no layout title (`doc.title`);
 * the Info /Title then stands in, unless it is empty, longer than 300
 * characters, or generic: "untitled…", "unspecified", a "Microsoft Word - …"
 * stamp, or a file name ("draft.pdf"). Otherwise nothing: the seed keeps
 * "Untitled PDF" and no title is ever invented.
 */
export function usableInfoTitle(raw: string | undefined): string | undefined {
  const title = raw?.replace(/\p{Cc}+/gu, " ").replace(/\s+/g, " ").trim();
  if (!title || title.length > 300) return undefined;
  if (/^(?:untitled\b|unspecified$|unknown$|microsoft\s+(?:word|powerpoint|excel)\s+-)/i.test(title)) return undefined;
  if (/\.(?:pdf|docx?|odt|rtf|tex|dvi|ps|pptx?)$/i.test(title)) return undefined;
  return title;
}

/** A seed requires actual readable body text and at least one extracted facet. */
export function seedFromExtractedDocument(doc: ExtractedDocument, bytes: Buffer, verifiedDoi?: string, infoTitle?: string): SeedPaper | null {
  const body = doc.sections.map((section) => section.text ?? "").join(" ");
  if (!hasReadableText(body)) return null;
  const features: SeedPaper["features"] = { topic: [], object: [], method: [] };
  for (const concept of extractUploadConcepts(doc)) {
    if (isSeedBoilerplate(concept.label)) continue;
    const facet = concept.facet === "method" ? "method" : concept.facet === "material" ? "object" : "topic";
    if (!features[facet].includes(concept.label)) features[facet].push(concept.label);
  }
  if (!features.topic.length && !features.object.length && !features.method.length) return null;
  const id = randomUUID();
  const normalizedDoi = verifiedDoi?.toLowerCase();
  const contentHash = createHash("sha256").update(bytes).digest("hex");
  return {
    id, uploadId: `seed:${id}`, contentHash, title: doc.title?.trim() || usableInfoTitle(infoTitle) || "Untitled PDF",
    canonicalKey: normalizedDoi ? `doi:${normalizedDoi}` : `sha256:${contentHash}`,
    features, ...(normalizedDoi ? { publicIds: { doi: normalizedDoi } } : {}),
  };
}
