import type { AgentAction, ToolResult } from "../shared/types";
import { extractStructuredProducts } from "./extractor";
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

async function performClick(agentId: string): Promise<ToolResult> {
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

async function performType(agentId: string, text: string, submit = false): Promise<ToolResult> {
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
    // Prefer clicking the explicit submit button so JD autocomplete does not hijack Enter
    // and replace the typed query with a highlighted suggestion.
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

async function performScroll(direction: "up" | "down", amount = 640): Promise<ToolResult> {
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

async function performNavigate(url: string): Promise<ToolResult> {
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

async function performExtractList(limit?: number): Promise<ToolResult> {
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

export async function executeAction(action: AgentAction): Promise<ToolResult> {
  switch (action.type) {
    case "CLICK":
      return performClick(action.agentId);
    case "TYPE":
      return performType(action.agentId, action.text, action.submit);
    case "NAVIGATE":
      return performNavigate(action.url);
    case "SCROLL":
      return performScroll(action.direction, action.amount);
    case "EXTRACT_LIST":
      return performExtractList(action.limit);
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
