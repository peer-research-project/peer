// R-AUTH-PROV (2026-11-06) — which sign-in buttons the configured Supabase
// project supports. No network: every request goes to a stubbed `fetch`.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The client snapshot, as a mounted component reads it after hydration: the
// hook subscribes (which starts the one request) and reads the answer.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useSyncExternalStore: (subscribe: (listener: () => void) => () => void, getSnapshot: () => unknown) => {
      subscribe(() => {});
      return getSnapshot();
    },
  };
});

import {
  ALL_SIGN_IN_PROVIDERS,
  authSettingsUrl,
  currentSignInProviders,
  fetchSignInProviders,
  loadSignInProviders,
  parseSignInProviders,
  resetSignInProvidersForTests,
  signInProvidersToShow,
  useSignInProviders,
} from "./sign-in-providers";

const URL = "https://example-ref.supabase.co";
const KEY = "sb_publishable_test_key";

function settings(external: Record<string, unknown>) {
  return { external, disable_signup: false, mailer_autoconfirm: false };
}

function stubFetch(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return vi.fn(async () => ({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
  })) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

beforeEach(() => {
  resetSignInProvidersForTests();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", URL);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", KEY);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  resetSignInProvidersForTests();
});

describe("parseSignInProviders — rule 1: a provider is hidden only when the project reports it false", () => {
  it("both enabled -> both", () => {
    expect(parseSignInProviders(settings({ github: true, google: true, email: true }))).toEqual({ github: true, google: true });
  });

  it("google false -> GitHub only", () => {
    expect(parseSignInProviders(settings({ github: true, google: false }))).toEqual({ github: true, google: false });
  });

  it("github false -> Google only", () => {
    expect(parseSignInProviders(settings({ github: false, google: true }))).toEqual({ github: false, google: true });
  });

  it("a missing or odd value keeps that button (only an explicit false hides)", () => {
    expect(parseSignInProviders(settings({ google: false }))).toEqual({ github: true, google: false });
    expect(parseSignInProviders(settings({ github: "no", google: null }))).toEqual({ github: true, google: true });
  });
});

describe("fetchSignInProviders — the public settings request", () => {
  it("asks the project's /auth/v1/settings with the public key as apikey", async () => {
    const fetchImpl = stubFetch(settings({ github: true, google: false }));
    expect(await fetchSignInProviders(`${URL}/`, KEY, fetchImpl)).toEqual({ github: true, google: false });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(`${URL}/auth/v1/settings`, { headers: { apikey: KEY } });
    expect(authSettingsUrl(URL)).toBe(`${URL}/auth/v1/settings`);
  });

  it("asks nothing when Supabase is not configured", async () => {
    const fetchImpl = stubFetch(settings({}));
    expect(await fetchSignInProviders(undefined, KEY, fetchImpl)).toBeNull();
    expect(await fetchSignInProviders(URL, undefined, fetchImpl)).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("the page-load answer — read once, shared by every set of buttons", () => {
  it("one request however many buttons subscribe, then the answer for all of them", async () => {
    const fetchImpl = stubFetch(settings({ github: true, google: false }));
    vi.stubGlobal("fetch", fetchImpl);
    useSignInProviders();
    useSignInProviders();
    await loadSignInProviders();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(`${URL}/auth/v1/settings`, { headers: { apikey: KEY } });
    expect(currentSignInProviders()).toEqual({ github: true, google: false });
    expect(useSignInProviders()).toEqual({ github: true, google: false });
    expect(signInProvidersToShow(useSignInProviders())).toEqual({ github: true, google: false });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("falls back to the anon key when there is no publishable key", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", undefined as unknown as string);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "eyJ-anon");
    const fetchImpl = stubFetch(settings({ github: true, google: true }));
    await loadSignInProviders(fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith(`${URL}/auth/v1/settings`, { headers: { apikey: "eyJ-anon" } });
    expect(currentSignInProviders()).toEqual(ALL_SIGN_IN_PROVIDERS);
  });
});
