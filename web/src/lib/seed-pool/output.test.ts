import { describe, expect, it } from "vitest";
import { seedOutputContext } from "./output";
const base = { status: "none" as const, schemaInstalled: true, ownerLocalDate: "2026-11-01", timezone: "America/Chicago", snapshot: null, revision: 0, revocationGeneration: 0 };
describe("seed output fence", () => {
  it("only treats specifically absent schema as legacy", () => {
    expect(seedOutputContext({ ...base, schemaInstalled: false, timezone: null, ownerLocalDate: null })).toEqual({ kind: "legacy" });
    expect(seedOutputContext({ ...base, schemaInstalled: null })).toEqual({ kind: "unavailable" });
    expect(seedOutputContext({ ...base, timezone: null })).toEqual({ kind: "unavailable" });
  });
  it("uses target local date and current revocation even for an empty pool", () => {
    expect(seedOutputContext({ ...base, revocationGeneration: 4 }, "2026-11-02")).toEqual({ kind: "ready", localDate: "2026-11-02", version: "none", revocationGeneration: 4, snapshot: null });
    const empty = { version: "v2", effectiveLocalDate: "2026-11-02", revocationGeneration: 4, seeds: [] };
    expect(seedOutputContext({ ...base, snapshot: empty, revocationGeneration: 4 }, "2026-11-02")).toMatchObject({ kind: "ready", version: "v2" });
  });
});
