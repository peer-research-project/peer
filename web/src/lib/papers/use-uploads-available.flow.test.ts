import { afterEach, expect, it, vi } from "vitest";
vi.mock("react", async (original) => {
  const actual = await original<typeof import("react")>();
  const { hookRuntime } = await import("@/test-support/hook-runtime");
  return { ...actual, ...hookRuntime.hooks };
});
import { useEffect, useState } from "react";
import { hookRuntime } from "@/test-support/hook-runtime";
import { useUploadsAvailable } from "./use-uploads-available";
afterEach(() => vi.unstubAllGlobals());
it("retries a failed availability check and permits transfer after success", async () => {
  const seen: string[] = [];
  const fetcher = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ ok: true, json: async () => ({ enabled: true }) });
  vi.stubGlobal("fetch", fetcher);
  const mounted = await hookRuntime.mount(() => {
    const [attempt, setAttempt] = useState(0);
    const state = useUploadsAvailable(true, attempt);
    seen.push(state);
    useEffect(() => { if (state === "error" && attempt === 0) setAttempt(1); }, [state, attempt]);
    return state;
  });
  expect(seen).toContain("unknown");
  expect(seen).toContain("error");
  expect(mounted.value).toBe("available");
  expect(fetcher).toHaveBeenCalledTimes(2);
  mounted.unmount();
});
