// Ruling 20 (round 7, S23): one shared, keyed, paced client for every
// Semantic Scholar Graph API call in this codebase — paper search
// (`sources/semantic-scholar.ts`) and abstract/TLDR enrichment
// (`papers/enrich.ts`). Extracted from `lib/figures/extract.ts`'s own 1-20
// queue, which this ruling removed: the Graph API has no `figures` field,
// so the figure-lookup branch that queue used to serve could never have
// worked (every call was a 400 when not throttled, a 429 when throttled).
// The queueing/backoff mechanism itself was sound and still applies to the
// two real endpoints below, so it moves here rather than being deleted.
//
// Semantic Scholar's own limits: unauthenticated, per-IP throttling is easy
// to hit when several requests fire at once (1-20's original motivation).
// Keyed, the published limit is 1 request per second per key — shared by
// every reader of this deployment — but the manager's own live testing
// found 429s still appearing between 200s even paced at 1.1–3s with the
// key, i.e. the limit is enforced with some burst memory. Paced at 1500ms
// keyed (not 1100ms) to give that memory room to drain.

const MAX_CONCURRENT = 2;
const UNKEYED_MIN_INTERVAL_MS = 350;
const KEYED_MIN_INTERVAL_MS = 1500;

function minIntervalMs(): number {
  // Read at call time, not module load, so a test (or a late-loaded env) can
  // flip it — same reasoning the retired extract.ts queue used.
  return process.env.SEMANTIC_SCHOLAR_API_KEY
    ? KEYED_MIN_INTERVAL_MS
    : UNKEYED_MIN_INTERVAL_MS;
}

// 4-01's own widened backoff, carried over unchanged: a 429 is retried
// after 1s, then 2s, then 4s — three retries, doubling, then final. Bounded
// by the list, never a loop.
const RETRY_DELAYS_MS = [1_000, 2_000, 4_000] as const;

const DEFAULT_TIMEOUT_MS = 7_000;

let active = 0;
let lastStart = 0;
// Chains each caller's admission check onto the previous one, so concurrent
// callers are granted a slot in call order rather than racing each other.
let admission: Promise<void> = Promise.resolve();

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireSlot(deadline: number): Promise<boolean> {
  const myTurn = admission.then(async () => {
    while (active >= MAX_CONCURRENT) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) return false;
      await waitMs(Math.min(25, remaining));
    }
    const wait = lastStart + minIntervalMs() - Date.now();
    // A caller that cannot start before its deadline must not reserve a
    // future interval: it will never make a request, and doing so would
    // delay every live caller queued behind it.
    if (Date.now() + Math.max(0, wait) >= deadline) return false;
    if (wait > 0) await waitMs(wait);
    if (Date.now() >= deadline) return false;
    lastStart = Date.now();
    active += 1;
    return true;
  });
  // Swallow here (not at the caller) so one rejected admission never breaks
  // the chain for everyone queued behind it; the caller still awaits
  // `myTurn` directly and sees any rejection itself.
  admission = myTurn.then(() => {}, () => {});
  return myTurn;
}

function releaseSlot(): void {
  active = Math.max(0, active - 1);
}

// Exported for tests only — the limiter's module-level state persists
// across test cases in the same file.
export function __resetSemanticScholarClientForTests(): void {
  active = 0;
  lastStart = 0;
  admission = Promise.resolve();
}

type SemanticScholarInit = RequestInit & { next?: { revalidate?: number } };

async function attemptFetch(
  url: string,
  init: SemanticScholarInit,
  timeoutMs: number,
  deadline = Infinity,
): Promise<Response | null> {
  const slot = acquireSlot(deadline);
  let acquired: boolean;
  if (Number.isFinite(deadline)) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    acquired = await Promise.race([slot, new Promise<false>((resolve) => { timer = setTimeout(() => resolve(false), Math.max(0, deadline - Date.now())); })]);
    if (timer) clearTimeout(timer);
    // If the deadline wins a race with an already-granted slot, release
    // that slot once. An expired admission does not hold a slot at all.
    if (!acquired) { void slot.then((granted) => { if (granted) releaseSlot(); }); return null; }
  } else acquired = await slot;
  if (!acquired) return null;
  try {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return null;
    const apiKey = process.env.SEMANTIC_SCHOLAR_API_KEY;
    return await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(Math.max(1, Math.min(timeoutMs, remaining))),
      headers: {
        ...init.headers,
        ...(apiKey ? { "x-api-key": apiKey } : {}),
      },
    });
  } catch {
    return null;
  } finally {
    releaseSlot();
  }
}

/**
 * Fetches a Semantic Scholar Graph API URL through the shared queue
 * (concurrency 2, paced to the keyed/unkeyed interval above) and retries
 * with exponential backoff on a 429 (1s, 2s, 4s — three retries; after the
 * last one, whatever that attempt returned is final, even if still a 429).
 * Sends `x-api-key` when `SEMANTIC_SCHOLAR_API_KEY` is set. Returns `null`
 * on a network error (never throws) — the same "honest empty" shape every
 * other source adapter in this codebase already uses.
 */
export async function fetchSemanticScholar(
  url: string,
  init: SemanticScholarInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
  options: { deadline?: number; maxRetries?: number } = {},
): Promise<Response | null> {
  let res = await attemptFetch(url, init, timeoutMs, options.deadline);
  for (const [index, delay] of RETRY_DELAYS_MS.entries()) {
    if (index >= (options.maxRetries ?? RETRY_DELAYS_MS.length) || Date.now() + delay >= (options.deadline ?? Infinity)) break;
    if (res?.status !== 429) return res;
    await waitMs(delay);
    res = await attemptFetch(url, init, timeoutMs, options.deadline);
  }
  return res;
}
