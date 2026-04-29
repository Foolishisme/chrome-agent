import { parseBrowserCoreV2ToolInput } from "./browser-tool-schema";
import type { BrowserDriver } from "../capability/types";

export class BrowserCoreV2ToolFacade {
  constructor(private readonly driver: BrowserDriver) {}

  async run(input: unknown) {
    const parsed = parseBrowserCoreV2ToolInput(input);

    switch (parsed.action) {
      case "open":
        return this.driver.openTab({ url: parsed.url, active: parsed.active });
      case "navigate":
        return this.driver.navigate(parsed.tabId, { url: parsed.url, active: parsed.active });
      case "observe":
        return this.driver.observe(parsed.tabId);
      case "read":
        return this.driver.observe(parsed.tabId);
      case "extractLinksAndControls": {
        const observation = await this.driver.observe(parsed.tabId);
        return {
          links: observation.links,
          controls: observation.controls,
          targets: observation.targets,
          coverage: observation.coverage,
        };
      }
      case "finalize":
        return {
          status: parsed.status,
          summary: parsed.summary,
        };
    }
  }
}

