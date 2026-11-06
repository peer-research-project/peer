// R-AUTH-PROV (2026-11-06) — which sign-in buttons the configured Supabase
// project supports. No network: every request goes to a stubbed `fetch`.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The client snapshot, as a mounted component reads it after hydration: the
// hook subscribes (which starts the one request) and reads the answer.
// The server snapshot the hook hands React is kept, so the server render (and
// the hydrating first client render) can be checked too.
const store = vi.hoisted(() => ({ serverSnapshot: null as null | (() => unknown) }));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useSyncExternalStore: (
      subscribe: (listener: () => void) => () => void,
      getSnapshot: () => unknown,
      getServerSnapshot: () => unknown,
    ) => {
      store.serverSnapshot = getServerSnapshot;
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

describe("rule 2 — unknown or unreadable keeps today's two buttons", () => {
  it("loading: before the answer arrives the buttons are both, and the server render reads unknown", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    expect(useSignInProviders()).toBeNull();
    expect(signInProvidersToShow(useSignInProviders())).toEqual({ github: true, google: true });
    expect(signInProvidersToShow(null)).toEqual(ALL_SIGN_IN_PROVIDERS);
  });

  it("the server render and the hydrating first render read unknown, even once the answer is known", async () => {
    vi.stubGlobal("fetch", stubFetch(settings({ github: true, google: false })));
    await loadSignInProviders();
    expect(useSignInProviders()).toEqual({ github: true, google: false });
    expect(store.serverSnapshot?.()).toBeNull();
    expect(signInProvidersToShow(store.serverSnapshot?.() as null)).toEqual({ github: true, google: true });
  });

  it("a request that throws (offline, CORS, DNS) is unknown, never a rejection", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    await expect(fetchSignInProviders(URL, KEY, fetchImpl)).resolves.toBeNull();
    vi.stubGlobal("fetch", fetchImpl);
    await expect(loadSignInProviders()).resolves.toBeUndefined();
    expect(currentSignInProviders()).toBeNull();
    expect(signInProvidersToShow(useSignInProviders())).toEqual({ github: true, google: true });
  });

  it("a non-2xx answer is unknown, even when its body looks like settings", async () => {
    for (const status of [401, 404, 500]) {
      const fetchImpl = stubFetch(settings({ github: false, google: false }), { ok: false, status });
      expect(await fetchSignInProviders(URL, KEY, fetchImpl), String(status)).toBeNull();
    }
  });

  it("a body that is not the settings JSON (or will not parse) is unknown", async () => {
    for (const body of [null, "nope", {}, { external: "on" }, { msg: "Invalid API key" }]) {
      expect(await fetchSignInProviders(URL, KEY, stubFetch(body)), JSON.stringify(body)).toBeNull();
    }
    const unparsable = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token <");
      },
    })) as unknown as typeof fetch;
    expect(await fetchSignInProviders(URL, KEY, unparsable)).toBeNull();
  });
});

describe("rule 3 — the one sentence, only when no provider is on", () => {
  it("is the ruled wording", async () => {
    const { SIGN_IN_NOT_SET_UP } = await import("./sign-in-providers");
    expect(SIGN_IN_NOT_SET_UP).toBe("Sign-in is not set up on this copy of Peer.");
  });

  it("none enabled is the only case that draws it", async () => {
    const { noSignInProvider } = await import("./sign-in-providers");
    expect(noSignInProvider(signInProvidersToShow(parseSignInProviders(settings({ github: false, google: false }))))).toBe(true);
    expect(noSignInProvider(signInProvidersToShow(parseSignInProviders(settings({ github: true, google: false }))))).toBe(false);
    expect(noSignInProvider(signInProvidersToShow(parseSignInProviders(settings({ github: false, google: true }))))).toBe(false);
    expect(noSignInProvider(signInProvidersToShow(null))).toBe(false);
  });
});
