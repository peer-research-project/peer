import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { UploadAvailabilityMessage } from "./upload-button";

describe("upload availability explanation", () => {
  it("explains checking and failure and offers retry for both", () => {
    for (const [state, text] of [["unknown", "Checking whether"], ["unavailable", "PDF upload is not enabled"]] as const) {
      const html = renderToStaticMarkup(createElement(UploadAvailabilityMessage, { state, onRetry: () => {} }));
      expect(html).toContain(text);
      expect(html).toContain(">Retry</button>");
    }
  });
  it("clears the explanation once available", () => {
    expect(renderToStaticMarkup(createElement(UploadAvailabilityMessage, { state: "available", onRetry: () => {} }))).toBe("");
  });
});
