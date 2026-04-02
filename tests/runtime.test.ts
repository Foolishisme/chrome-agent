import { beforeEach, describe, expect, it, vi } from "vitest";
import { isReceiverMissingError, sendMessageToTab } from "../src/background/runtime";

describe("runtime messaging recovery", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("detects the missing receiver error", () => {
    expect(isReceiverMissingError(new Error("Could not establish connection. Receiving end does not exist."))).toBe(true);
    expect(isReceiverMissingError(new Error("some other error"))).toBe(false);
  });

  it("falls back to the direct bridge when the receiver is missing", async () => {
    const sendMessage = vi
      .fn()
      .mockRejectedValueOnce(new Error("Could not establish connection. Receiving end does not exist."));
    const executeScript = vi.fn().mockResolvedValueOnce([{ result: { ok: true, snapshot: { title: "ready" } } }]);
    const getURL = vi.fn().mockReturnValue("chrome-extension://test-id/content-bridge.js");

    vi.stubGlobal("chrome", {
      tabs: {
        sendMessage,
      },
      scripting: {
        executeScript,
      },
      runtime: {
        getURL,
      },
    });

    const response = await sendMessageToTab<{ ok: true; snapshot: { title: string } }>(7, {
      type: "REQUEST_SNAPSHOT",
    });

    expect(response.snapshot.title).toBe("ready");
    expect(getURL).toHaveBeenCalledWith("content-bridge.js");
    expect(executeScript).toHaveBeenCalledWith(
      expect.objectContaining({
        target: { tabId: 7 },
        args: ["chrome-extension://test-id/content-bridge.js", { type: "REQUEST_SNAPSHOT" }],
      }),
    );
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });
});
