import { NextResponse } from "next/server";
import { seedRequestContext } from "@/lib/seed-pool/auth";
import { PRIVATE_UPLOAD_HEADERS, sameOriginUploadRequest } from "@/lib/papers/upload-access";
export const dynamic = "force-dynamic";
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: PRIVATE_UPLOAD_HEADERS });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function GET() {
  const context = await seedRequestContext();
  if (context.status !== "ready") return context.status === "unauthenticated" ? reply({ error: "Sign in to manage seed papers." }, 401) : reply({ error: "Seed papers are unavailable." }, 503);
  const installed = await context.repo.installed();
  if (installed !== "yes") return reply({ error: "Seed papers are unavailable." }, 503);
  const result = await context.repo.editor(context.ownerId);
  return result && result.status !== "unavailable" ? reply({ ...result, schemaInstalled: true }) : reply({ error: "Seed papers are unavailable." }, 503);
}
/** Accept IDs of already-owned staged assets, never client feature JSON. */
export async function PUT(req: Request) {
  if (!sameOriginUploadRequest(req)) return reply({ error: "Cross-site request refused." }, 403);
  const context = await seedRequestContext();
  if (context.status !== "ready") return context.status === "unauthenticated" ? reply({ error: "Sign in to manage seed papers." }, 401) : reply({ error: "Seed papers are unavailable." }, 503);
  let body: unknown;
  try { body = await req.json(); } catch { return reply({ error: "Invalid request." }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return reply({ error: "Invalid request." }, 400);
  const value = body as Record<string, unknown>;
  if (!Number.isSafeInteger(value.expectedRevision) || (value.expectedRevision as number) < 0 || !Array.isArray(value.seedIds) || value.seedIds.length > 5 || !value.seedIds.every((id) => typeof id === "string" && uuid.test(id)) || (value.undo !== undefined && typeof value.undo !== "boolean")) return reply({ error: "Invalid request." }, 400);
  const result = await context.repo.apply(context.ownerId, value.expectedRevision as number, value.seedIds as string[], value.undo === true);
  if (!result) return reply({ error: "Seed papers are unavailable." }, 503);
  if (result.status === "stale_revision") return reply(result, 409);
  if (result.status !== "ok") return reply(result, result.status === "unavailable" ? 503 : 400);
  return reply(result);
}
