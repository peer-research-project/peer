import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { extractPdfTextFromBytes } from "@/lib/papers/pdf-text";
import { hostedUploadsEnabled, PRIVATE_UPLOAD_HEADERS, sameOriginUploadRequest, UPLOAD_RIGHTS_VERSION } from "@/lib/papers/upload-access";
import { isOwnStagedUpload, readStagedUpload, removeStagedUpload } from "@/lib/papers/upload-store";
import { uploadBackend } from "@/lib/papers/upload-backend";
import { seedRequestContext } from "@/lib/seed-pool/auth";
import { seedFromExtractedDocument, verifiedPublicDoi } from "@/lib/seed-pool/features";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
const MAX_BYTES = 25 * 1024 * 1024;
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: PRIVATE_UPLOAD_HEADERS });
export async function POST(req: Request) {
  if (!sameOriginUploadRequest(req)) return reply({ error: "Cross-site request refused." }, 403);
  if (!hostedUploadsEnabled()) return reply({ error: "Private PDF storage is unavailable." }, 503);
  const context = await seedRequestContext();
  if (context.status !== "ready") return context.status === "unauthenticated" ? reply({ error: "Sign in to upload seed papers." }, 401) : reply({ error: "Seed papers are unavailable." }, 503);
  const ownerKey = createHash("sha256").update(`account:${context.ownerId}`).digest("hex");
  let stagedName: string | undefined;
  try {
    const resolved = await context.repo.resolve(context.ownerId);
    if (!resolved || resolved.status === "unavailable") return reply({ error: "Seed papers are unavailable." }, 503);
    const generation = resolved.revocationGeneration;
    const contentLength = req.headers.get("content-length");
    if (contentLength !== null && Number(contentLength) > MAX_BYTES + 65536) return reply({ error: "That PDF is larger than 25 MB." }, 413);
    let form: FormData;
    try { form = await req.formData(); } catch { return reply({ error: "Expected a PDF upload." }, 400); }
    if (form.get("rightsVersion") !== UPLOAD_RIGHTS_VERSION) return reply({ error: "Confirm that you are authorized to store and process this PDF." }, 400);
    const file = form.get("file"); const staged = form.get("staged");
    let bytes: Buffer;
    if (file instanceof File) {
      if (file.size > MAX_BYTES) return reply({ error: "That PDF is larger than 25 MB." }, 413);
      bytes = Buffer.from(await file.arrayBuffer());
    } else if (typeof staged === "string" && isOwnStagedUpload(ownerKey, staged)) {
      stagedName = staged;
      const read = await readStagedUpload(ownerKey, staged);
      if (!read) return reply({ error: "No PDF file was attached." }, 400);
      bytes = read;
    } else return reply({ error: "No PDF file was attached." }, 400);
    if (bytes.length > MAX_BYTES) return reply({ error: "That PDF is larger than 25 MB." }, 413);
    if (bytes.subarray(0, 5).toString("ascii") !== "%PDF-") return reply({ error: "That file is not a PDF." }, 415);
    const extracted = await extractPdfTextFromBytes(bytes);
    if (!extracted.ok || !extracted.doc) return reply({ error: "This PDF has no readable text. Choose another paper." }, 422);
    const firstPageDoi = extracted.page1Text?.match(/\b10\.\d{4,9}\/[\w.()/:;-]+/i)?.[0];
    const doi = await verifiedPublicDoi(firstPageDoi, extracted.doc.title ?? "");
    const paper = seedFromExtractedDocument(extracted.doc, bytes, doi);
    if (!paper) return reply({ error: "This PDF has no readable text or usable research terms. Choose another paper." }, 422);
    // Separate namespace: ordinary reading deletion/30-day purge cannot remove this copy.
    const objectName = `seed-pool/${ownerKey}/${paper.id}.pdf`;
    if (!await context.repo.stageAsset(context.ownerId, paper, objectName, generation)) return reply({ error: "The pool changed while processing. Try again." }, 409);
    let writeConfirmed = false;
    try {
      await uploadBackend().write(objectName, bytes, "application/pdf");
      writeConfirmed = true;
      if (!await context.repo.finishAsset(context.ownerId, paper.id)) throw new Error("seed asset commit failed");
    } catch {
      // An uncertain remote write may still finish; preserve its staging row
      // instead of claiming cleanup succeeded or allowing an unsafe retry.
      if (writeConfirmed) {
        try { await uploadBackend().remove([objectName]); await context.repo.removeAssetRecord(context.ownerId, paper.id, "staging"); } catch { /* retained for cleanup */ }
      }
      return reply({ error: "Could not store this seed paper. Try again." }, 503);
    }
    return reply({ paper });
  } catch { return reply({ error: "Could not process this seed paper. Try again." }, 503); }
  finally { if (stagedName) await removeStagedUpload(ownerKey, stagedName).catch(() => undefined); }
}
