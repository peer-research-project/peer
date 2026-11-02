"use client";

// Availability is advisory; the server still enforces upload access.

import { useEffect, useState } from "react";

export type UploadsAvailability = "unknown" | "available" | "unavailable";

/**
 * The fetch outcome, reduced to the one bit this hook keeps — a pure map so
 * it is directly testable without running a live effect (this repo has no
 * @testing-library/react; `renderToStaticMarkup` never runs effects at all,
 * so the fetch itself cannot be exercised through a render). Anything short
 * of an explicit `enabled: true` fails closed, including a non-2xx response,
 * a response with no body, and a malformed one — never assume available.
 */
export function availabilityFromResponse(ok: boolean, data: { enabled?: boolean } | null): UploadsAvailability {
  return ok && data?.enabled === true ? "available" : "unavailable";
}

export function useUploadsAvailable(enabled = true, attempt = 0): UploadsAvailability {
  const [result, setResult] = useState<{ attempt: number; state: UploadsAvailability }>({ attempt: 0, state: "unknown" });
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    fetch("/api/papers/upload-availability", { cache: "no-store", signal: controller.signal })
      .then(async (res) => {
        const data = await res.json().catch(() => null) as { enabled?: boolean } | null;
        if (!controller.signal.aborted) setResult({ attempt, state: availabilityFromResponse(res.ok, data) });
      })
      .catch(() => {
        if (!controller.signal.aborted) setResult({ attempt, state: availabilityFromResponse(false, null) });
      });
    return () => controller.abort();
  }, [enabled, attempt]);
  return result.attempt === attempt ? result.state : "unknown";
}
