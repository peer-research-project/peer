// GET /api/papers/upload/[id] — the reading page's cold-load/reload path for
// an uploaded paper (`[id]` here is the bare hash16, not the `upload:`-
// prefixed id the rest of the app uses — see `papers/[id]/page.tsx`'s
// `isUploadId` branch, which strips the prefix before calling this route).

import { NextResponse } from "next/server";
import { isValidHash16, deleteUpload, hasOtherReadyDocumentCopy, uploadFileExists, uploadMetaToPaper } from "@/lib/papers/upload-store";
import { ownedUpload, PRIVATE_UPLOAD_HEADERS, sameOriginUploadRequest } from "@/lib/papers/upload-access";

// W8 R-H1: every answer from this route concerns one owner's private upload
// (or its absence), so every answer — including each early refusal — goes
// out with the private, no-store header set. One helper so no early return
// can drop them.
function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_UPLOAD_HEADERS });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isValidHash16(id)) {
    return privateJson({ error: "Not a valid upload id." }, 400);
  }

  const meta = await ownedUpload(id);
  if (!meta) {
    return privateJson({ error: "Upload not found." }, 404);
  }

  // UPLOAD-404 (§1bi.8a): the record and the PDF bytes are two separate
  // files (upload-store.ts) — a crash can in principle leave one without
  // the other. Only the file-bytes route checked for the bytes before this;
  // a reader whose record was fine but whose file was separately gone got a
  // normal-looking page with a "retained for 30 days" claim and an "Open
  // the source" action that 404s in raw JSON. Additive field, everything
  // else about this response unchanged, so the page can tell the two states
  // apart and treat both honestly.
  return privateJson({ ...uploadMetaToPaper(meta), fileAvailable: await uploadFileExists(id) });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOriginUploadRequest(req)) return privateJson({ error: "Cross-site deletion refused." }, 403);
  const { id } = await params;
  const meta = isValidHash16(id) ? await ownedUpload(id) : null;
  if (!meta) return privateJson({ error: "Upload not found." }, 404);
  // 9-22 (A9-02): count this owner's OTHER still-live copies of the same
  // logical document BEFORE deleting this one — the exact A9-02 over-erasure
  // repro was deleting one of two same-DOI copies and losing the only
  // preference-ledger evidence for a document the owner still has a live
  // copy of. `meta.ownerKey` is guaranteed set here (ownedUpload only
  // returns a match), but guarded anyway for a mocked/legacy caller shape.
  const retractEvidence = meta.ownerKey
    ? !(await hasOtherReadyDocumentCopy(meta.ownerKey, meta.documentKey, meta.hash16))
    : true;
  await deleteUpload(meta);
  return privateJson({ deleted: true, documentKey: meta.documentKey, retractEvidence });
}
