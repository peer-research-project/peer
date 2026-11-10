import { describe, expect, it, vi } from "vitest";

// P11-27 rule 2: PaperBody tells the notes store which body it shows (`setBodyOnShow`), while it is drawn, and takes it back when it goes — so that a note or a highlight
// taken on a heading or a caption reads the block's words (the hooks that take them know the section's paragraphs only). The effect runs on the minimal hook runtime
// (no DOM in this suite). Every text is invented.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  const { hookRuntime } = await import("@/test-support/hook-runtime");
  return { ...actual, ...hookRuntime.hooks };
});

import { hookRuntime } from "@/test-support/hook-runtime";
import type { PaperReading } from "@/lib/papers/reading";
import { anchorTextOnShow, setBodyOnShow } from "@/lib/notes/anchor-blocks";
import { PaperBody } from "./paper-body";
import { useLostPassages } from "@/store/notes";

const reading = {
  body: [
    {
      id: "s1",
      heading: "2 Methods of the tidal survey",
      canonical: "methods",
      paragraphs: ["The team walked the shore at dawn."],
      figures: [{ ordinal: 1, label: "Figure 1", caption: "Creep against density.", imageUrl: "/f1.png", after: 0 }],
    },
  ],
} as unknown as PaperReading;

describe("PaperBody — the body on show", () => {
  it("is the body the notes store reads a heading's and a caption's words from, while it is mounted", async () => {
    setBodyOnShow(null);
    expect(anchorTextOnShow("paper-section-0-p1")).toBeUndefined();
    const mounted = await hookRuntime.mount(() => PaperBody({ reading }));
    expect(anchorTextOnShow("paper-section-0-p1")).toBe("2 Methods of the tidal survey");
    expect(anchorTextOnShow("paper-section-0-p2")).toBe("Figure 1 · Creep against density.");
    expect(anchorTextOnShow("paper-section-0-p0")).toBe("The team walked the shore at dawn.");
    mounted.unmount();
    expect(anchorTextOnShow("paper-section-0-p1")).toBeUndefined();
  });
});


it("only reports missing passages while a real body is on screen", async () => {
  useLostPassages.getState().setLost([]);
  const noteAnchors = { "paper-section-0-p0": [{ id: "note-1", n: 1, start: 0, end: 12, quote: "Absent words" }] };
  const mounted = await hookRuntime.mount(() => PaperBody({ reading, noteAnchors }));
  expect(useLostPassages.getState().lost["note-1"]).toBe(true);
  mounted.unmount();
  expect(useLostPassages.getState().lost["note-1"]).toBeUndefined();
  const empty = await hookRuntime.mount(() => PaperBody({ reading: { ...reading, body: [] }, noteAnchors }));
  expect(useLostPassages.getState().lost["note-1"]).toBeUndefined();
  empty.unmount();
});
