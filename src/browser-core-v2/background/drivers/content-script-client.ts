import type {
  BrowserActionResult,
  BrowserClickInput,
  BrowserObservation,
  BrowserPressInput,
  BrowserScrollInput,
  BrowserTypeInput,
} from "../../../shared/browser-capability";
import type { BrowserCoreLinksAndControls, BrowserCoreReadableContent } from "../../shared/types";

export interface BrowserCoreV2ContentScriptClient {
  observe(tabId: number): Promise<BrowserObservation>;
  readContent(tabId: number): Promise<BrowserCoreReadableContent>;
  getLinksAndControls(tabId: number): Promise<BrowserCoreLinksAndControls>;
  click(tabId: number, input: BrowserClickInput): Promise<BrowserActionResult>;
  type(tabId: number, input: BrowserTypeInput): Promise<BrowserActionResult>;
  press(tabId: number, input: BrowserPressInput): Promise<BrowserActionResult>;
  scroll(tabId: number, input: BrowserScrollInput): Promise<BrowserActionResult>;
}

export class UnwiredContentScriptClient implements BrowserCoreV2ContentScriptClient {
  private fail(): never {
    throw new Error("Browser Core V2 content script client is not wired to chrome.scripting yet.");
  }

  observe(): Promise<BrowserObservation> {
    this.fail();
  }

  readContent(): Promise<BrowserCoreReadableContent> {
    this.fail();
  }

  getLinksAndControls(): Promise<BrowserCoreLinksAndControls> {
    this.fail();
  }

  click(): Promise<BrowserActionResult> {
    this.fail();
  }

  type(): Promise<BrowserActionResult> {
    this.fail();
  }

  press(): Promise<BrowserActionResult> {
    this.fail();
  }

  scroll(): Promise<BrowserActionResult> {
    this.fail();
  }
}
