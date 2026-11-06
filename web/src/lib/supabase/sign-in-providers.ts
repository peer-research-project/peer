// Which sign-in buttons to draw (R-AUTH-PROV, 2026-11-06).
//
// Peer is run from GitHub with each person's own Supabase project, and a
// project may enable GitHub and not Google (the peer-test project does). A
// "Sign in with Google" button there leads to Supabase's raw JSON error page
// ("Unsupported provider: provider is not enabled"), a dead end. Supabase's
// auth server says which providers are on at a public address,
// `GET ${NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings` with the same public
// (publishable or anon) key the browser client already sends; its JSON holds
// `external: { github: boolean, google: boolean, ... }`.
//
// Read once per page load, in the browser, and kept in memory: the first
// component that draws the buttons starts the request, every later one reads
// the same answer. Until the answer arrives the buttons are today's two, so
// nothing moves or waits; a provider is hidden only once the project reports
// it `false`.

import { useSyncExternalStore } from "react";

export type SignInProvider = "github" | "google";

/** One flag per sign-in button: true draws it. */
export type SignInProviderFlags = Readonly<Record<SignInProvider, boolean>>;

/** Today's buttons: both. What is drawn while the project's answer is unknown. */
export const ALL_SIGN_IN_PROVIDERS: SignInProviderFlags = Object.freeze({ github: true, google: true });

/** The settings address of a Supabase project's auth server. */
export function authSettingsUrl(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/+$/, "")}/auth/v1/settings`;
}

/**
 * The flags from the settings JSON. A provider is off only when `external`
 * says `false` for it; a missing or odd value keeps its button. No `external`
 * object at all is not an answer (null).
 */
export function parseSignInProviders(body: unknown): SignInProviderFlags | null {
  if (!body || typeof body !== "object") return null;
  const external = (body as { external?: unknown }).external;
  if (!external || typeof external !== "object") return null;
  const flags = external as Record<string, unknown>;
  return { github: flags.github !== false, google: flags.google !== false };
}

/** Asks the project which providers it has on. */
export async function fetchSignInProviders(
  supabaseUrl: string | undefined,
  publicKey: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<SignInProviderFlags | null> {
  if (!supabaseUrl || !publicKey) return null;
  const response = await fetchImpl(authSettingsUrl(supabaseUrl), { headers: { apikey: publicKey } });
  return parseSignInProviders(await response.json());
}

/** The buttons to draw for an answer; an unknown answer draws today's two. */
export function signInProvidersToShow(answer: SignInProviderFlags | null): SignInProviderFlags {
  return answer ?? ALL_SIGN_IN_PROVIDERS;
}

// The one answer for this page load, shared by every set of buttons.
let answer: SignInProviderFlags | null = null;
let request: Promise<void> | null = null;
const listeners = new Set<() => void>();

/** Starts the one request for this page load (later calls share it). */
export function loadSignInProviders(fetchImpl: typeof fetch = fetch): Promise<void> {
  if (!request) {
    request = fetchSignInProviders(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      fetchImpl,
    ).then((flags) => {
      if (!flags) return;
      answer = flags;
      for (const listener of listeners) listener();
    });
  }
  return request;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  void loadSignInProviders();
  return () => {
    listeners.delete(listener);
  };
}

/** The project's answer once it is known, else null. */
export function currentSignInProviders(): SignInProviderFlags | null {
  return answer;
}

/**
 * The project's answer for the buttons, null while unknown. The server render
 * and the hydrating first client render both read null, so they agree; a
 * component mounted after the answer arrived reads it straight away.
 */
export function useSignInProviders(): SignInProviderFlags | null {
  return useSyncExternalStore(subscribe, currentSignInProviders, () => null);
}

/** Tests only: forget the answer, as a fresh page load would. */
export function resetSignInProvidersForTests(): void {
  answer = null;
  request = null;
  listeners.clear();
}
