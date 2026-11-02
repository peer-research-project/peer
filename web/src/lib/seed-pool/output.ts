import type { SeedPoolResolution, SeedSnapshot } from "./types";

export type SeedOutputContext =
  | { kind: "legacy" }
  | { kind: "ready"; localDate: string; version: string; revocationGeneration: number; snapshot: SeedSnapshot | null }
  | { kind: "unavailable" };

/** Refuse ambiguous storage or dates; only a specifically absent schema may use legacy output. */
export function seedOutputContext(resolution: SeedPoolResolution & { schemaInstalled?: boolean | null }, targetLocalDate?: string): SeedOutputContext {
  if (resolution.status === "none" && resolution.schemaInstalled === false) return { kind: "legacy" };
  if (resolution.schemaInstalled !== true || resolution.status === "unavailable" || !resolution.timezone || !resolution.ownerLocalDate) return { kind: "unavailable" };
  const date = targetLocalDate ?? resolution.ownerLocalDate;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isSafeInteger(resolution.revocationGeneration) || resolution.revocationGeneration < 0) return { kind: "unavailable" };
  if (resolution.status === "ready" && (!resolution.snapshot?.version || !resolution.snapshot.seeds.length)) return { kind: "unavailable" };
  return { kind: "ready", localDate: date, version: resolution.snapshot?.version ?? "none", revocationGeneration: resolution.revocationGeneration, snapshot: resolution.snapshot };
}
