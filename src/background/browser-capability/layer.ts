import type {
  BrowserActionResult,
  BrowserEvaluateInput,
  BrowserEvaluateResult,
  BrowserObservation,
  BrowserOperationOptions,
  BrowserPageProblem,
  BrowserPageProblemCode,
  BrowserRiskLevel,
  BrowserTargetRef,
} from "../../shared/browser-capability";
import type { BrowserCapabilityLayerOptions, BrowserDriver } from "./types";

const HIGH_RISK_MESSAGE = "High-risk browser action requires explicit user confirmation.";

function makeProblem(
  code: BrowserPageProblemCode,
  message: string,
  options: {
    recoverable?: boolean;
    detail?: string;
    suggestedNextAction?: string;
  } = {},
): BrowserPageProblem {
  return {
    code,
    message,
    recoverable: options.recoverable ?? code !== "permission_denied",
    detail: options.detail,
    suggestedNextAction: options.suggestedNextAction,
  };
}

function problemFromError(error: unknown, fallbackCode: BrowserPageProblemCode): BrowserPageProblem {
  const message = error instanceof Error ? error.message : String(error ?? "Unknown browser operation failure.");
  return makeProblem(fallbackCode, message, {
    suggestedNextAction: "Retry with a fresh browser observation or use a lower-permission fallback.",
  });
}

function failedAction(error: unknown, fallbackCode: BrowserPageProblemCode): BrowserActionResult {
  const problem = problemFromError(error, fallbackCode);
  return {
    status: "failed",
    message: problem.message,
    problems: [problem],
    suggestedNextAction: problem.suggestedNextAction,
  };
}

function blockedAction(problem: BrowserPageProblem, targetRef?: BrowserTargetRef): BrowserActionResult {
  return {
    status: "blocked",
    message: problem.message,
    problems: [problem],
    suggestedNextAction: problem.suggestedNextAction,
    targetRef,
  };
}

function throwIfAborted(options?: BrowserOperationOptions) {
  if (options?.signal?.aborted) {
    throw new Error("Browser operation was aborted.");
  }
}

function isHighRisk(riskLevel: BrowserRiskLevel | undefined) {
  return riskLevel === "high_risk_irreversible";
}

export class BrowserCapabilityLayer {
  private readonly activeTargetRefsByTab = new Map<number, Set<string>>();

  constructor(
    private readonly driver: BrowserDriver,
    private readonly options: BrowserCapabilityLayerOptions = {},
  ) {}

  async listTabs(options?: BrowserOperationOptions) {
    throwIfAborted(options);
    return this.driver.listTabs(options);
  }

  async openTab(input: Parameters<BrowserDriver["openTab"]>[0], options?: BrowserOperationOptions) {
    throwIfAborted(options);
    return this.driver.openTab(input, options);
  }

  async closeTab(tabId: number, options?: BrowserOperationOptions) {
    throwIfAborted(options);
    this.activeTargetRefsByTab.delete(tabId);
    try {
      return await this.driver.closeTab(tabId, options);
    } catch (error) {
      return failedAction(error, "operation_failed");
    }
  }

  async focusTab(tabId: number, options?: BrowserOperationOptions) {
    throwIfAborted(options);
    return this.driver.focusTab(tabId, options);
  }

  async navigate(tabId: number, input: Parameters<BrowserDriver["navigate"]>[1], options?: BrowserOperationOptions) {
    throwIfAborted(options);
    this.activeTargetRefsByTab.delete(tabId);
    try {
      return await this.driver.navigate(tabId, input, options);
    } catch (error) {
      return failedAction(error, "navigation_failed");
    }
  }

  async reload(tabId: number, options?: BrowserOperationOptions) {
    throwIfAborted(options);
    this.activeTargetRefsByTab.delete(tabId);
    try {
      return await this.driver.reload(tabId, options);
    } catch (error) {
      return failedAction(error, "navigation_failed");
    }
  }

  async waitForStable(tabId: number, options?: BrowserOperationOptions) {
    throwIfAborted(options);
    try {
      return await this.driver.waitForStable(tabId, options);
    } catch (error) {
      return failedAction(error, "operation_failed");
    }
  }

  async observe(tabId: number, options?: BrowserOperationOptions): Promise<BrowserObservation> {
    throwIfAborted(options);
    try {
      const observation = await this.driver.observe(tabId, options);
      this.activeTargetRefsByTab.set(tabId, new Set(observation.targets.map((target) => target.refId)));
      return observation;
    } catch (error) {
      const problem = problemFromError(error, "operation_failed");
      return {
        tab: {
          tabId,
          active: false,
          status: "unknown",
        },
        url: "",
        title: "",
        mainText: "",
        links: [],
        controls: [],
        targets: [],
        problems: [problem],
        truncated: false,
        coverage: {
          mainTextChars: 0,
          linkCount: 0,
          controlCount: 0,
          targetCount: 0,
        },
      };
    }
  }

  async screenshot(tabId: number, input?: Parameters<BrowserDriver["screenshot"]>[1], options?: BrowserOperationOptions) {
    throwIfAborted(options);
    try {
      return await this.driver.screenshot(tabId, input, options);
    } catch (error) {
      const problem = problemFromError(error, "screenshot_failed");
      return {
        mimeType: "image/png" as const,
        base64: "",
        width: 0,
        height: 0,
        fullPage: input?.fullPage ?? false,
        sanitized: false,
        problems: [problem],
      };
    }
  }

  async click(tabId: number, input: Parameters<BrowserDriver["click"]>[1], options?: BrowserOperationOptions) {
    throwIfAborted(options);
    const blocked = this.checkActionBlocked(tabId, input.targetRef, input.riskLevel);
    if (blocked) {
      return blocked;
    }

    try {
      return await this.driver.click(tabId, input, options);
    } catch (error) {
      return failedAction(error, "operation_failed");
    }
  }

  async type(tabId: number, input: Parameters<BrowserDriver["type"]>[1], options?: BrowserOperationOptions) {
    throwIfAborted(options);
    const blocked = this.checkActionBlocked(tabId, input.targetRef, input.riskLevel);
    if (blocked) {
      return blocked;
    }

    try {
      return await this.driver.type(tabId, input, options);
    } catch (error) {
      return failedAction(error, "operation_failed");
    }
  }

  async press(tabId: number, input: Parameters<BrowserDriver["press"]>[1], options?: BrowserOperationOptions) {
    throwIfAborted(options);
    if (input.targetRef) {
      const blocked = this.checkActionBlocked(tabId, input.targetRef, input.riskLevel);
      if (blocked) {
        return blocked;
      }
    }

    try {
      return await this.driver.press(tabId, input, options);
    } catch (error) {
      return failedAction(error, "operation_failed");
    }
  }

  async scroll(tabId: number, input: Parameters<BrowserDriver["scroll"]>[1], options?: BrowserOperationOptions) {
    throwIfAborted(options);
    try {
      return await this.driver.scroll(tabId, input, options);
    } catch (error) {
      return failedAction(error, "operation_failed");
    }
  }

  async evaluateLimited(
    tabId: number,
    input: BrowserEvaluateInput,
    options?: BrowserOperationOptions,
  ): Promise<BrowserEvaluateResult> {
    throwIfAborted(options);
    if (!this.options.allowExperimentalEvaluate) {
      const problem = makeProblem("evaluate_blocked", "Limited evaluate is internal and disabled by default.", {
        recoverable: true,
        suggestedNextAction: "Use observe, screenshot, or a purpose-built browser tool instead.",
      });
      return {
        ...blockedAction(problem),
        value: undefined,
      };
    }

    if (isHighRisk(input.riskLevel)) {
      const problem = makeProblem("evaluate_blocked", HIGH_RISK_MESSAGE, {
        suggestedNextAction: "Ask the user to confirm the high-risk browser action before continuing.",
      });
      return {
        ...blockedAction(problem),
        value: undefined,
      };
    }

    try {
      return await this.driver.evaluateLimited(tabId, input, options);
    } catch (error) {
      return {
        ...failedAction(error, "operation_failed"),
        value: undefined,
      };
    }
  }

  private checkActionBlocked(tabId: number, targetRef: BrowserTargetRef, riskLevel?: BrowserRiskLevel) {
    if (isHighRisk(riskLevel)) {
      return blockedAction(
        makeProblem("permission_denied", HIGH_RISK_MESSAGE, {
          recoverable: true,
          suggestedNextAction: "Ask the user to confirm the high-risk browser action before continuing.",
        }),
        targetRef,
      );
    }

    const activeRefs = this.activeTargetRefsByTab.get(tabId);
    if (!activeRefs?.has(targetRef.refId)) {
      return blockedAction(
        makeProblem("stale_target", `Target ref "${targetRef.refId}" is stale.`, {
          recoverable: true,
          suggestedNextAction: "Run observe again and retry with a fresh target ref.",
        }),
        targetRef,
      );
    }

    return undefined;
  }
}

export { makeProblem };
