import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const page = readFileSync("src/app/welcome/page.tsx", "utf8").replace(/\r\n/g, "\n");
describe("seed setup navigation wiring", () => {
  it("connects editor state to ordinary exits and labels explicit discard", () => {
    expect(page).toContain('<SeedPool onboarding onProgress={setSeedProgress} />');
    expect(page).toContain('key === "seed" && (seedProgress.busy || seedProgress.dirty)');
    expect(page).toContain('if (!canContinue) return;');
    expect(page).toContain('!seedBlocked && (i <= topicsIdx || topicsSatisfied)');
    expect(page).toContain('disabled={step === 0 || seedBlocked}');
    expect(page).toContain('onClick={skipEverything}\n            disabled={seedBlocked}');
    expect(page).toContain('disabled={seedProgress.busy} onClick={() => { setSeedProgress');
    expect(page).toContain('and discard unsaved changes');
  });
});

