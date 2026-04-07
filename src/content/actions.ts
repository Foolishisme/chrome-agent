import type { ActionResult, AgentAction } from "../shared/types";
import { extractStructuredProducts } from "./extractor";
import { extractGoogleSearchResults, extractPageFacts } from "./research";
import { resolveAgentElement } from "./scanner";
import { highlightRect, showToast } from "./overlay";

function getElementRect(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

function dispatchInputEvents(input: HTMLInputElement | HTMLTextAreaElement) {
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

async function performClick(agentId: string): Promise<ActionResult> {
  const target = resolveAgentElement(agentId);
  if (!target) {
    showToast(`未找到元素：${agentId}`, true);
    return {
      success: false,
      actionType: "CLICK",
      message: `未找到元素：${agentId}`,
      errorCode: "ELEMENT_NOT_FOUND",
    };
  }

  target.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  highlightRect(getElementRect(target), `点击 ${agentId}`);
  await new Promise((resolve) => window.setTimeout(resolve, 180));
  target.click();

  return {
    success: true,
    actionType: "CLICK",
    message: `已点击 ${agentId}`,
    highlightedAgentId: agentId,
    observation: {
      text: target.textContent?.trim() ?? "",
    },
  };
}

async function performType(agentId: string, text: string, submit = false): Promise<ActionResult> {
  const target = resolveAgentElement(agentId);
  if (!target || !(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
    showToast(`输入目标不可用：${agentId}`, true);
    return {
      success: false,
      actionType: "TYPE",
      message: `输入目标不可用：${agentId}`,
      errorCode: "INPUT_NOT_FOUND",
    };
  }

  const beforeValue = target.value;
  target.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  highlightRect(getElementRect(target), `输入 ${text}`);
  target.focus();
  target.select?.();
  target.value = "";
  dispatchInputEvents(target);
  target.value = text;
  dispatchInputEvents(target);

  if (submit) {
    target.value = text;
    dispatchInputEvents(target);
    target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape", code: "Escape" }));
    target.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Escape", code: "Escape" }));
    target.blur();

    const submitButton = resolveAgentElement("el_search_submit");
    if (submitButton) {
      submitButton.click();
    } else if (target.form?.requestSubmit) {
      target.form.requestSubmit();
    } else {
      target.form?.submit?.();
    }
  }

  return {
    success: true,
    actionType: "TYPE",
    message: submit ? `已输入并提交：${text}` : `已输入：${text}`,
    highlightedAgentId: agentId,
    observation: {
      beforeValue,
      afterValue: target.value,
      submittedValue: submit ? text : undefined,
      submit,
    },
  };
}

async function performScroll(direction: "up" | "down", amount = 640): Promise<ActionResult> {
  const beforeY = window.scrollY;
  window.scrollBy({
    top: direction === "down" ? amount : -amount,
    behavior: "smooth",
  });
  await new Promise((resolve) => window.setTimeout(resolve, 280));
  const afterY = window.scrollY;
  showToast(direction === "down" ? "向下滚动" : "向上滚动");
  return {
    success: true,
    actionType: "SCROLL",
    message: `已${direction === "down" ? "向下" : "向上"}滚动`,
    observation: {
      beforeY,
      afterY,
      direction,
      amount,
    },
  };
}

function isDialogRoot(element: HTMLElement) {
  const attrRole = element.getAttribute("role")?.toLowerCase();
  const className = typeof element.className === "string" ? element.className.toLowerCase() : "";
  return (
    attrRole === "dialog" ||
    attrRole === "alertdialog" ||
    attrRole === "alert" ||
    element.tagName.toLowerCase() === "dialog" ||
    element.getAttribute("aria-modal") === "true" ||
    className.includes("modal") ||
    className.includes("dialog") ||
    className.includes("overlay")
  );
}

function matchesDialogCloseText(text: string) {
  const normalized = text.replace(/\s+/g, "").trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return [
    "关闭",
    "取消",
    "稍后",
    "我知道了",
    "知道了",
    "接受",
    "同意",
    "×",
    "✕",
    "✖",
  ].some((keyword) => normalized.includes(keyword.toLowerCase()));
}

function resolveDialogCloseTarget() {
  const dialogRoots = Array.from(document.querySelectorAll<HTMLElement>("dialog, [role='dialog'], [role='alertdialog'], [role='alert'], [aria-modal='true'], [class*='modal'], [class*='dialog'], [class*='overlay']"))
    .filter((element) => isDialogRoot(element) && !!element.offsetParent);

  for (const dialogRoot of dialogRoots) {
    const candidates = Array.from(dialogRoot.querySelectorAll<HTMLElement>("button, a, [role='button'], [tabindex]"))
      .filter((element) => !!element.offsetParent)
      .map((element) => ({
        element,
        label: [
          element.getAttribute("aria-label"),
          element.getAttribute("title"),
          element.textContent,
        ]
          .filter(Boolean)
          .join(" ")
          .trim(),
      }))
      .filter((candidate) => matchesDialogCloseText(candidate.label));

    if (candidates.length > 0) {
      return candidates[0];
    }
  }

  return undefined;
}

async function performNavigate(url: string): Promise<ActionResult> {
  window.location.assign(url);
  return {
    success: true,
    actionType: "NAVIGATE",
    message: `已跳转到：${url}`,
    navigated: true,
    observation: {
      url,
    },
  };
}

async function performRecoverCloseDialog(): Promise<ActionResult> {
  const target = resolveDialogCloseTarget();
  if (!target) {
    showToast("未找到可关闭的弹窗按钮", true);
    return {
      success: false,
      actionType: "RECOVER_CLOSE_DIALOG",
      message: "未找到可关闭的弹窗按钮",
      recoveryKind: "close_dialog",
      recoveryApplied: false,
      errorCode: "DIALOG_CLOSE_NOT_FOUND",
    };
  }

  const rect = getElementRect(target.element);
  target.element.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  highlightRect(rect, `关闭弹窗: ${target.label || "button"}`);
  await new Promise((resolve) => window.setTimeout(resolve, 160));
  target.element.click();

  return {
    success: true,
    actionType: "RECOVER_CLOSE_DIALOG",
    message: `已尝试关闭弹窗：${target.label || "button"}`,
    highlightedAgentId: undefined,
    recoveryKind: "close_dialog",
    recoveryApplied: true,
    recoveryTarget: target.label || "button",
    observation: {
      label: target.label || "button",
    },
  };
}

async function performExtractList(limit?: number): Promise<ActionResult> {
  const { items, diagnostics } = extractStructuredProducts(document, { limit });
  if (items.length === 0) {
    showToast("未提取到商品列表", true);
    return {
      success: false,
      actionType: "EXTRACT_LIST",
      message: "未提取到商品列表",
      errorCode: "NO_PRODUCTS",
      items: [],
      observation: {
        url: window.location.href,
        title: document.title,
        diagnostics,
      },
    };
  }

  showToast(`已提取 ${items.length} 个商品`);
  return {
    success: true,
    actionType: "EXTRACT_LIST",
    message: `已提取 ${items.length} 个商品`,
    items,
    observation: {
      url: window.location.href,
      title: document.title,
      itemCount: items.length,
      diagnostics,
    },
  };
}

async function performExtractSearchResults(limit?: number): Promise<ActionResult> {
  const { candidates, diagnostics } = extractGoogleSearchResults(document, limit ?? 10);
  if (candidates.length === 0) {
    showToast("未提取到 Google 搜索结果", true);
    return {
      success: false,
      actionType: "EXTRACT_SEARCH_RESULTS",
      message: "未提取到 Google 搜索结果",
      errorCode: "NO_SEARCH_RESULTS",
      researchCandidates: [],
      observation: {
        url: window.location.href,
        title: document.title,
        diagnostics,
      },
    };
  }

  showToast(`已提取 ${candidates.length} 个来源候选`);
  return {
    success: true,
    actionType: "EXTRACT_SEARCH_RESULTS",
    message: `已提取 ${candidates.length} 个来源候选`,
    researchCandidates: candidates,
    observation: {
      url: window.location.href,
      title: document.title,
      diagnostics,
    },
  };
}

async function performExtractPageFacts(): Promise<ActionResult> {
  const pageFacts = extractPageFacts();
  showToast(pageFacts.status === "success" ? "已提取页面事实" : "页面仅得到部分事实", pageFacts.status !== "success");
  return {
    success: true,
    actionType: "EXTRACT_PAGE_FACTS",
    message: pageFacts.status === "success" ? "已提取页面事实" : `页面部分可读：${pageFacts.reason ?? "unknown"}`,
    pageFactsResult: pageFacts,
    observation: {
      url: window.location.href,
      title: document.title,
      status: pageFacts.status,
      textLength: pageFacts.textLength,
      reason: pageFacts.reason,
    },
  };
}

export async function executeAction(action: AgentAction): Promise<ActionResult> {
  switch (action.type) {
    case "CLICK":
      return performClick(action.agentId);
    case "TYPE":
      return performType(action.agentId, action.text, action.submit);
    case "NAVIGATE":
      return performNavigate(action.url);
    case "SCROLL":
      return performScroll(action.direction, action.amount);
    case "RECOVER_CLOSE_DIALOG":
      return performRecoverCloseDialog();
    case "EXTRACT_LIST":
      return performExtractList(action.limit);
    case "EXTRACT_SEARCH_RESULTS":
      return performExtractSearchResults(action.limit);
    case "EXTRACT_PAGE_FACTS":
      return performExtractPageFacts();
    case "DONE":
      return {
        success: true,
        actionType: "DONE",
        message: action.summary,
        items: action.items,
      };
  }

  const unreachable: never = action;
  throw new Error(`Unhandled action: ${JSON.stringify(unreachable)}`);
}
