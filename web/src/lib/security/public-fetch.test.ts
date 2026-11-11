import type { LookupAddress } from "node:dns";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { __createPublicFetchForTests, isPublicAddress, makePublicLookup, publicFetch } from "./public-fetch";

const blocked = [
  "127.0.0.1", "10.0.0.1", "172.16.0.1", "192.168.0.1", "169.254.169.254",
  "100.64.0.1", "0.0.0.0", "198.18.0.1", "203.0.113.1", "224.0.0.1",
  "::1", "::", "fc00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:8.8.8.8",
  "64:ff9b::a00:1", "2002:0808:0808::", "2001:db8::1", "2001::1",
  "100:0:0:1::1", "100:0:0:1:ffff:ffff:ffff:ffff", "3fff::1", "5f00::1", "192.88.99.1",
];

describe("public source fetch security", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each(blocked)("rejects non-public address %s", (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it.each(["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])("accepts global address %s", (address) => {
    expect(isPublicAddress(address)).toBe(true);
  });

  it("rejects a mixed DNS response rather than returning the public member", async () => {
    const lookup = makePublicLookup((_host, _opts, cb) => cb(null, [
      { address: "8.8.8.8", family: 4 }, { address: "127.0.0.1", family: 4 },
    ]));
    const result = await new Promise<{ code?: string; addresses: unknown }>((resolve) => {
      lookup("example.test", { all: true }, (error: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => resolve({ code: error?.code, addresses }));
    });
    expect(result.code).toBe("EACCES");
    expect(result.addresses).toEqual([]);
  });

  it("hands only the checked DNS answers to the actual socket lookup", async () => {
    const answers = [{ address: "8.8.8.8", family: 4 }, { address: "2606:4700:4700::1111", family: 6 }];
    const resolve = vi.fn((_host, _options, callback) => callback(null, answers));
    const lookup = makePublicLookup(resolve);
    const result = await new Promise<unknown>((done) => lookup("example.test", { all: true }, (_error: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => done(addresses)));
    expect(resolve).toHaveBeenCalledWith("example.test", { all: true, verbatim: true }, expect.any(Function));
    expect(result).toEqual(answers);
  });

  it.each([
    "http://127.0.0.1/", "http://2130706433/", "http://0x7f000001/", "http://localhost./",
    "http://[::1]/", "https://user:pass@example.com/", "https://example.com:8080/", "file:///etc/passwd",
  ])("refuses unsafe URL %s before making a request", async (url) => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await expect(publicFetch(url)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("blocks a redirect from a public host to a private destination", async () => {
    const cancel = vi.fn();
    const first = new Response(new ReadableStream({ cancel }), { status: 302, headers: { location: "http://127.0.0.1/private" } });
    const fetcher = vi.fn().mockResolvedValue(first); vi.stubGlobal("fetch", fetcher);
    await expect(publicFetch("https://papers.example/item")).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("checks every relative redirect, strips secrets and supplies a pinned dispatcher", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "/paper" } })).mockResolvedValueOnce(new Response("ok"));
    vi.stubGlobal("fetch", fetcher);
    await publicFetch("https://papers.example/start", { headers: { Authorization: "secret", Cookie: "session=x", Accept: "text/html" } });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1][0]).toBe("https://papers.example/paper");
    for (const [, options] of fetcher.mock.calls) {
      expect(options.dispatcher).toBeDefined();
      expect(options.redirect).toBe("manual");
      expect(options.headers.get("authorization")).toBeNull();
      expect(options.headers.get("cookie")).toBeNull();
      expect(options.headers.get("accept")).toBe("text/html");
    }
  });


  it.each([
    [{ address: "127.0.0.1", family: 4 }],
    [{ address: "8.8.8.8", family: 4 }, { address: "127.0.0.1", family: 4 }],
  ])("blocks a real dispatcher connection when DNS returns private or mixed addresses", async (...addresses) => {
    let hits = 0;
    const server = createServer((_req, res) => { hits++; res.end("fixture"); });
    await new Promise<void>((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    const resolver = vi.fn((_host, _opts, callback) => callback(null, addresses));
    const guarded = __createPublicFetchForTests(resolver, port);
    try {
      await expect(guarded(`http://fixture.test:${port}/`)).rejects.toThrow();
      expect(resolver).toHaveBeenCalledOnce();
      expect(hits).toBe(0);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("bounds a large decoded response and retains the final URL", async () => {
    const cancel = vi.fn();
    const source = new Response(new ReadableStream({
      pull(controller) { controller.enqueue(new Uint8Array(20_000_001)); },
      cancel,
    }, { highWaterMark: 0 }));
    Object.defineProperty(source, "url", { value: "https://papers.example/paper" });
    vi.stubGlobal("fetch", vi.fn(async () => source));
    const res = await publicFetch("https://papers.example/paper");
    expect(res.url).toBe("https://papers.example/paper");
    await expect(res.arrayBuffer()).rejects.toThrow("Response too large");
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("bounds redirect loops", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 302, headers: { location: "/again" } }));
    vi.stubGlobal("fetch", fetcher);
    await expect(publicFetch("https://papers.example/start")).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(6);
  });

  it("preserves manual redirect policy for callers with stricter host rules", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 302, headers: { location: "http://127.0.0.1" } }));
    vi.stubGlobal("fetch", fetcher);
    const response = await publicFetch("https://papers.example/start", { redirect: "manual" });
    expect(response.status).toBe(302);
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
