import type { BrowserDriver } from "../../../shared/browser-capability-contract";

export interface ExplicitUrlOverviewInput {
  url: string;
  active?: boolean;
  observationMode?: "bodyOnly" | "bodyAndLinks";
  closeAfterRead?: boolean;
  signal?: AbortSignal;
}

export async function runExplicitUrlOverview(driver: BrowserDriver, input: ExplicitUrlOverviewInput) {
  const tab = await driver.openTab({ url: input.url, active: input.active ?? true }, { signal: input.signal });
  try {
    await driver.waitForStable(tab.tabId, { signal: input.signal });
    return await driver.observe(tab.tabId, {
      signal: input.signal,
      observationMode: input.observationMode,
      updateSessionSnapshot: input.active !== false,
    });
  } finally {
    if (input.closeAfterRead) {
      await driver.closeTab(tab.tabId, { signal: input.signal });
    }
  }
}
