// The first visit, as rules (P7-16, the owner's R12).
//
// A profile that has never been set up opens on the /welcome walkthrough once,
// from the home page. `components/first-run.tsx` is the gate that acts on this;
// the rules live here so they can be read, and tested, with no React in the way.
//
// **From the home page only** (P7-16c, §1h.35 (a)): a reader who opens a shared
// paper link, a search or any other route is left where they are. A deep link
// is somebody's answer to "where do you want to go", and a first-time visitor
// who follows one is never pulled off it into a form. The reader who is
// meant to meet the walkthrough is the one who opens Peer itself, and that is
// `/`.
//
// "Never set up" means nothing at all: no onboarding stamp, no research topic,
// no project or challenge, no model key, and the walkthrough has not already
// been shown or skipped. Anything one of those says is the reader's own word,
// and a reader who has given one is never sent anywhere. (This is the same
// "nothing declared" that makes the home page show its sample: topics, project
// and challenge, see `activePaperTopicsKey` in `store/feed.ts`.)

import type { UserProfile } from "@/types";

/** The parts of a profile the first-visit rules read. */
export type FirstVisitProfile = Pick<
  UserProfile,
  | "onboardedAt"
  | "researchTopics"
  | "currentProject"
  | "currentChallenges"
  | "feedAiApiKey"
  | "welcomeSkipped"
>;

/** True when the reader has told Peer anything, or has already met the walkthrough. */
export function hasBeenSetUp(profile: FirstVisitProfile): boolean {
  return (
    Boolean(profile.onboardedAt) ||
    Boolean(profile.welcomeSkipped) ||
    profile.researchTopics.length > 0 ||
    Boolean(profile.currentProject?.trim()) ||
    Boolean(profile.currentChallenges?.trim()) ||
    Boolean(profile.feedAiApiKey?.trim())
  );
}

/**
 * What the first-run gate does on this page, once the profile can be trusted:
 *  - `"redirect"`: the reader is on the home page (`/`, and only there): send
 *    them to /welcome, and record that it was done;
 *  - `"record"`: the reader is on /welcome already — leave them there, and
 *    record that they have been shown it, so leaving does not bring them back;
 *  - `null`: nothing. Every other page, a deep link above all, is left alone.
 */
export function walkthroughAction(
  pathname: string | null,
  profile: FirstVisitProfile,
): "redirect" | "record" | null {
  if (!pathname) return null;
  if (hasBeenSetUp(profile)) return null;
  if (pathname === "/welcome") return "record";
  if (pathname === "/") return "redirect";
  return null;
}

// ── A set-up account signing in (W27, the manager's R-ONB-1, 2026-11-06) ──
//
// The owner's report: "when an existing account logged in, the user should
// not be asked to walkthrough the beginning walkthrough process again". The
// walkthrough's Account step signs in and comes back to /welcome (see
// `ACCOUNT_STEP_RETURN_TO`), and the AI and Seed steps do the same; nothing on
// /welcome used to ask whether the account that just signed in had already
// been set up. These rules answer it; ProfileSync applies them at the sign-in
// pull, and FirstRunGate leaves the walkthrough on their answer.

/** The parts of the account's synced row that say it was set up. */
export type RemoteSetUpProfile = Pick<
  Partial<UserProfile>,
  "researchTopics" | "currentProject" | "currentChallenges"
>;

/**
 * True when the account's own synced profile shows it was set up: a research
 * topic, a project or a challenge. The server keeps no onboarding record of
 * its own (`onboardedAt` and `welcomeSkipped` have no column), so these are
 * the whole of the evidence. A missing row (`null`, a brand-new account or a
 * failed pull) is not.
 */
export function remoteShowsSetUp(remote: RemoteSetUpProfile | null | undefined): boolean {
  if (!remote) return false;
  return (
    (Array.isArray(remote.researchTopics) && remote.researchTopics.length > 0) ||
    Boolean(remote.currentProject?.trim()) ||
    Boolean(remote.currentChallenges?.trim())
  );
}

/**
 * Whether this sign-in is a set-up account arriving, so a reader on /welcome
 * leaves the walkthrough. `remote` is the account's row as the sign-in pull
 * fetched it, before this session's merge or push.
 */
export function isReturningAccountSignIn(
  _previousOwner: string | null,
  _userId: string,
  remote: RemoteSetUpProfile | null,
): boolean {
  return remoteShowsSetUp(remote);
}

/** Where a set-up account goes when it leaves the walkthrough. The gate only
 *  ever sends a reader to /welcome from `/` (see `walkthroughAction`), and
 *  the sign-in callback has already used up its return path, so `/` is the
 *  page they were on their way to. */
export const RETURNING_ACCOUNT_DESTINATION = "/";
