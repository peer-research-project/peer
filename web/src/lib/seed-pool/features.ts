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
/** A seed requires actual readable body text and at least one extracted facet. */
export function seedFromExtractedDocument(doc: ExtractedDocument, bytes: Buffer, verifiedDoi?: string): SeedPaper | null {
  const body = doc.sections.map((section) => section.text ?? "").join(" ");
  if (!hasReadableText(body)) return null;
  const features: SeedPaper["features"] = { topic: [], object: [], method: [] };
  for (const concept of extractUploadConcepts(doc)) {
    const facet = concept.facet === "method" ? "method" : concept.facet === "material" ? "object" : "topic";
    if (!features[facet].includes(concept.label)) features[facet].push(concept.label);
  }
  if (!features.topic.length && !features.object.length && !features.method.length) return null;
  const id = randomUUID();
  const normalizedDoi = verifiedDoi?.toLowerCase();
  return {
    id, uploadId: `seed:${id}`, title: doc.title?.trim() || "Untitled PDF",
    canonicalKey: normalizedDoi ? `doi:${normalizedDoi}` : `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    features, ...(normalizedDoi ? { publicIds: { doi: normalizedDoi } } : {}),
  };
}
