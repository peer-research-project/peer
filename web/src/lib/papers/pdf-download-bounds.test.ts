import { afterEach, describe, expect, it, vi } from "vitest";
import { getPdfBytes } from "./pdf-text";
import { tryPdfCandidates } from "@/lib/figures/pdf-extract";
import { barChart, bodyText, figurePdf } from "@/lib/figures/figure-pdf.test-helper";
import { readBoundedResponse } from "./bounded-response";

const LIMIT = 18_000_000;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function oversizedResponse(contentLength?: string) {
  let pulls = 0;
  const cancel = vi.fn();
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls += 1;
      if (pulls === 1) controller.enqueue(new Uint8Array(LIMIT));
      else if (pulls === 2) controller.enqueue(new Uint8Array(1));
      else controller.enqueue(new Uint8Array(1024));
    },
    cancel,
  }, { highWaterMark: 0 });
  const headers: Record<string, string> = { "content-type": "application/pdf" };
  if (contentLength) headers["content-length"] = contentLength;
  return { response: new Response(stream, { headers }), cancel, pulls: () => pulls };
}

function stalledResponse() {
  const cancel = vi.fn();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new TextEncoder().encode("%PDF-")); },
    pull() { return new Promise<void>(() => {}); },
    cancel,
  }, { highWaterMark: 0 });
  return { response: new Response(stream, { headers: { "content-type": "application/pdf" } }), cancel };
}

describe("bounded PDF downloads", () => {
  it("copies many small chunks without retaining a reference to each one", async () => {
    const count = 16_384;
    let position = 0;
    const chunk = new Uint8Array(1);
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (position === count) return controller.close();
        chunk[0] = position % 251;
        position += 1;
        controller.enqueue(chunk);
      },
    }, { highWaterMark: 0 });
    const bytes = await readBoundedResponse(new Response(stream), count, new AbortController().signal);
    expect(bytes).toEqual(Buffer.from(Array.from({ length: count }, (_, i) => i % 251)));
  });

  it.each(["text", "figure"])("cancels the %s response body on an unsuccessful status", async (kind) => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ cancel });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(stream, { status: 403 })));
    if (kind === "text") {
      expect(await getPdfBytes("https://example.test/status-text.pdf")).toMatchObject({ status: 403 });
    } else {
      expect((await tryPdfCandidates("https://example.test/status-figure.pdf", "publisher")).status).toBe("source_unavailable");
    }
    expect(cancel).toHaveBeenCalledOnce();
  });

  it.each([undefined, "1"])("stops the text PDF stream when length is %s", async (length) => {
    const source = oversizedResponse(length);
    vi.stubGlobal("fetch", vi.fn(async () => source.response));
    const result = await getPdfBytes(`https://example.test/text-${length ?? "missing"}.pdf`);
    expect(result).toEqual({ error: "PDF too large for safe extraction." });
    expect(source.pulls()).toBe(2);
    expect(source.cancel).toHaveBeenCalledOnce();
  });

  it.each([undefined, "1"])("stops the figure PDF stream when length is %s", async (length) => {
    const source = oversizedResponse(length);
    vi.stubGlobal("fetch", vi.fn(async () => source.response));
    const result = await tryPdfCandidates(`https://example.test/figure-${length ?? "missing"}.pdf`, "publisher");
    expect(result.status).toBe("source_unavailable");
    expect(result.reason).toContain("too large");
    expect(source.pulls()).toBe(2);
    expect(source.cancel).toHaveBeenCalledOnce();
  });

  it("times out a text response that stalls after the headers", async () => {
    vi.useFakeTimers();
    const source = stalledResponse();
    vi.stubGlobal("fetch", vi.fn(async () => source.response));
    const work = getPdfBytes("https://example.test/stalled-text.pdf");
    await vi.advanceTimersByTimeAsync(12_000);
    expect(await work).toEqual({ error: "Error: Response timed out." });
    expect(source.cancel).toHaveBeenCalledOnce();
  });

  it("times out a figure response that stalls after the headers", async () => {
    vi.useFakeTimers();
    const source = stalledResponse();
    vi.stubGlobal("fetch", vi.fn(async () => source.response));
    const work = tryPdfCandidates("https://example.test/stalled-figure.pdf", "publisher");
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await work).status).toBe("source_unavailable");
    expect(source.cancel).toHaveBeenCalledOnce();
  });

  it("keeps normal text PDFs and extracts normal figure PDFs", async () => {
    const bytes = figurePdf([{ text: [...bodyText(["Example scientific text."], 80), ["Figure 1. Example chart.", 72, 440, 9]], shapes: barChart(110, 250) }]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array(bytes), { headers: { "content-type": "application/pdf" } })));
    const textResult = await getPdfBytes("https://example.test/normal-text.pdf");
    expect("bytes" in textResult && textResult.bytes.equals(bytes)).toBe(true);
    const figureResult = await tryPdfCandidates("https://example.test/normal-figure.pdf", "publisher");
    expect(figureResult.status).toBe("candidates");
    expect(figureResult.candidates[0]?.caption).toContain("Figure 1");
  });
});
