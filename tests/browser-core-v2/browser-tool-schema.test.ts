import { describe, expect, it } from "vitest";
import { BROWSER_CORE_V2_ACTIONS, BrowserCoreV2ToolInputSchema } from "../../src/browser-core-v2/background/facade/browser-tool-schema";

describe("Browser Core V2 browser tool schema", () => {
  it("allows only the store-safe first action set", () => {
    expect(BROWSER_CORE_V2_ACTIONS).toEqual(["open", "navigate", "observe", "read", "extractLinksAndControls", "finalize"]);
    expect(BrowserCoreV2ToolInputSchema.parse({ action: "open", url: "https://example.com/" })).toMatchObject({
      action: "open",
    });
  });

  it("rejects debugger, CDP, and raw evaluate actions", () => {
    for (const action of ["debugger", "cdp", "evaluate"]) {
      expect(() => BrowserCoreV2ToolInputSchema.parse({ action, tabId: 1 })).toThrow();
    }
  });
});
