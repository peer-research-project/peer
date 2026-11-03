import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadBackend } from "@/lib/papers/upload-backend";
import { SeedPoolRepository } from "./repository";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Best-effort cron cleanup. Revocation always precedes storage deletion. */
export async function purgeSeedOrphans(): Promise<void> {
  const repo = new SeedPoolRepository(createAdminClient());
  const installed = await repo.installed();
  if (installed === "missing") return;
  if (installed !== "yes") throw new Error("seed cleanup unavailable");
  const entries = await repo.claimCleanup();
  if (!entries) throw new Error("seed cleanup unavailable");
  let failed = false;
  for (const entry of entries) {
    const ownerKey = createHash("sha256").update(`account:${entry.ownerId}`).digest("hex");
    if (!uuid.test(entry.id) || !uuid.test(entry.ownerId) || entry.objectName !== `seed-pool/${ownerKey}/${entry.id}.pdf`) { failed = true; continue; }
    try {
      await uploadBackend().remove([entry.objectName]);
      if (!await repo.markRevokedCleanupComplete(entry.ownerId, [entry.id])) failed = true;
    } catch { failed = true; }
  }
  if (failed) throw new Error("seed cleanup incomplete");
}
