import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { PRIVATE_UPLOAD_HEADERS, sameOriginUploadRequest } from "@/lib/papers/upload-access";
import { uploadBackend } from "@/lib/papers/upload-backend";
import { seedRequestContext } from "@/lib/seed-pool/auth";
export const dynamic = "force-dynamic";
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: PRIVATE_UPLOAD_HEADERS });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOriginUploadRequest(req)) return reply({ error: "Cross-site request refused." }, 403);
  const context = await seedRequestContext();
  if (context.status !== "ready") return context.status === "unauthenticated" ? reply({ error: "Sign in to manage seed papers." }, 401) : reply({ error: "Seed papers are unavailable." }, 503);
  const { id } = await params;
  if (!uuid.test(id)) return reply({ error: "Invalid seed." }, 400);
  let body: unknown;
  try { body = await req.json(); } catch { return reply({ error: "Invalid request." }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body) || !Number.isSafeInteger((body as Record<string, unknown>).expectedRevision) || Number((body as Record<string, unknown>).expectedRevision) < 0) return reply({ error: "Invalid request." }, 400);
  const result = await context.repo.forget(context.ownerId, Number((body as Record<string, unknown>).expectedRevision), id);
  if (!result) return reply({ error: "Seed papers are unavailable." }, 503);
  if (result.status === "stale_revision") return reply(result, 409);
  if (result.status === "not_found") return reply({ error: "Seed paper not found." }, 404);
  if (result.status !== "revoked" || !Array.isArray(result.objects)) return reply({ error: "Seed papers are unavailable." }, 503);
  // Revocation and snapshot scrub already committed under the owner lock.
  // Keep tombstones on any storage failure; a retry resumes cleanup.
  if (result.objects.some((entry) => !entry || typeof entry !== "object" || entry.writerSettled !== true || typeof entry.cleanupAfter !== "string" || !Number.isFinite(Date.parse(entry.cleanupAfter)) || Date.parse(entry.cleanupAfter) > Date.now())) return reply({ status: "cleanup_pending", revision: result.revision }, 503);
  const ownerKey = createHash("sha256").update(`account:${context.ownerId}`).digest("hex");
  try {
    for (const entry of result.objects) {
      if (!entry || typeof entry !== "object" || typeof entry.id !== "string" || !uuid.test(entry.id) || entry.objectName !== `seed-pool/${ownerKey}/${entry.id}.pdf`) throw new Error("invalid cleanup object");
      await uploadBackend().remove([entry.objectName]);
    }
    // Mark tombstones complete only after every object is gone, so a partial cleanup can retry.
    if (!await context.repo.markRevokedCleanupComplete(context.ownerId, result.objects.map((entry) => entry.id))) throw new Error("cleanup record failed");
  } catch { return reply({ status: "cleanup_pending", revision: result.revision }, 503); }
  return reply({ status: "forgotten", revision: result.revision, revocationGeneration: result.revocationGeneration });
}
