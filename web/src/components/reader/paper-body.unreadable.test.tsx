import { describe, expect, it, vi } from "vitest";
vi.mock("react", async (original) => {
  const actual = await original<typeof import("react")>();
  const { hookRuntime } = await import("@/test-support/hook-runtime");
  return { ...actual, ...hookRuntime.hooks };
});
import { hookRuntime } from "@/test-support/hook-runtime";
import { buildReading } from "@/lib/papers/reading";
import { useLostPassages } from "@/store/notes";
import type { Paper } from "@/types";
import { PaperBody } from "./paper-body";

const paper: Paper = { id: "p", title: "Invented", authors: [], relevanceReason: "", venue: "", source: "other", summaryIntro: "", summaryExperimentKeywords: [], summaryResultDiscussion: "", isSaved: false };
const base = buildReading(paper, null);
const anchors = { "paper-section-0-p0": [{ id: "saved", n: 1, start: 0, end: 8, quote: "old text" }] };
describe("unreadable body and anchor status", () => {
  it("does not mark a saved anchor lost for a blank section", async () => {
    useLostPassages.getState().setLost([]);
    const reading = { ...base, body: [{ id: "s1", heading: "Methods", paragraphs: ["  ", "\n"] }] } as typeof base;
    const mounted = await hookRuntime.mount(() => PaperBody({ reading, noteAnchors: anchors }));
    expect(useLostPassages.getState().lost.saved).toBeUndefined();
    mounted.unmount();
  });
  it("still marks it lost when a readable changed body has no match", async () => {
    useLostPassages.getState().setLost([]);
    const reading = { ...base, body: [{ id: "s1", heading: "Methods", paragraphs: ["Different actual text"] }] } as typeof base;
    const mounted = await hookRuntime.mount(() => PaperBody({ reading, noteAnchors: anchors }));
    expect(useLostPassages.getState().lost.saved).toBe(true);
    mounted.unmount();
  });
});
