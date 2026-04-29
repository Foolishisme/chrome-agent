import { describe, expect, it } from "vitest";
import { BrowserCapabilityLayer, MockBrowserDriver } from "../src/background/browser/capability";
import type {
  BrowserObservation,
  BrowserScreenshot,
  BrowserTabRef,
  BrowserTargetRef,
} from "../src/shared/browser-capability";

const tab: BrowserTabRef = {
  tabId: 1,
  windowId: 1,
  url: "https://example.com/",
  title: "Example",
  active: true,
  status: "complete",
};

const targetRef: BrowserTargetRef = {
  tabId: 1,
  refId: "ref-1",
  role: "button",
  name: "Continue",
  text: "Continue",
  bounds: { x: 10, y: 20, width: 120, height: 32 },
  source: "mock",
};

function createObservation(overrides: Partial<BrowserObservation> = {}): BrowserObservation {
  return {
    tab,
    url: "https://example.com/",
    title: "Example",
    mainText: "A short structured page snapshot.",
    links: [
      {
        text: "Docs",
        url: "https://example.com/docs",
      },
    ],
    controls: [
      {
        targetRef,
      },
    ],
    targets: [targetRef],
    problems: [],
    truncated: false,
    coverage: {
      mainTextChars: 33,
      linkCount: 1,
      controlCount: 1,
      targetCount: 1,
    },
    ...overrides,
  };
}

const screenshot: BrowserScreenshot = {
  mimeType: "image/png",
  base64: "iVBORw0KGgo=",
  width: 100,
  height: 80,
  fullPage: false,
  sanitized: true,
  problems: [],
};

describe("BrowserCapabilityLayer Phase 0 contract", () => {
  it("exercises the mock driver through the complete driver contract", async () => {
    const driver = new MockBrowserDriver({
      tabs: [tab],
      observations: { 1: createObservation() },
      screenshots: { 1: screenshot },
    });
    const layer = new BrowserCapabilityLayer(driver);

    expect(await layer.listTabs()).toHaveLength(1);
    expect((await layer.openTab({ url: "https://example.com/new", active: false })).url).toBe("https://example.com/new");
    expect((await layer.focusTab(1)).active).toBe(true);
    expect((await layer.waitForStable(1)).status).toBe("success");
    expect((await layer.reload(1)).navigated).toBe(true);
    await layer.observe(1);
    expect((await layer.click(1, { targetRef })).status).toBe("success");
    expect((await layer.type(1, { targetRef, text: "hello" })).status).toBe("success");
    expect((await layer.press(1, { targetRef, key: "Enter" })).status).toBe("success");
    expect((await layer.scroll(1, { direction: "down", amount: 500 })).status).toBe("success");
    expect((await layer.screenshot(1, { fullPage: true })).fullPage).toBe(true);
    expect((await layer.closeTab(1)).status).toBe("success");
  });

  it("returns structured observation and action results", async () => {
    const driver = new MockBrowserDriver({
      tabs: [tab],
      observations: { 1: createObservation() },
      screenshots: { 1: screenshot },
    });
    const layer = new BrowserCapabilityLayer(driver);

    const observation = await layer.observe(1);
    expect(observation.mainText).toContain("structured");
    expect(observation.targets[0]).toMatchObject({ refId: "ref-1", source: "mock" });

    const clicked = await layer.click(1, { targetRef, riskLevel: "low_risk_write" });
    expect(clicked).toMatchObject({
      status: "success",
      targetRef: expect.objectContaining({ refId: "ref-1" }),
    });

    const typed = await layer.type(1, { targetRef, text: "draft text", riskLevel: "low_risk_write" });
    expect(typed.status).toBe("success");
  });

  it("converts driver errors into page problems instead of leaking exceptions", async () => {
    const driver = new MockBrowserDriver({
      tabs: [tab],
      failures: {
        observe: new Error("CDP detached while reading DOM."),
      },
    });
    const layer = new BrowserCapabilityLayer(driver);

    await expect(layer.observe(1)).resolves.toMatchObject({
      problems: [
        {
          code: "operation_failed",
          message: "CDP detached while reading DOM.",
        },
      ],
    });
  });

  it("converts screenshot failures into structured screenshot problems", async () => {
    const driver = new MockBrowserDriver({
      tabs: [tab],
      failures: {
        screenshot: "capture failed",
      },
    });
    const layer = new BrowserCapabilityLayer(driver);

    await expect(layer.screenshot(1)).resolves.toMatchObject({
      width: 0,
      height: 0,
      sanitized: false,
      problems: [
        {
          code: "screenshot_failed",
          message: "capture failed",
        },
      ],
    });
  });

  it("treats target refs as stale after navigation", async () => {
    const driver = new MockBrowserDriver({
      tabs: [tab],
      observations: { 1: createObservation() },
    });
    const layer = new BrowserCapabilityLayer(driver);

    await layer.observe(1);
    await layer.navigate(1, { url: "https://example.com/next" });
    const result = await layer.click(1, { targetRef });

    expect(result.status).toBe("blocked");
    expect(result.problems[0]?.code).toBe("stale_target");
    expect(driver.calls.filter((call) => call.method === "click")).toHaveLength(0);
  });

  it("blocks high-risk actions before they reach the driver", async () => {
    const driver = new MockBrowserDriver({
      tabs: [tab],
      observations: { 1: createObservation() },
    });
    const layer = new BrowserCapabilityLayer(driver);

    await layer.observe(1);
    const result = await layer.type(1, {
      targetRef,
      text: "send irreversible content",
      submit: true,
      riskLevel: "high_risk_irreversible",
    });

    expect(result.status).toBe("blocked");
    expect(result.problems[0]?.code).toBe("permission_denied");
    expect(driver.calls.filter((call) => call.method === "type")).toHaveLength(0);
  });

  it("keeps evaluateLimited disabled by default", async () => {
    const driver = new MockBrowserDriver({
      tabs: [tab],
      actionResults: {
        evaluateLimited: {
          status: "success",
          message: "should not run by default",
          problems: [],
          value: 42,
        },
      },
    });
    const layer = new BrowserCapabilityLayer(driver);

    const result = await layer.evaluateLimited(1, { scriptId: "read-title" });

    expect(result.status).toBe("blocked");
    expect(result.problems[0]?.code).toBe("evaluate_blocked");
    expect(driver.calls.filter((call) => call.method === "evaluateLimited")).toHaveLength(0);
  });
});
