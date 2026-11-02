import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { fetchPaperById } from "./fetch-by-id";
import { GET as metadata } from "@/app/api/papers/[id]/route";
import { GET as reading } from "@/app/api/papers/[id]/reading/route";

describe("paper lookup upstream failures", () => {
  afterEach(() => vi.unstubAllGlobals());
  it.each(["openalex:W1", "arxiv:1234.5678"])("distinguishes missing and unavailable for both routes: %s", async (id) => {
    for (const kind of ["404", "429", "500", "timeout", "invalid"] as const) {
      vi.stubGlobal("fetch", vi.fn(async () => {
        if (kind === "timeout") throw new DOMException("timeout", "TimeoutError");
        if (kind === "invalid") return new Response("not a valid source record", { status: 200 });
        return new Response("", { status: Number(kind) });
      }));
      const params = () => ({ params: Promise.resolve({ id: encodeURIComponent(id) }) });
      const meta = await metadata(new Request("http://localhost"), params());
      const read = await reading(new NextRequest(`http://localhost/api/papers/${encodeURIComponent(id)}/reading`), params());
      expect(meta.status, `${kind} metadata`).toBe(kind === "404" ? 404 : 503);
      expect(read.status, `${kind} reading`).toBe(kind === "404" ? 404 : 503);
      if (kind !== "404") {
        expect(meta.headers.get("cache-control")).toBe("no-store");
        expect(read.headers.get("cache-control")).toBe("no-store");
      }
    }
  });
  it("retains a valid arXiv record and refuses a mismatched record", async () => {
    const xml = (id: string) => `<feed><entry><id>https://arxiv.org/abs/${id}v1</id><title>A valid fictional paper</title><summary>A fictional abstract.</summary><published>2026-01-01</published><author><name>A Researcher</name></author></entry></feed>`;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(xml("1234.5678"))));
    expect((await fetchPaperById("arxiv:1234.5678"))?.abstract).toBe("A fictional abstract.");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(xml("1234.9999"))));
    await expect(fetchPaperById("arxiv:1234.5678")).rejects.toThrow("Invalid arXiv record");
  });

});
