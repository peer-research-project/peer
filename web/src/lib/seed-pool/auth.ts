import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SeedPoolRepository } from "./repository";
type Context = { status: "ready"; ownerId: string; repo: SeedPoolRepository } | { status: "unauthenticated" | "unavailable" };
/** Only an authenticated session supplies the UUID; never accept it from JSON. */
export async function seedRequestContext(): Promise<Context> {
  try {
    const client = await createClient();
    const { data: { user }, error } = await client.auth.getUser();
    if (error) return { status: "unavailable" };
    if (!user) return { status: "unauthenticated" };
    return { status: "ready", ownerId: user.id, repo: new SeedPoolRepository(createAdminClient()) };
  } catch { return { status: "unavailable" }; }
}
