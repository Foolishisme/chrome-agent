import type { BrowserDriver } from "../capability/browser-driver-contract";

export interface ExplicitUrlOverviewInput {
  url: string;
  active?: boolean;
}

export async function runExplicitUrlOverview(driver: BrowserDriver, input: ExplicitUrlOverviewInput) {
  const tab = await driver.openTab({ url: input.url, active: input.active ?? true });
  await driver.waitForStable(tab.tabId);
  return driver.observe(tab.tabId);
}

