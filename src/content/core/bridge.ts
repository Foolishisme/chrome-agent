import { buildBrowserCoreSnapshot } from "./dom-snapshot";
import { getLinksAndControls } from "./links-controls";
import { getBrowserCorePageState } from "./page-state";
import { clickRef, pressKey, scrollPage, typeIntoRef } from "./interactions";
import { extractReadableContent } from "./readable-content";
import type { BrowserCoreContentBridge } from "../../shared/browser-core/types";

export function createBrowserCoreContentBridge(doc: Document = document, win: Window = window): BrowserCoreContentBridge {
  return {
    snapshot: () => buildBrowserCoreSnapshot(doc),
    readContent: () => extractReadableContent(doc),
    getLinksAndControls: () => getLinksAndControls(doc),
    getPageState: () => getBrowserCorePageState(doc),
    click: (refId) => clickRef(refId, doc),
    type: (refId, text, options) => typeIntoRef(refId, text, { ...options, root: doc }),
    press: (key, refId) => pressKey(key, refId, doc),
    scroll: (direction, amount) => scrollPage(direction, amount, win),
  };
}

export function installBrowserCoreContentBridge() {
  (globalThis as typeof globalThis & { __browserCoreV2Bridge?: BrowserCoreContentBridge }).__browserCoreV2Bridge =
    createBrowserCoreContentBridge();
}

