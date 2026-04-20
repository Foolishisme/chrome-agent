import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { buildBrowserCoreSnapshot } from "../../src/browser-core-v2/content/dom-snapshot";

describe("Browser Core V2 DOM snapshot", () => {
  it("extracts visible links, controls, and stable refs with vanilla DOM", () => {
    const dom = new JSDOM(
      `<!doctype html>
      <html>
        <head><title>Snapshot Example</title></head>
        <body>
          <main>
            <h1>Snapshot target</h1>
            <p>This page has enough readable content for the snapshot to summarize the main text.</p>
            <p>The DOM snapshot should expose links and controls without using CDP.</p>
            <a href="/docs">Docs</a>
            <button>Continue</button>
            <input aria-label="Search docs" value="" />
          </main>
        </body>
      </html>`,
      { url: "https://example.com/" },
    );

    const snapshot = buildBrowserCoreSnapshot(dom.window.document, { tabId: 7, textLimit: 500 });

    expect(snapshot.url).toBe("https://example.com/");
    expect(snapshot.links).toMatchObject([
      {
        text: "Docs",
        url: "https://example.com/docs",
        targetRef: {
          tabId: 7,
          refId: "bcv2-link-1",
          source: "content_script",
        },
      },
    ]);
    expect(snapshot.controls.map((control) => control.targetRef.refId)).toEqual(["bcv2-button-1", "bcv2-input-1"]);
    expect(snapshot.coverage).toMatchObject({
      linkCount: 1,
      controlCount: 2,
      targetCount: 3,
    });
  });
});
