import type { SeedPaper, SeedPoolResolution } from "./types";
import { createAdminClient } from "@/lib/supabase/admin";

/** These service-role operations are never exposed to browsers directly. */
type Admin = ReturnType<typeof createAdminClient>;
type DbError = { code?: string; message?: string };
export function isMissingSeedTable(error: DbError | null): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205";
}
export type SeedRpcOutcome = { status: string; [key: string]: unknown };
export class SeedPoolRepository {
  constructor(private readonly db: Admin) {}
  async installed(): Promise<"yes" | "missing" | "unavailable"> {
    try {
      const { error } = await this.db.from("seed_pool_state").select("owner_id").limit(1);
      return error ? (isMissingSeedTable(error) ? "missing" : "unavailable") : "yes";
    } catch { return "unavailable"; }
  }
  private async rpc(name: string, args: Record<string, unknown>): Promise<SeedRpcOutcome | null> {
    try {
      const { data, error } = await this.db.rpc(name, args);
      if (error || !data || typeof data !== "object" || Array.isArray(data) || typeof data.status !== "string") return null;
      return data as SeedRpcOutcome;
    } catch { return null; }
  }
  async resolve(ownerId: string, targetLocalDate?: string, now?: Date): Promise<SeedPoolResolution | null> {
    const data = await this.rpc("seed_pool_resolve", { p_owner_id: ownerId, p_target_date: targetLocalDate ?? null, p_now: now?.toISOString() ?? null });
    if (!data || !["ready", "none", "unavailable"].includes(data.status)) return null;
    return data as unknown as SeedPoolResolution;
  }
  async apply(ownerId: string, expectedRevision: number, seedIds: string[], undo = false): Promise<SeedRpcOutcome | null> {
    return this.rpc("seed_pool_apply", { p_owner_id: ownerId, p_expected_revision: expectedRevision, p_seed_ids: seedIds, p_undo: undo });
  }
  async forget(ownerId: string, expectedRevision: number, seedId: string): Promise<SeedRpcOutcome | null> {
    return this.rpc("seed_pool_forget", { p_owner_id: ownerId, p_expected_revision: expectedRevision, p_seed_id: seedId });
  }
  async registerAsset(ownerId: string, paper: SeedPaper, objectName: string): Promise<boolean> {
    try {
      const { error } = await this.db.from("seed_pool_assets").insert({ id: paper.id, owner_id: ownerId, upload_id: paper.uploadId, canonical_key: paper.canonicalKey, title: paper.title, features: paper.features, public_ids: paper.publicIds ?? {}, object_name: objectName, status: "ready" });
      return !error;
    } catch { return false; }
  }
  async outputFence(name: "seed_pool_mark_batch_served" | "seed_pool_put_prepared_batch" | "seed_pool_ack_batch", args: Record<string, unknown>): Promise<SeedRpcOutcome | null> {
    return this.rpc(name, args);
  }
}
