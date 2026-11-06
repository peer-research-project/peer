import { describe, expect, it } from "vitest";
import { defaultProfile, type UserProfile } from "@/types";
import {
  hasBeenSetUp,
  isReturningAccountSignIn,
  remoteShowsSetUp,
  RETURNING_ACCOUNT_DESTINATION,
  walkthroughAction,
} from "./first-visit";
import { safeReturnPath } from "@/lib/navigation/return-path";

// P7-16 (R12): a profile that has never been set up opens on the /welcome
// walkthrough once. These are the rules, with no React in them: what counts as
// "set up", and what the gate does on a page. P7-16c (§1h.35 (a)): it opens by
// itself from the home page only; a deep link is never redirected.

const fresh: UserProfile = { ...defaultProfile };

const setUp: Array<[string, Partial<UserProfile>]> = [
  ["a research topic", { researchTopics: ["battery materials"] }],
  ["a project", { currentProject: "A study of solid electrolytes" }],
  ["a challenge", { currentChallenges: "Separating interface effects from bulk effects" }],
  ["a model key", { feedAiProvider: "openai", feedAiApiKey: "an-invented-key-for-the-test" }],
  ["onboardedAt", { onboardedAt: "2026-10-01T09:00:00.000Z" }],
  ["welcomeSkipped", { welcomeSkipped: true }],
];

describe("hasBeenSetUp — what counts as a profile that has been through setup", () => {
  it("a fresh profile has not", () => {
    expect(hasBeenSetUp(fresh)).toBe(false);
  });

  it("a profile stored before the flag existed carries no welcomeSkipped, and reads as not set up", () => {
    expect(fresh.welcomeSkipped).toBeUndefined();
    expect("welcomeSkipped" in fresh).toBe(false);
    expect(hasBeenSetUp(fresh)).toBe(false);
  });

  it.each(setUp)("%s alone is enough", (_name, patch) => {
    expect(hasBeenSetUp({ ...fresh, ...patch })).toBe(true);
  });

  it("empty and blank values are not setup", () => {
    expect(
      hasBeenSetUp({
        ...fresh,
        researchTopics: [],
        currentProject: "   ",
        currentChallenges: "",
        feedAiApiKey: "   ",
        onboardedAt: null,
        welcomeSkipped: false,
      }),
    ).toBe(false);
  });
});

describe("walkthroughAction — what the first-run gate does on a page", () => {
  it("sends a fresh profile on the home page to the walkthrough", () => {
    expect(walkthroughAction("/", fresh)).toBe("redirect");
  });

  // Re-aimed to §1h.35 (a) (P7-16c): this used to say a fresh profile is sent
  // to the walkthrough "there too", from any page. A shared paper link, a
  // search or any other route is left where it is; only "/" opens it.
  it.each([
    "/papers/abc",
    "/papers/openalex:W1",
    "/search",
    "/profile",
    "/saved",
    "/data-sources",
    "/changelog",
  ])("leaves a fresh profile on %s where it is: a deep link is never redirected (§1h.35 (a))", (pathname) => {
    expect(walkthroughAction(pathname, fresh)).toBeNull();
  });

  it("does not move a reader who is already on /welcome; it only records that they have been shown it", () => {
    expect(walkthroughAction("/welcome", fresh)).toBe("record");
  });

  it.each(["/privacy", "/persona", "/auth/error", "/api/feed", "/api"])(
    "never takes over %s",
    (pathname) => {
      expect(walkthroughAction(pathname, fresh)).toBeNull();
    },
  );

  // Re-aimed to §1h.35 (a) (P7-16c): this was "matches whole path segments:
  // /privacy-notes is an ordinary page", true of the exempt list the home-only
  // rule made unnecessary. What is left to prove is that only the path "/"
  // itself opens the walkthrough, not a path that starts or looks like it.
  it("only the path / itself opens it: /privacy-notes and the like are left where they are (§1h.35 (a))", () => {
    for (const pathname of ["/privacy-notes", "/welcome-back", "/index"]) {
      expect(walkthroughAction(pathname, fresh)).toBeNull();
    }
    expect(walkthroughAction("/", fresh)).toBe("redirect");
  });

  it("does nothing before the path is known", () => {
    expect(walkthroughAction(null, fresh)).toBeNull();
  });

  it.each(setUp)("a profile with %s is left alone, on the home page and on /welcome", (_name, patch) => {
    const profile = { ...fresh, ...patch };
    expect(walkthroughAction("/", profile)).toBeNull();
    expect(walkthroughAction("/search", profile)).toBeNull();
    expect(walkthroughAction("/welcome", profile)).toBeNull();
  });
});

// W27 (R-ONB-1, 2026-11-06): "An account that was already set up never has to
// go through the walkthrough again after signing in." "Already set up" is the
// account's synced row, as the sign-in pull fetched it: research topics, a
// project or a challenge (the server keeps no onboarding record of its own).
// Invented rows only.
describe("remoteShowsSetUp — the account's synced row says it was set up (W27, R-ONB-1 rule 1)", () => {
  it.each([
    ["research topics", { researchTopics: ["battery materials"] }],
    ["a project", { currentProject: "A study of solid electrolytes" }],
    ["a challenge", { currentChallenges: "Separating interface effects from bulk effects" }],
  ])("%s alone is enough", (_name, remote) => {
    expect(remoteShowsSetUp(remote)).toBe(true);
  });

  it("no row (a brand-new account, or a failed pull) is not", () => {
    expect(remoteShowsSetUp(null)).toBe(false);
    expect(remoteShowsSetUp(undefined)).toBe(false);
  });

  it("an empty row, or blank values, is not", () => {
    expect(remoteShowsSetUp({})).toBe(false);
    expect(remoteShowsSetUp({ researchTopics: [], currentProject: "  ", currentChallenges: "" })).toBe(false);
  });
});

describe("isReturningAccountSignIn — a set-up account arriving (W27, R-ONB-1 rule 1)", () => {
  it("(a) after a sign-out (no owner recorded), a set-up account signing in is one", () => {
    expect(isReturningAccountSignIn(null, "user-returning", { researchTopics: ["battery materials"] })).toBe(true);
  });

  it("(b) a brand-new account (no row yet, or an empty one) is not: the wizard carries on", () => {
    expect(isReturningAccountSignIn(null, "user-new", null)).toBe(false);
    expect(isReturningAccountSignIn(null, "user-new", { researchTopics: [] })).toBe(false);
  });

  it("leaves for /, a page safeReturnPath would never send the walkthrough back to", () => {
    expect(RETURNING_ACCOUNT_DESTINATION).toBe("/");
    expect(RETURNING_ACCOUNT_DESTINATION.startsWith("/welcome")).toBe(false);
    // `/` is the callback's own fallback when no return path is allowed.
    expect(safeReturnPath(RETURNING_ACCOUNT_DESTINATION)).toBeNull();
  });
});
