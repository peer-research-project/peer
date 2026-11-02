import type { ResolveSeedPoolOptions, SeedPoolResolution } from "./types";

/** Server-only entry point. The owner is derived by the authenticated caller. */
export async function resolveSeedPool(_ownerId: string, _options: ResolveSeedPoolOptions = {}): Promise<SeedPoolResolution> {
  // Until the durable owner repository is available, fail closed. No caller
  // may interpret a storage failure as an empty pool or accept client seeds.
  return { status: "unavailable", ownerLocalDate: null, timezone: null, snapshot: null, revision: null };
}
