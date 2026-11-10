import { isAuthSessionMissingError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SeedPoolRepository } from "./repository";
type Context = { status: "ready"; ownerId: string; repo: SeedPoolRepository } | { status: "unauthenticated" | "unavailable" };
/** Only an authenticated session supplies the UUID; never accept it from JSON. */
export async function seedRequestContext(): Promise<Context> {
  try {
    const client = await createClient();
    const { data: { user }, error } = await client.auth.getUser();
    // W8 R-H2: with no session at all, auth-js answers getUser() with an
    // AuthSessionMissingError rather than `{ user: null }`. That is a
    // signed-out reader, not a broken backend — they get "Sign in…", not
    // "unavailable". Any other auth/backend error still maps to unavailable.
    if (error) return isAuthSessionMissingError(error) ? { status: "unauthenticated" } : { status: "unavailable" };
    if (!user) return { status: "unauthenticated" };
    return { status: "ready", ownerId: user.id, repo: new SeedPoolRepository(createAdminClient()) };
  } catch { return { status: "unavailable" }; }
}
