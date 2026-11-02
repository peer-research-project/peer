import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { RawItem } from "@/lib/sources/types";
const item: RawItem = { id: "openalex:W1", source: "openalex", title: "A fictional paper", authors: [], url: "https://doi.org/10.1234/test", publishedAt: "2026-01-01", metadata: { doi: "10.1234/test" } };
vi.mock("@/lib/utils/openalex", () => ({ openAlexWorkToRawItem: () => structuredClone(item) }));
vi.mock("@/lib/papers/full-text", () => ({ getFullText: vi.fn(async () => ({ status: "no_full_text", attempts: [] })) }));
import { GET as metadata } from "@/app/api/papers/[id]/route";
import { GET as reading } from "@/app/api/papers/[id]/reading/route";

describe("publisher challenges", () => {
  afterEach(() => vi.unstubAllGlobals());
  it.each(["CAPTCHA", "Checking your browser", "cf-chl-example"])("records HTTP 200 %s as blocked, never cached absence", async (challenge) => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("api.openalex.org")) return Response.json({ id: "W1", title: "A fictional paper" });
      if (url.includes("semanticscholar.org")) return Response.json({ abstract: null });
      if (url.includes("crossref.org")) return Response.json({ message: {} });
      return new Response(`<html>${challenge}</html>`, { status: 200 });
    }));
    const params = () => ({ params: Promise.resolve({ id: "openalex%3AW1" }) });
    const meta = await metadata(new Request("http://localhost"), params());
    expect((await meta.json()).abstractRetrieval).toMatchObject({ status: "blocked", attempts: expect.arrayContaining([expect.objectContaining({ source: "publisher", status: "blocked", httpStatus: 200 })]) });
    expect(meta.headers.get("cache-control")).toBe("no-store");
    const read = await reading(new NextRequest("http://localhost/api/papers/openalex%3AW1/reading"), params());
    expect(read.headers.get("cache-control")).toBe("no-store");
  });
});
