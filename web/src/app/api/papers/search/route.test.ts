import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

function request() {
  return new NextRequest("http://localhost/api/papers/search?q=neural+networks");
}

function results() {
  return Response.json({
    results: [{
      id: "https://openalex.org/W123",
      title: "A paper",
      authorships: [{ author: { display_name: "A. Researcher" } }],
      primary_location: null,
      abstract_inverted_index: null,
      citation_count: 0,
      cited_by_count: 0,
      doi: null,
      publication_date: null,
    }],
    meta: { count: 1 },
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("paper search upstream requests", () => {
  it("uses the configured OpenAlex key as a server-side header and never in the URL or response", async () => {
    const key = "example-test-key";
    vi.stubEnv("OPENALEX_API_KEY", ` ${key} `);
    const fetcher = vi.fn().mockResolvedValue(results());
    vi.stubGlobal("fetch", fetcher);

    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(new Headers(fetcher.mock.calls[0][1].headers).get("Authorization")).toBe(`Bearer ${key}`);
    expect(fetcher.mock.calls[0][0]).not.toContain(key);
    expect(JSON.stringify(await response.json())).not.toContain(key);
  });

  it("works without a key and does not send an authorization header", async () => {
    vi.stubEnv("OPENALEX_API_KEY", " ");
    const fetcher = vi.fn().mockResolvedValue(results());
    vi.stubGlobal("fetch", fetcher);

    expect((await GET(request())).status).toBe(200);
    expect(new Headers(fetcher.mock.calls[0][1].headers).has("Authorization")).toBe(false);
  });

  it("retries a rate limit once and keeps the same authentication on both attempts", async () => {
    vi.useFakeTimers();
    vi.stubEnv("OPENALEX_API_KEY", "example-test-key");
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response("slow down", { status: 429 }))
      .mockResolvedValueOnce(results());
    vi.stubGlobal("fetch", fetcher);

    const pending = GET(request());
    await vi.advanceTimersByTimeAsync(400);
    expect((await pending).status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(2);
    for (const [, init] of fetcher.mock.calls) {
      expect(new Headers(init.headers).get("Authorization")).toBe("Bearer example-test-key");
      expect(init.signal).toBeInstanceOf(AbortSignal);
    }
    expect(fetcher.mock.calls[0][1].signal).not.toBe(fetcher.mock.calls[1][1].signal);
  });

  it("does not retry a non-retryable upstream error", async () => {
    vi.stubEnv("OPENALEX_API_KEY", "");
    const fetcher = vi.fn().mockResolvedValue(new Response("forbidden", { status: 403 }));
    vi.stubGlobal("fetch", fetcher);
    const response = await GET(request());
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "OpenAlex API error", status: 403 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([401, 403])("falls back once to anonymous search when the configured key receives %s", async (status) => {
    vi.stubEnv("OPENALEX_API_KEY", "example-test-key");
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response("rejected", { status }))
      .mockResolvedValueOnce(results());
    vi.stubGlobal("fetch", fetcher);

    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(new Headers(fetcher.mock.calls[0][1].headers).get("Authorization")).toBe("Bearer example-test-key");
    expect(new Headers(fetcher.mock.calls[1][1].headers).has("Authorization")).toBe(false);
    expect(fetcher.mock.calls[1][1].signal).toBeInstanceOf(AbortSignal);
    expect(fetcher.mock.calls[1][0]).not.toContain("example-test-key");
  });

  it.each([429, 503])("does not retry an anonymous fallback that receives %s", async (status) => {
    vi.stubEnv("OPENALEX_API_KEY", "example-test-key");
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response("rejected", { status: 401 }))
      .mockResolvedValueOnce(new Response("unavailable", { status }));
    vi.stubGlobal("fetch", fetcher);

    const response = await GET(request());
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "OpenAlex API error", status });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(new Headers(fetcher.mock.calls[1][1].headers).has("Authorization")).toBe(false);
  });

  it("makes at most three attempts when a transient retry then rejects the key", async () => {
    vi.useFakeTimers();
    vi.stubEnv("OPENALEX_API_KEY", "example-test-key");
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response("slow down", { status: 429 }))
      .mockResolvedValueOnce(new Response("rejected", { status: 403 }))
      .mockResolvedValueOnce(results());
    vi.stubGlobal("fetch", fetcher);

    const pending = GET(request());
    await vi.advanceTimersByTimeAsync(400);
    expect((await pending).status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(new Headers(fetcher.mock.calls[1][1].headers).has("Authorization")).toBe(true);
    expect(new Headers(fetcher.mock.calls[2][1].headers).has("Authorization")).toBe(false);
  });

  it("does not fall back anonymously when a keyed search is rate limited twice", async () => {
    vi.useFakeTimers();
    vi.stubEnv("OPENALEX_API_KEY", "example-test-key");
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response("slow down", { status: 429 }))
      .mockResolvedValueOnce(new Response("slow down", { status: 429 }));
    vi.stubGlobal("fetch", fetcher);

    const pending = GET(request());
    await vi.advanceTimersByTimeAsync(400);
    expect((await pending).status).toBe(502);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(new Headers(fetcher.mock.calls[1][1].headers).has("Authorization")).toBe(true);
  });

  it("bounds the anonymous fallback when it hangs", async () => {
    vi.useFakeTimers();
    vi.stubEnv("OPENALEX_API_KEY", "example-test-key");
    vi.spyOn(AbortSignal, "timeout").mockImplementation((ms: number) => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), ms);
      return controller.signal;
    });
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response("rejected", { status: 403 }))
      .mockImplementationOnce((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new Error("timed out")), { once: true });
      }));
    vi.stubGlobal("fetch", fetcher);

    const pending = GET(request());
    await vi.advanceTimersByTimeAsync(7_000);
    const response = await pending;
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "OpenAlex API error", status: 0 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("returns a failure when both upstream attempts time out", async () => {
    vi.useFakeTimers();
    vi.spyOn(AbortSignal, "timeout").mockImplementation((ms: number) => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), ms);
      return controller.signal;
    });
    const fetcher = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new Error("timed out")), { once: true });
    }));
    vi.stubGlobal("fetch", fetcher);

    const pending = GET(request());
    await vi.advanceTimersByTimeAsync(14_400);
    const response = await pending;
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "OpenAlex API error", status: 0 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("returns an upstream error when a successful response has an unreadable body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("invalid json", { status: 200 })));
    const response = await GET(request());
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "OpenAlex API error", status: 0 });
  });

  it.each([
    null,
    {},
    { results: null },
    { results: "not a list" },
    { results: [null] },
    { results: [{ id: "https://openalex.org/W1", authorships: null }] },
  ])("returns an upstream error for malformed JSON data: %j", async (body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));
    const response = await GET(request());
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "OpenAlex API error", status: 0 });
  });

  it("keeps a valid empty result as a successful search", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ results: [], meta: { count: 0 } })));
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ results: [], total: 0 });
  });
});
