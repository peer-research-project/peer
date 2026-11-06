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

import { AccountSectionView, SignInButtonsView, type AccountSectionViewProps } from "./account-section";
import { AccountStepView, SignInToUseKeyView } from "@/app/welcome/account-step";
import { SeedPoolSignInView } from "@/components/seed-pool/seed-pool";
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
