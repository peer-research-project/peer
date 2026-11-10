"use client";
import { supabase } from "@/lib/supabase/client";
import { UPLOAD_RIGHTS_VERSION } from "@/lib/papers/upload-policy";
import type { SeedPaper, SeedPoolResolution, SeedSnapshot } from "./types";
export type SeedPoolEditor = SeedPoolResolution & { pending?: SeedSnapshot; availableAssets: SeedPaper[]; cleanupPending: Array<{ id: string }> };
export class SeedPoolRequestError extends Error {
  constructor(message: string, public readonly status: number, public readonly detail: unknown) { super(message); }
}
async function json<T>(response: Response): Promise<T> {
  const value: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = value && typeof value === "object" && "error" in value ? String((value as { error: unknown }).error) : "Seed papers are unavailable. Try again.";
    throw new SeedPoolRequestError(error, response.status, value);
  }
  return value as T;
}
export async function getSeedPool(): Promise<SeedPoolEditor> { return json(await fetch("/api/seed-pool", { cache: "no-store" })); }
export async function saveSeedPool(expectedRevision: number, seedIds: string[], undo = false): Promise<{ status: string; revision: number; effectiveLocalDate?: string }> {
  return json(await fetch("/api/seed-pool", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedRevision, seedIds, undo }) }));
}
/** Confirm rights in the UI before invoking this helper. */
export async function uploadSeedPaper(file: File): Promise<SeedPaper> {
  const ticket = await json<{ mode: "form" } | { mode: "direct"; bucket: string; path: string; token: string }>(await fetch("/api/papers/upload/ticket", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ size: file.size }) }));
  const form = new FormData(); form.set("rightsVersion", UPLOAD_RIGHTS_VERSION);
  if (ticket.mode === "direct") {
    if (!supabase) throw new SeedPoolRequestError("Private storage is unavailable.", 503, null);
    const pdf = new File([file], file.name, { type: "application/pdf" });
    const { error } = await supabase.storage.from(ticket.bucket).uploadToSignedUrl(ticket.path, ticket.token, pdf);
    if (error) throw new SeedPoolRequestError("Upload failed. Try again.", 503, null);
    form.set("staged", ticket.path);
  } else form.set("file", file);
  const result = await json<{ paper: SeedPaper }>(await fetch("/api/seed-pool/assets", { method: "POST", body: form }));
  return result.paper;
}
export async function forgetSeedPaper(id: string, expectedRevision: number): Promise<{ status: string; revision: number }> {
  return json(await fetch(`/api/seed-pool/assets/${encodeURIComponent(id)}`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedRevision }) }));
}
