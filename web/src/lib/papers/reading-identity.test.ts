import { expect, it } from "vitest";
import { observedReadingKey, readingIdentityStorageKey, recordReadingKey } from "./reading-identity";
it("treats a readable but unwritable stale marker as unknown", () => {
  const old = "p1|public||source:old";
  const stale = { getItem: () => old, setItem: () => { throw new Error("quota"); } };
  recordReadingKey("p1", "p1|public||source:new", stale);
  expect(observedReadingKey("p1", stale)).toBeNull();
  const values = new Map<string, string>();
  const good = { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v); } };
  recordReadingKey("p1", "p1|public||source:new", good);
  expect(values.get(readingIdentityStorageKey("p1"))).toBe("p1|public||source:new");
  expect(observedReadingKey("p1", good)).toBe("p1|public||source:new");
});
