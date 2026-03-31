import type { AgentAction, ToolResult } from "../shared/types";
import { resolveAgentElement, extractProducts } from "./scanner";
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
    showToast(`未找到元素: ${agentId}`, true);
    return {
      success: false,
      actionType: "CLICK",
      message: `未找到元素: ${agentId}`,
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
    showToast(`输入目标不可用: ${agentId}`, true);
    return {
      success: false,
      actionType: "TYPE",
      message: `输入目标不可用: ${agentId}`,
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
    target.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        key: "Enter",
        code: "Enter",
      }),
    );
    target.dispatchEvent(
      new KeyboardEvent("keyup", {
        bubbles: true,
        key: "Enter",
        code: "Enter",
      }),
    );
    target.form?.requestSubmit?.();
  }

  return {
    success: true,
    actionType: "TYPE",
    message: submit ? `已输入并提交 ${text}` : `已输入 ${text}`,
    highlightedAgentId: agentId,
    observation: {
      beforeValue,
      afterValue: target.value,
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
    },
  };
}

async function performExtractList(): Promise<ToolResult> {
  const items = extractProducts(document).slice(0, 10);
  if (items.length === 0) {
    showToast("未提取到商品列表", true);
    return {
      success: false,
      actionType: "EXTRACT_LIST",
      message: "未提取到商品列表",
      errorCode: "NO_PRODUCTS",
      items: [],
    };
  }

  showToast(`已提取 ${items.length} 个商品`);
  return {
    success: true,
    actionType: "EXTRACT_LIST",
    message: `已提取 ${items.length} 个商品`,
    items,
  };
}

export async function executeAction(action: AgentAction): Promise<ToolResult> {
  switch (action.type) {
    case "CLICK":
      return performClick(action.agentId);
    case "TYPE":
      return performType(action.agentId, action.text, action.submit);
    case "SCROLL":
      return performScroll(action.direction, action.amount);
    case "EXTRACT_LIST":
      return performExtractList();
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
