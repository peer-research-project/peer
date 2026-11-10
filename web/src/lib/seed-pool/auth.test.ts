import { AuthApiError, AuthRetryableFetchError, AuthSessionMissingError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), createClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

import { seedRequestContext } from "./auth";
import { GET } from "@/app/api/seed-pool/route";

// W8 R-H2 (W6 O3): an anonymous request must resolve as signed-out, while a
// real auth/backend failure still resolves as unavailable.
describe("seedRequestContext (W8 R-H2)", () => {
  beforeEach(() => {
    mocks.getUser.mockReset();
    mocks.createClient.mockReset();
    mocks.createClient.mockResolvedValue({ auth: { getUser: mocks.getUser } });
  });

  it("no session (AuthSessionMissingError) resolves as unauthenticated", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: new AuthSessionMissingError() });
    await expect(seedRequestContext()).resolves.toEqual({ status: "unauthenticated" });
  });

  it("a null user with no error resolves as unauthenticated", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(seedRequestContext()).resolves.toEqual({ status: "unauthenticated" });
  });

  it("an auth API failure resolves as unavailable", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: new AuthApiError("invented upstream failure", 500, "unexpected_failure") });
    await expect(seedRequestContext()).resolves.toEqual({ status: "unavailable" });
  });

  it("a network failure resolves as unavailable", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: new AuthRetryableFetchError("invented fetch failure", 0) });
    await expect(seedRequestContext()).resolves.toEqual({ status: "unavailable" });
  });

  it("a plain error that merely mimics the message is still unavailable", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: new Error("Auth session missing!") });
    await expect(seedRequestContext()).resolves.toEqual({ status: "unavailable" });
  });

  it("a thrown client failure resolves as unavailable", async () => {
    mocks.createClient.mockRejectedValue(new Error("invented cookie failure"));
    await expect(seedRequestContext()).resolves.toEqual({ status: "unavailable" });
  });

  it("a signed-in user resolves as ready for that owner", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "5eed0000-0000-4000-8000-00000000f00d" } }, error: null });
    const context = await seedRequestContext();
    expect(context.status).toBe("ready");
    expect(context.status === "ready" && context.ownerId).toBe("5eed0000-0000-4000-8000-00000000f00d");
  });

  it("GET /api/seed-pool answers an anonymous request 401 Sign in, privately", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: new AuthSessionMissingError() });
    const response = await GET();
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Sign in to manage seed papers." });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
