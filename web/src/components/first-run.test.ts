// P7-16 (R12): `FirstRunGate` with its effects running.
//
// A profile that has never been set up opens on the /welcome walkthrough once.
// This repo has no DOM and `react-dom/server` never runs effects, so the gate
// runs on `test-support/hook-runtime` and the three things it reads — the
// router, the profile store and the sync gate — are small stand-ins. The
// decision itself (what counts as "set up", that only the home page opens the
// walkthrough, P7-16c) is proven in `lib/profile/first-visit.test.ts`; this
// file proves the gate acts on it: after hydration and sync, with
// `router.replace`, once.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  const { hookRuntime } = await import("@/test-support/hook-runtime");
  return {
    ...actual,
    ...hookRuntime.hooks,
    // The gate reads "has the store hydrated" through this; a plain read is
    // what it comes to once the page is mounted.
    useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot(),
  };
});

const world = vi.hoisted(() => ({
  pathname: "/" as string | null,
  hydrated: true,
  syncSettled: true,
  profile: {} as Record<string, unknown>,
  replace: vi.fn(),
  completeOnboarding: vi.fn(),
  /** Stands in for the store action: it records the flag where a second open can read it. */
  skipWelcome: vi.fn(),
  /** W27: ProfileSync's "a set-up account just signed in" signal, and its clear. */
  returningAccount: false,
  clearReturningAccount: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => world.pathname,
  useRouter: () => ({ replace: world.replace }),
}));

vi.mock("@/store/profile", () => {
  const state = () => ({
    profile: world.profile,
    completeOnboarding: world.completeOnboarding,
    skipWelcome: world.skipWelcome,
  });
  const useProfileStore = Object.assign(
    (selector: (s: ReturnType<typeof state>) => unknown) => selector(state()),
    {
      persist: {
        hasHydrated: () => world.hydrated,
        onFinishHydration: () => () => {},
      },
    },
  );
  return { useProfileStore };
});

vi.mock("@/components/profile-sync", () => ({
  useSyncGate: (select: (s: { settled: boolean; returningAccount: boolean }) => unknown) =>
    select({ settled: world.syncSettled, returningAccount: world.returningAccount }),
  clearReturningAccount: world.clearReturningAccount,
}));

import { hookRuntime } from "@/test-support/hook-runtime";
import { defaultProfile } from "@/types";
import { FirstRunGate } from "./first-run";

/** One page open: the gate mounts, runs its effects, and is let go. */
async function open(pathname: string) {
  world.pathname = pathname;
  const mounted = await hookRuntime.mount(() => FirstRunGate());
  mounted.unmount();
}

describe("FirstRunGate — a never-set-up profile opens on the walkthrough once (P7-16, R12)", () => {
  beforeEach(() => {
    world.pathname = "/";
    world.hydrated = true;
    world.syncSettled = true;
    world.profile = { ...defaultProfile };
    world.replace.mockReset();
    world.completeOnboarding.mockReset();
    world.skipWelcome.mockReset();
    world.skipWelcome.mockImplementation(() => {
      world.profile = { ...world.profile, welcomeSkipped: true };
    });
  });

  it("sends a fresh profile on the home page to /welcome, with replace", async () => {
    await open("/");
    expect(world.replace).toHaveBeenCalledTimes(1);
    expect(world.replace).toHaveBeenCalledWith("/welcome");
  });

  it("does it once per browser: the second open, after the flag was recorded, goes nowhere", async () => {
    await open("/");
    await open("/");
    await open("/search");
    expect(world.replace).toHaveBeenCalledTimes(1);
    expect(world.profile.welcomeSkipped).toBe(true);
  });

  // Re-aimed to §1h.35 (a) (P7-16c): this used to say a fresh profile on
  // another page is sent to /welcome "there too". A deep link is never
  // hijacked: nothing moves the reader, and nothing is recorded, so the
  // walkthrough is still owed to the first time they reach the home page.
  it.each(["/papers/abc", "/search", "/profile", "/data-sources"])(
    "leaves a fresh profile on %s where it is: no redirect, no flag spent (§1h.35 (a))",
    async (pathname) => {
      await open(pathname);
      expect(world.replace).not.toHaveBeenCalled();
      expect(world.skipWelcome).not.toHaveBeenCalled();
      expect(world.profile.welcomeSkipped).toBeUndefined();
    },
  );

  it("a deep link first, the home page after: the walkthrough opens there, once (§1h.35 (a))", async () => {
    await open("/papers/abc");
    expect(world.replace).not.toHaveBeenCalled();
    await open("/");
    expect(world.replace).toHaveBeenCalledTimes(1);
    expect(world.replace).toHaveBeenCalledWith("/welcome");
    await open("/");
    expect(world.replace).toHaveBeenCalledTimes(1);
  });

  it("waits for the store to hydrate: nothing happens on the default profile of a first paint", async () => {
    world.hydrated = false;
    await open("/");
    expect(world.replace).not.toHaveBeenCalled();
    expect(world.skipWelcome).not.toHaveBeenCalled();
  });

  it("waits for the first sync to settle", async () => {
    world.syncSettled = false;
    await open("/");
    expect(world.replace).not.toHaveBeenCalled();
    expect(world.skipWelcome).not.toHaveBeenCalled();
  });

  it.each([
    ["a research topic", { researchTopics: ["battery materials"] }],
    ["a model key", { feedAiProvider: "openai", feedAiApiKey: "an-invented-key-for-the-test" }],
    ["onboardedAt", { onboardedAt: "2026-10-01T09:00:00.000Z" }],
    ["welcomeSkipped", { welcomeSkipped: true }],
  ])("leaves a profile with %s alone", async (_name, patch) => {
    world.profile = { ...defaultProfile, ...patch };
    await open("/");
    expect(world.replace).not.toHaveBeenCalled();
  });

  it("on /welcome nothing moves the reader; it only records that the walkthrough has been shown", async () => {
    await open("/welcome");
    expect(world.replace).not.toHaveBeenCalled();
    expect(world.skipWelcome).toHaveBeenCalledTimes(1);
    // ...so leaving it for another page does not bring the reader back.
    await open("/profile");
    expect(world.replace).not.toHaveBeenCalled();
  });

  it.each(["/privacy", "/persona", "/auth/error"])("never takes over %s", async (pathname) => {
    await open(pathname);
    expect(world.replace).not.toHaveBeenCalled();
    expect(world.skipWelcome).not.toHaveBeenCalled();
  });

  it("still backfills onboardedAt for a profile that has topics but no flag (unchanged)", async () => {
    world.profile = { ...defaultProfile, researchTopics: ["battery materials"] };
    await open("/");
    expect(world.completeOnboarding).toHaveBeenCalledTimes(1);
    expect(world.replace).not.toHaveBeenCalled();
  });

  it("does not backfill while the reader is on /welcome (a first topic may just have been added)", async () => {
    world.profile = { ...defaultProfile, researchTopics: ["battery materials"] };
    await open("/welcome");
    expect(world.completeOnboarding).not.toHaveBeenCalled();
  });
});

// W27 (R-ONB-1, 2026-11-06). The owner: "when an existing account logged in,
// the user should not be asked to walkthrough the beginning walkthrough
// process again." Seen by the manager: after Sign out -> GitHub sign-in the
// browser landed on /welcome?step=account, inside the walkthrough. ProfileSync
// raises `returningAccount` at the sign-in pull when the account was already
// set up (the decision is proven in lib/profile/first-visit.test.ts); this
// proves the gate acts on it: on /welcome it stamps onboardedAt and leaves for
// `/` with replace, once; elsewhere it moves nobody; without it, nothing moves.
describe("FirstRunGate — a set-up account that signs in leaves the walkthrough (W27, R-ONB-1)", () => {
  beforeEach(() => {
    world.pathname = "/welcome";
    world.hydrated = true;
    world.syncSettled = true;
    // The account's synced topics have landed; the device flags were wiped.
    world.profile = { ...defaultProfile, researchTopics: ["battery materials"] };
    world.returningAccount = true;
    world.replace.mockReset();
    world.completeOnboarding.mockReset();
    world.completeOnboarding.mockImplementation(() => {
      world.profile = { ...world.profile, onboardedAt: "2026-11-06T09:00:00.000Z", welcomeSkipped: true };
    });
    world.skipWelcome.mockReset();
    world.clearReturningAccount.mockReset();
    world.clearReturningAccount.mockImplementation(() => {
      world.returningAccount = false;
    });
  });

  afterEach(() => {
    world.returningAccount = false;
    world.completeOnboarding.mockReset();
  });

  it("(a) on /welcome?step=account: stamps onboardedAt and replaces to /, once", async () => {
    await open("/welcome");
    expect(world.completeOnboarding).toHaveBeenCalledTimes(1);
    expect(world.profile.onboardedAt).toEqual(expect.any(String));
    expect(world.replace).toHaveBeenCalledTimes(1);
    expect(world.replace).toHaveBeenCalledWith("/");
    // Landing on `/` spends the signal, and nothing sends the reader back.
    await open("/");
    expect(world.clearReturningAccount).toHaveBeenCalledTimes(1);
    expect(world.returningAccount).toBe(false);
    expect(world.replace).toHaveBeenCalledTimes(1);
    expect(world.completeOnboarding).toHaveBeenCalledTimes(1);
  });

  it("a later visit to /welcome of the reader's own, after the signal is spent, opens normally", async () => {
    await open("/welcome");
    await open("/");
    world.replace.mockReset();
    await open("/welcome");
    expect(world.replace).not.toHaveBeenCalled();
  });

  it("signed in from another page (a paper, the Profile): nobody is moved, the stamp is written, the signal spent", async () => {
    world.profile = { ...defaultProfile, currentProject: "A study of solid electrolytes" };
    await open("/papers/abc");
    expect(world.replace).not.toHaveBeenCalled();
    expect(world.completeOnboarding).toHaveBeenCalledTimes(1);
    expect(world.clearReturningAccount).toHaveBeenCalledTimes(1);
  });

  it("acts on the pull itself, not on the settle timeout: it leaves /welcome even before `settled`", async () => {
    world.syncSettled = false;
    await open("/welcome");
    expect(world.replace).toHaveBeenCalledWith("/");
  });

  it("(b, c) without the signal — a brand-new account, or a first topic just added in the wizard — /welcome is left alone", async () => {
    world.returningAccount = false;
    await open("/welcome");
    expect(world.replace).not.toHaveBeenCalled();
    expect(world.completeOnboarding).not.toHaveBeenCalled();
    expect(world.clearReturningAccount).not.toHaveBeenCalled();
  });
});

// R-ONB-1 rule 4: "First-time visitors and brand-new accounts still get the
// walkthrough once from '/', unchanged." Proven with the W27 code in place:
// the returning-account path neither fires nor stands in the way of it.
describe("FirstRunGate — first-time visitors still get the walkthrough once from / (W27, R-ONB-1 rule 4)", () => {
  beforeEach(() => {
    world.pathname = "/";
    world.hydrated = true;
    world.syncSettled = true;
    world.profile = { ...defaultProfile };
    world.returningAccount = false;
    world.replace.mockReset();
    world.completeOnboarding.mockReset();
    world.clearReturningAccount.mockReset();
    world.skipWelcome.mockReset();
    world.skipWelcome.mockImplementation(() => {
      world.profile = { ...world.profile, welcomeSkipped: true };
    });
  });

  it("(e) a first-time visitor at / is sent to /welcome, once, and nothing else is done", async () => {
    await open("/");
    await open("/");
    expect(world.replace).toHaveBeenCalledTimes(1);
    expect(world.replace).toHaveBeenCalledWith("/welcome");
    expect(world.completeOnboarding).not.toHaveBeenCalled();
    expect(world.clearReturningAccount).not.toHaveBeenCalled();
  });
});
