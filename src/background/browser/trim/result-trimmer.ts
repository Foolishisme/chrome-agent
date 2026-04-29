import { trimText } from "../../../content/core/trimming";
import type { BrowserObservation } from "../../../shared/browser-capability";

export function trimBrowserObservation(observation: BrowserObservation, options: { maxMainTextChars?: number; maxLinks?: number; maxControls?: number } = {}) {
  const mainText = trimText(observation.mainText, options.maxMainTextChars ?? 2_000);
  const links = observation.links.slice(0, options.maxLinks ?? 40);
  const controls = observation.controls.slice(0, options.maxControls ?? 40);

  return {
    ...observation,
    mainText: mainText.text,
    links,
    controls,
    truncated: observation.truncated || mainText.truncated || links.length < observation.links.length || controls.length < observation.controls.length,
    coverage: {
      ...observation.coverage,
      mainTextChars: mainText.text.length,
      linkCount: links.length,
      controlCount: controls.length,
    },
  };
}

