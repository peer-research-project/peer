import "server-only";
import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from "node:dns";
import { isIP } from "node:net";
import { Agent } from "undici";
import ipaddr from "ipaddr.js";

const MAX_REDIRECTS = 5;
const MAX_FETCH_MS = 15_000;
const MAX_RESPONSE_BYTES = 20_000_000;

// IANA special-purpose registries, entries marked not globally reachable or
// unspecified as of 2026-11-10. Reject whole ranges conservatively, including
// globally reachable exceptions nested in a non-global allocation. The
// library's range() check below additionally rejects translation/multicast.
// https://www.iana.org/assignments/iana-ipv4-special-registry/
// https://www.iana.org/assignments/iana-ipv6-special-registry/
const NON_GLOBAL_V4 = [
  "0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8",
  "169.254.0.0/16", "172.16.0.0/12", "192.0.0.0/24", "192.0.0.170/31",
  "192.0.2.0/24", "192.88.99.0/24", "192.168.0.0/16", "198.18.0.0/15",
  "198.51.100.0/24", "203.0.113.0/24", "240.0.0.0/4",
].map((cidr) => ipaddr.IPv4.parseCIDR(cidr));
const NON_GLOBAL_V6 = [
  "::/128", "::1/128", "::ffff:0:0/96", "64:ff9b:1::/48", "100::/64",
  "100:0:0:1::/64", "2001::/23", "2001:db8::/32", "2002::/16", "3fff::/20",
  "5f00::/16", "fc00::/7", "fe80::/10",
].map((cidr) => ipaddr.IPv6.parseCIDR(cidr));

/** The libraries' reserved ranges include mapped, translation, documentation,
 * multicast, loopback and other non-public address families. */
export function isPublicAddress(address: string): boolean {
  try {
    const parsed = ipaddr.parse(address);
    if (parsed.range() !== "unicast") return false;
    return parsed.kind() === "ipv4"
      ? !NON_GLOBAL_V4.some((range) => parsed.match(range))
      : !NON_GLOBAL_V6.some((range) => parsed.match(range));
  } catch {
    return false;
  }
}

type Resolver = (hostname: string, options: { all: true; verbatim: true }, callback: (error: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void) => void;
type AllCallback = (error: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void;
type SingleCallback = (error: NodeJS.ErrnoException | null, address: string, family: number) => void;

/** The resolver is invoked by the socket, not in an earlier validation step.
 * Returning the validated answers to the socket binds validation to the IP
 * that is actually dialled and keeps the original hostname for TLS. */
export function makePublicLookup(resolve: Resolver = dnsLookup as Resolver) {
  return (hostname: string, options: LookupOptions, callback: AllCallback | SingleCallback): void => {
    resolve(hostname, { all: true, verbatim: true }, (error, addresses) => {
      if (error || !addresses?.length || addresses.some((entry) => !isPublicAddress(entry.address))) {
        const failure = error ?? Object.assign(new Error("Blocked non-public destination"), { code: "EACCES" });
        if (options.all) (callback as AllCallback)(failure, []);
        else (callback as SingleCallback)(failure, "", 0);
        return;
      }
      if (options.all) (callback as AllCallback)(null, addresses);
      else (callback as SingleCallback)(null, addresses[0].address, addresses[0].family);
    });
  };
}

function validateUrl(raw: string, testPort?: number): URL {
  const url = new URL(raw);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || (url.port && Number(url.port) !== testPort) || !url.hostname) {
    throw new Error("Blocked destination URL");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  // Literal IPs skip DNS and therefore must be checked before fetch.
  if (isIP(host) && !isPublicAddress(host)) throw new Error("Blocked non-public destination");
  if (host.toLowerCase().replace(/\.$/, "") === "localhost") throw new Error("Blocked non-public destination");
  return url;
}

/** Bound the decoded stream even for metadata JSON or a single oversized
 * network chunk. Preserve the source URL for relative links and paywall logic. */
function boundedResponse(response: Response): Response {
  if (!response.body) return response;
  const reader = response.body.getReader();
  let size = 0;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) { controller.close(); return; }
        size += value.byteLength;
        if (size > MAX_RESPONSE_BYTES) {
          void reader.cancel().catch(() => {});
          controller.error(new Error("Response too large"));
          return;
        }
        controller.enqueue(value);
      } catch (error) { controller.error(error); }
    },
    async cancel(reason) { await reader.cancel(reason); },
  }, { highWaterMark: 0 });
  const bounded = new Response(stream, { status: response.status, statusText: response.statusText, headers: response.headers });
  Object.defineProperties(bounded, {
    url: { value: response.url },
    redirected: { value: response.redirected },
    type: { value: response.type },
  });
  return bounded;
}

/** Fetch public sources only. Every redirect is separately checked, while
 * `redirect: manual` is preserved for callers with their own stricter policy. */
function createFetcher(resolver: Resolver, testPort?: number) {
  const agent = new Agent({ connect: { lookup: makePublicLookup(resolver) as never } });
  return async function publicFetch(raw: string, init: RequestInit = {}): Promise<Response> {
  if (init.method && init.method.toUpperCase() !== "GET") throw new Error("Only GET is supported");
  const headers = new Headers(init.headers);
  for (const sensitive of ["authorization", "cookie", "proxy-authorization", "host", "x-api-key"]) headers.delete(sensitive);
  const signal = init.signal
    ? AbortSignal.any([init.signal, AbortSignal.timeout(MAX_FETCH_MS)])
    : AbortSignal.timeout(MAX_FETCH_MS);
  let current = validateUrl(raw, testPort);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const options = { ...init, headers, signal, redirect: "manual" as const, dispatcher: agent };
    const response = await fetch(current.href, options);
    if (init.redirect === "manual" || ![301, 302, 303, 307, 308].includes(response.status)) return boundedResponse(response);
    const location = response.headers.get("location");
    void response.body?.cancel().catch(() => {});
    if (!location || hop === MAX_REDIRECTS) throw new Error("Invalid or excessive redirects");
    current = validateUrl(new URL(location, current).href, testPort);
  }
  throw new Error("Excessive redirects");
  };
}

export const publicFetch = createFetcher(dnsLookup as Resolver);

/** Socket integration tests inject only a resolver and fixture port. */
export function __createPublicFetchForTests(resolver: Resolver, fixturePort: number) {
  return createFetcher(resolver, fixturePort);
}
