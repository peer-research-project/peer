// R-BYOK-1 (manager, 2026-11-05; defect D-BYOK-1): what the report hook asks for, and when it
// says the model could not finish.
//
// Measured on peer-test with the owner's own key: a standalone uploaded PDF (`upload:<hash16>`,
// full text read, no abstract) with Profile "Deep report" off asked for the abstract-tier report;
// the route's abstract tier, holding no abstract, returned the empty `noLlm` report WITHOUT
// calling the model; and the page said "Your model could not finish; what is below is the paper's
// own text." — a model failure no model had. Rule 1: a standalone upload is a paper whose full
// text the reader supplied, so with a model it gets the deep report, like an attached PDF.
// Rule 2: the empty report reads as a failure only when a model was actually asked.
//
// The stream and the JSON fallback are stubs (no network, no model); the hook runs on
// `test-support/hook-runtime`. Every paper and key below is invented.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  const { hookRuntime } = await import("@/test-support/hook-runtime");
  return { ...actual, ...hookRuntime.hooks };
});

type Event = Record<string, unknown>;
type Script = (body: Record<string, unknown>) => Event[];

const net = vi.hoisted(() => ({
  streamCalls: [] as Array<Record<string, unknown>>,
  jsonCalls: [] as Array<Record<string, unknown>>,
  script: null as unknown,
  /** What the JSON fallback answers. */
  json: null as unknown,
}));

vi.mock("@/lib/papers/report-stream", () => ({
  streamPaperReport: async function* (body: Record<string, unknown>) {
    net.streamCalls.push(body);
    for (const event of (net.script as Script)(body)) yield event;
  },
}));
vi.mock("@/lib/api", () => ({
  apiFetch: async (_path: string, init?: { body?: string }) => {
    net.jsonCalls.push(JSON.parse(init?.body ?? "{}") as Record<string, unknown>);
    return net.json;
  },
}));
vi.mock("@/components/profile-sync", () => ({
  useSyncGate: (select: (state: { authOutcome: string }) => unknown) => select({ authOutcome: "signed-in" }),
}));

import { hookRuntime } from "@/test-support/hook-runtime";
import { emptyReport } from "@/lib/papers/report";
import { buildReading, describeAvailability } from "@/lib/papers/reading";
import { defaultProfile, type Paper, type UserProfile } from "@/types";
import { useModelReport, type ModelReportState } from "./use-model-report";

function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, String(value)),
  };
}
const quietWindow = Object.assign(Object.create(globalThis) as object, {
  addEventListener: () => {},
  removeEventListener: () => {},
});

// An invented placeholder, never a key: nothing leaves the process.
const keyed: UserProfile = { ...defaultProfile, feedAiProvider: "gemini", feedAiApiKey: "placeholder-not-a-key", deepReportEnabled: false };
const noKey: UserProfile = { ...defaultProfile, feedAiApiKey: "", deepReportEnabled: false };

/** A standalone uploaded PDF as the page holds it: full text read, no abstract. */
const standalone: Paper = {
  id: "upload:0f1e2d3c4b5a6978",
  title: "An Invented Note on Canopy Water Retention",
  authors: [],
  relevanceReason: "",
  venue: "",
  source: "other",
  summaryIntro: "",
  summaryExperimentKeywords: [],
  summaryResultDiscussion: "",
  isSaved: false,
  textStatus: "ok",
};
/** A public paper with an abstract. */
const withAbstract: Paper = {
  ...standalone,
  id: "arxiv:2611.00001",
  title: "An Invented Study of Seaweed Mulch",
  summaryIntro: "We test seaweed mulch on sandy plots.",
  summaryResultDiscussion: "Mulched plots kept more soil water.",
};
/** A public paper Peer has no abstract for (and no attached PDF). */
const noAbstract: Paper = { ...standalone, id: "openalex:W0000000001", title: "An Invented Course Page" };

const mode = (aiMode: string): Event => ({ type: "mode", aiMode });
const stage = (name: string, pct: number): Event => ({ type: "stage", stage: name, label: name, pct });
const reportOf = (report: unknown): Event => ({ type: "report", report });
const modelReport = (body: Record<string, unknown>) => ({
  noLlm: false,
  depth: body.deepReport ? "deep" : "abstract",
  skim: [],
  whatItProposes: { summary: "Invented.", methods: [] },
  resultsAndSignificance: { summary: "", keyResults: [] },
  provenance: { basis: body.deepReport ? "model-full-text" : "model-abstract", droppedClaims: 0 },
});

/**
 * The route as it streams, stood in for: Tier 0 without a key; with one, the abstract tier asks
 * the model only about an abstract (none: the empty report, no call), and the deep tier reads the
 * full text (`reading`) and asks the model about it.
 */
const route: Script = (body) => {
  if (!body.llmOverride) return [mode("tier0"), stage("done", 100)];
  if (body.deepReport) return [mode("tier2"), stage("source", 10), stage("reading", 35), stage("writing", 75), reportOf(modelReport(body))];
  const paper = body.paper as Paper;
  const abstract = [paper.summaryIntro, paper.summaryResultDiscussion].filter(Boolean).join(" ");
  return [mode("tier1"), stage("writing", 20), reportOf(abstract.trim() ? modelReport(body) : emptyReport("fallback"))];
};

async function open(paper: Paper, profile: UserProfile): Promise<ModelReportState> {
  const opened = await hookRuntime.mount(() => useModelReport({ paper, profile }), { maxRounds: 200 });
  opened.unmount();
  return opened.value;
}

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
  vi.stubGlobal("window", quietWindow);
  net.streamCalls.length = 0;
  net.jsonCalls.length = 0;
  net.script = route;
  net.json = emptyReport("fallback");
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("R-BYOK-1 (1): a standalone upload with a model gets the deep report", () => {
  it("(a) standalone upload + the reader's key + Deep report off: the request is a deep one, and the report is shown", async () => {
    const state = await open(standalone, keyed);
    expect(net.streamCalls).toHaveLength(1);
    expect(net.streamCalls[0].deepReport).toBe(true);
    expect(state.report?.depth).toBe("deep");
    expect(state.failed).toBe(false);
  });

  it("(b) a public paper with an abstract + key + Deep report off: unchanged, the abstract tier", async () => {
    const state = await open(withAbstract, keyed);
    expect(net.streamCalls).toHaveLength(1);
    expect(net.streamCalls[0].deepReport).toBe(false);
    expect(state.report?.depth).toBe("abstract");
    expect(state.failed).toBe(false);
  });

  it("(c) no key: no model request goes out (no key on the wire, not deep), and nothing reads as a failure", async () => {
    for (const paper of [standalone, withAbstract, noAbstract]) {
      net.streamCalls.length = 0;
      const state = await open(paper, noKey);
      for (const body of net.streamCalls) {
        expect(body.llmOverride).toBeUndefined();
        expect(body.deepReport).toBe(false);
      }
      expect(net.jsonCalls).toHaveLength(0);
      expect(state.report).toBeNull();
      expect(state.failed).toBe(false);
    }
  });
});

describe("R-BYOK-1 (2): 'could not finish' only when a model was asked and failed", () => {
  it("(d) the server returns the empty report for an abstract-tier request with no abstract: no model was asked, so no failure", async () => {
    const state = await open(noAbstract, keyed);
    expect(net.streamCalls).toHaveLength(1);
    expect(net.streamCalls[0].deepReport).toBe(false);
    expect(state.report).toBeNull();
    expect(state.failed).toBe(false);
    // What the page then says (it hands `failed` to the Decision block as `modelFailed`): the
    // reading's own honest line, and no "could not finish".
    const sentences = describeAvailability({
      reading: buildReading(noAbstract, null, new Date("2026-11-05T12:00:00.000Z")),
      report: null,
      providerConfigured: true,
      profileHasProject: false,
      modelFailed: state.failed,
    });
    expect(sentences).toEqual(["Peer could not retrieve an abstract — only the record. Open it at the source to judge it."]);
    expect(sentences.join(" ")).not.toContain("could not finish");
  });

  it("(d, JSON path) the same empty report from the JSON fallback, with no abstract sent: no failure", async () => {
    net.script = () => [mode("tier1"), { type: "error", message: "Peer could not finish the report stream." }];
    const state = await open(noAbstract, keyed);
    expect(net.jsonCalls).toHaveLength(1);
    // The stream broke and the request was asked again as JSON; that answer is what settles it, and
    // it is the honest empty report of an abstract-tier request with no abstract: nothing was asked.
    expect(state.report).toBeNull();
    expect(state.failed).toBe(false);
  });

  it("(e) a real model failure — the abstract tier asked about an abstract and got the empty report — still fails", async () => {
    net.script = () => [mode("tier1"), stage("writing", 20), reportOf(emptyReport("fallback"))];
    const state = await open(withAbstract, keyed);
    expect(state.report).toBeNull();
    expect(state.failed).toBe(true);
    const sentences = describeAvailability({
      reading: buildReading(withAbstract, null, new Date("2026-11-05T12:00:00.000Z")),
      report: null,
      providerConfigured: true,
      profileHasProject: false,
      modelFailed: state.failed,
    });
    expect(sentences).toContain("Your model could not finish; what is below is the paper's own text.");
  });

  it("(e) a deep read that reached the full text and came back empty still fails (standalone upload)", async () => {
    net.script = () => [mode("tier2"), stage("source", 10), stage("reading", 35), stage("writing", 75), reportOf(emptyReport("fallback"))];
    const state = await open(standalone, keyed);
    expect(net.streamCalls[0].deepReport).toBe(true);
    expect(state.failed).toBe(true);
  });

  it("(e) a deep request with no full text found and no abstract: the fallback asked no model, so no failure", async () => {
    net.script = () => [mode("tier2"), stage("source", 10), stage("writing", 75), reportOf(emptyReport("fallback"))];
    const state = await open(noAbstract, { ...keyed, deepReportEnabled: true });
    expect(net.streamCalls[0].deepReport).toBe(true);
    expect(state.failed).toBe(false);
  });

  it("(e) a stream error is still a failure, abstract or none", async () => {
    net.script = () => [mode("tier2"), stage("reading", 35), { type: "error", message: "Peer could not finish the report stream." }];
    const state = await open(standalone, keyed);
    expect(state.failed).toBe(true);
  });
});
