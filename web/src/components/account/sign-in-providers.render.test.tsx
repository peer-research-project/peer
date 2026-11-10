// R-AUTH-PROV (2026-11-06) — every set of sign-in buttons draws only the
// providers the configured Supabase project has on: the You page's Account
// section, the welcome wizard's Account and AI steps, and the signed-out seed
// pool. House pattern: renderToStaticMarkup, no clicks, no network (the one
// settings request goes to a stubbed `fetch`).
//
// React's server render always reads the hook's server snapshot (unknown), so
// this file stands in for the mounted client: `useSyncExternalStore` returns
// the client snapshot, as it does once the page has hydrated.

import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

// The seed pool reads the account from the sync gate; signed out here.
vi.mock("@/components/profile-sync", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useSyncGate: (select: (state: { authOutcome: string; authUserId: string | null }) => unknown) =>
    select({ authOutcome: "signed-out", authUserId: null }),
}));

import { createHash } from "node:crypto";
import { AccountSectionView, SignInButtonsView, type AccountSectionViewProps } from "./account-section";
import { AccountStepView, SignInToUseKeyView } from "@/app/welcome/account-step";
import { SeedPool, SeedPoolSignInView } from "@/components/seed-pool/seed-pool";
import {
  loadSignInProviders,
  resetSignInProvidersForTests,
  type SignInProviderFlags,
} from "@/lib/supabase/sign-in-providers";

const URL = "https://example-ref.supabase.co";
const BOTH = ["Sign in with GitHub", "Sign in with Google"];

const buttonLabels = (html: string) =>
  [...html.matchAll(/<button type="button"[^>]*>(.*?)<\/button>/gs)].map((m) =>
    m[1].replace(/<svg.*?<\/svg>/gs, "").trim(),
  );

function stubSettings(external: Record<string, unknown>) {
  const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ external }) }));
  vi.stubGlobal("fetch", fetchImpl);
  return fetchImpl;
}

const handlers = { busy: false, onSignInGitHub: () => {}, onSignInGoogle: () => {} };

function accountSection(): string {
  const props: AccountSectionViewProps = {
    authKind: "signed-out",
    user: null,
    busy: false,
    confirmingSignOut: false,
    onSignInGitHub: () => {},
    onSignInGoogle: () => {},
    onSignOutSubmit: () => {},
    onStaySignedIn: () => {},
  };
  return renderToStaticMarkup(createElement(AccountSectionView, props));
}

/** Every surface that draws the shared `SignInButtons`, as the page renders it. */
function sharedSurfaces(): Record<string, string> {
  return {
    "Account section": accountSection(),
    "welcome Account step": renderToStaticMarkup(
      createElement(AccountStepView, { auth: "signed-out", user: null, ...handlers }),
    ),
    "welcome AI step": renderToStaticMarkup(createElement(SignInToUseKeyView, handlers)),
  };
}

const seedPool = (providers: SignInProviderFlags | null) =>
  renderToStaticMarkup(SeedPoolSignInView({ returnTo: "/profile#seed-pool", providers }) as ReactElement);

beforeEach(() => {
  resetSignInProvidersForTests();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", URL);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test_key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  resetSignInProvidersForTests();
});

describe("rule 1 — a button only for a provider the project reports enabled", () => {
  it("both enabled -> both buttons on every surface", async () => {
    stubSettings({ github: true, google: true });
    await loadSignInProviders();
    for (const [surface, html] of Object.entries(sharedSurfaces())) expect(buttonLabels(html), surface).toEqual(BOTH);
    expect(buttonLabels(seedPool({ github: true, google: true }))).toEqual(["Sign in with Google", "Sign in with GitHub"]);
  });

  it("google false -> only GitHub, on every surface", async () => {
    const fetchImpl = stubSettings({ github: true, google: false });
    await loadSignInProviders();
    for (const [surface, html] of Object.entries(sharedSurfaces())) {
      expect(buttonLabels(html), surface).toEqual(["Sign in with GitHub"]);
    }
    expect(buttonLabels(seedPool({ github: true, google: false }))).toEqual(["Sign in with GitHub"]);
    // Three surfaces rendered, one request for the page load.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("github false -> only Google", async () => {
    stubSettings({ github: false, google: true });
    await loadSignInProviders();
    for (const [surface, html] of Object.entries(sharedSurfaces())) {
      expect(buttonLabels(html), surface).toEqual(["Sign in with Google"]);
    }
    expect(buttonLabels(seedPool({ github: false, google: true }))).toEqual(["Sign in with Google"]);
  });

  it("the view hides exactly what it is told is off", () => {
    const only = (providers: SignInProviderFlags) =>
      buttonLabels(renderToStaticMarkup(createElement(SignInButtonsView, { ...handlers, providers })));
    expect(only({ github: true, google: false })).toEqual(["Sign in with GitHub"]);
    expect(only({ github: false, google: true })).toEqual(["Sign in with Google"]);
  });
});

describe("rule 2 — while unknown, or if the settings cannot be read, today's buttons stay", () => {
  it("loading -> both buttons on every surface (no jump, nothing waits)", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    for (const [surface, html] of Object.entries(sharedSurfaces())) expect(buttonLabels(html), surface).toEqual(BOTH);
    expect(buttonLabels(seedPool(null))).toEqual(["Sign in with Google", "Sign in with GitHub"]);
  });

  it("fetch fails -> both buttons on every surface", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    await loadSignInProviders();
    for (const [surface, html] of Object.entries(sharedSurfaces())) expect(buttonLabels(html), surface).toEqual(BOTH);
  });

  it("a refused settings request (non-2xx) -> both buttons on every surface", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 401, json: async () => ({ external: {} }) })));
    await loadSignInProviders();
    for (const [surface, html] of Object.entries(sharedSurfaces())) expect(buttonLabels(html), surface).toEqual(BOTH);
  });
});

describe("rule 3 — no provider enabled: the one sentence, no buttons", () => {
  const SENTENCE = "Sign-in is not set up on this copy of Peer.";

  it("none enabled -> the sentence and no sign-in button, on every surface", async () => {
    stubSettings({ github: false, google: false, email: true });
    await loadSignInProviders();
    for (const [surface, html] of Object.entries(sharedSurfaces())) {
      expect(buttonLabels(html), surface).toEqual([]);
      // No button at all. (The Account section's description above them still
      // names both providers: rule 3 adds no copy beyond this one sentence.)
      expect(html, surface).not.toContain("<button");
      expect(html.split(SENTENCE).length - 1, surface).toBe(1);
    }
    const pool = seedPool({ github: false, google: false });
    expect(buttonLabels(pool)).toEqual([]);
    expect(pool.split(SENTENCE).length - 1).toBe(1);
  });

  it("the sentence appears only then: never while loading, on failure, or with one provider on", async () => {
    for (const providers of [null, { github: true, google: false }, { github: false, google: true }, { github: true, google: true }]) {
      const html = renderToStaticMarkup(createElement(SignInButtonsView, { ...handlers, providers }));
      expect(html, JSON.stringify(providers)).not.toContain(SENTENCE);
      expect(seedPool(providers), JSON.stringify(providers)).not.toContain(SENTENCE);
    }
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    await loadSignInProviders();
    for (const [surface, html] of Object.entries(sharedSurfaces())) expect(html, surface).not.toContain(SENTENCE);
  });
});

describe("rule 4 — both enabled (production): the same buttons, order, labels and markup as before", () => {
  // sha256 of each surface's signed-out markup rendered from 0ec62242, the
  // commit before R-AUTH-PROV (captured 2026-11-06 by rendering these same
  // elements against that commit's account-section.tsx and seed-pool.tsx).
  const BEFORE: Record<string, string> = {
    account: "80a89c49313dd4f4f68f771aae799b4caed59ca81eff62c0754071a023ed11e9",
    accountBusy: "f88932885f77dfefe20a4205c27b6d4e8236def6bc3c7cda1e1d98afd5911512",
    welcomeAccount: "99c8f3e6dfc6e430f6bee544579ad8576365e2ce810b0dd1032bf90059dbb1f2",
    welcomeAi: "bcda9176b7d3c238aebc247e712f4056151dcf8d2c3e3942047924726c8f9d9a",
    seedProfile: "02a438a34cd448a3379d430eb2908340a53e5e75447345c05c29303bcc01eae4",
    seedOnboarding: "02a438a34cd448a3379d430eb2908340a53e5e75447345c05c29303bcc01eae4",
  };
  const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

  function surfacesNow(): Record<string, string> {
    const signedOut = (busy: boolean) =>
      renderToStaticMarkup(
        createElement(AccountSectionView, {
          authKind: "signed-out",
          user: null,
          busy,
          confirmingSignOut: false,
          onSignInGitHub: () => {},
          onSignInGoogle: () => {},
          onSignOutSubmit: () => {},
          onStaySignedIn: () => {},
        }),
      );
    return {
      account: signedOut(false),
      accountBusy: signedOut(true),
      welcomeAccount: renderToStaticMarkup(createElement(AccountStepView, { auth: "signed-out", user: null, ...handlers })),
      welcomeAi: renderToStaticMarkup(createElement(SignInToUseKeyView, handlers)),
      seedProfile: renderToStaticMarkup(SeedPool({}) as ReactElement),
      seedOnboarding: renderToStaticMarkup(SeedPool({ onboarding: true }) as ReactElement),
    };
  }

  it("GitHub then Google on the shared buttons, Google then GitHub on the seed pool, as before", async () => {
    stubSettings({ github: true, google: true, email: true });
    await loadSignInProviders();
    const now = surfacesNow();
    for (const surface of ["account", "accountBusy", "welcomeAccount", "welcomeAi"]) {
      expect(buttonLabels(now[surface]), surface).toEqual(["Sign in with GitHub", "Sign in with Google"]);
    }
    for (const surface of ["seedProfile", "seedOnboarding"]) {
      expect(buttonLabels(now[surface]), surface).toEqual(["Sign in with Google", "Sign in with GitHub"]);
    }
  });

  it("every surface's markup is byte-identical to the markup before this change", async () => {
    stubSettings({ github: true, google: true, email: true });
    await loadSignInProviders();
    const now = surfacesNow();
    for (const [surface, before] of Object.entries(BEFORE)) expect(sha256(now[surface]), surface).toBe(before);
  });

  it("and the same while loading, so nothing moves when the answer arrives", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const now = surfacesNow();
    for (const [surface, before] of Object.entries(BEFORE)) expect(sha256(now[surface]), surface).toBe(before);
  });
});
