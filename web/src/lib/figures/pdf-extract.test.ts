import { afterEach, describe, expect, it, vi } from "vitest";
import { tryPdfCandidates } from "./pdf-extract";

describe("tryPdfCandidates — 1-22b, hard access statuses are classified by evidence", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("reports a hard-403 response as blocked", async () => {
    globalThis.fetch = vi.fn(async () => new Response("", { status: 403 })) as unknown as typeof fetch;

    const result = await tryPdfCandidates(
      "https://onlinelibrary.wiley.com/doi/pdf/10.1002/test.1",
      "publisher",
    );

    expect(result.status).toBe("source_unavailable");
    expect(result.reason).toContain("onlinelibrary.wiley.com");
  });

  it("still reports a plain fetch failure (not a paywall status) as source_unavailable", async () => {
    globalThis.fetch = vi.fn(async () => new Response("", { status: 404 })) as unknown as typeof fetch;

    const result = await tryPdfCandidates("https://example.com/missing.pdf", "publisher");

    expect(result.status).toBe("source_unavailable");
  });

  it("never calls an open-access host's own 40x a paywall", async () => {
    globalThis.fetch = vi.fn(async () => new Response("", { status: 403 })) as unknown as typeof fetch;

    const result = await tryPdfCandidates(
      "https://arxiv.org/pdf/1234.5678",
      "open-access",
    );

    expect(result.status).toBe("source_unavailable");
  });

  it("2-01: reports an OpenAlex 403 as blocked (source_unavailable), never paywalled", async () => {
    // Ruling 9 (§1j) / A2-05: openalex.org is an aggregator host this
    // codebase itself calls, not a publisher — a 403 there is an anti-bot
    // block, and must not read as a subscription paywall.
    globalThis.fetch = vi.fn(async () => new Response("", { status: 403 })) as unknown as typeof fetch;

    const result = await tryPdfCandidates("https://openalex.org/W7212207112", "open-access");

    expect(result.status).toBe("source_unavailable");
    expect(result.reason).toContain("openalex.org");
  });
});
