import type { ElementRect } from "../shared/types";

const ROOT_ID = "__browser_agent_mvp_overlay__";

function ensureRoot() {
  let root = document.getElementById(ROOT_ID);
  if (!root) {
    root = document.createElement("div");
    root.id = ROOT_ID;
    root.innerHTML = `
      <div data-role="highlight"></div>
      <div data-role="cursor"></div>
      <div data-role="toast"></div>
    `;
    const style = document.createElement("style");
    style.textContent = `
      #${ROOT_ID} {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 2147483647;
      }

      #${ROOT_ID} [data-role="highlight"] {
        position: fixed;
        border: 2px solid rgba(40, 197, 187, 0.95);
        border-radius: 10px;
        box-shadow: 0 0 0 6px rgba(40, 197, 187, 0.14);
        background: rgba(40, 197, 187, 0.08);
        opacity: 0;
        transition: all 160ms ease;
      }

      #${ROOT_ID} [data-role="cursor"] {
        position: fixed;
        width: 18px;
        height: 18px;
        margin-left: -9px;
        margin-top: -9px;
        border-radius: 50%;
        background: radial-gradient(circle at 30% 30%, #ffffff 0%, #ffd485 40%, #ea6a1f 100%);
        box-shadow: 0 0 18px rgba(234, 106, 31, 0.55);
        opacity: 0;
        transition: all 180ms ease;
      }

      #${ROOT_ID} [data-role="toast"] {
        position: fixed;
        right: 20px;
        bottom: 20px;
        max-width: 260px;
        padding: 10px 12px;
        border-radius: 12px;
        background: rgba(32, 28, 24, 0.88);
        color: #fff;
        font-size: 12px;
        line-height: 1.5;
        opacity: 0;
        transform: translateY(10px);
        transition: all 180ms ease;
      }
    `;
    root.appendChild(style);
    document.documentElement.appendChild(root);
  }
  return root;
}

function getPart(role: string) {
  const root = ensureRoot();
  return root.querySelector<HTMLElement>(`[data-role="${role}"]`);
}

export function highlightRect(rect: ElementRect, message?: string, error = false) {
  const highlight = getPart("highlight");
  const cursor = getPart("cursor");
  const toast = getPart("toast");
  if (!highlight || !cursor || !toast) {
    return;
  }

  highlight.style.opacity = "1";
  highlight.style.left = `${rect.x}px`;
  highlight.style.top = `${rect.y}px`;
  highlight.style.width = `${rect.width}px`;
  highlight.style.height = `${rect.height}px`;
  highlight.style.borderColor = error ? "rgba(209, 67, 67, 0.95)" : "rgba(40, 197, 187, 0.95)";
  highlight.style.boxShadow = error
    ? "0 0 0 6px rgba(209, 67, 67, 0.14)"
    : "0 0 0 6px rgba(40, 197, 187, 0.14)";
  highlight.style.background = error ? "rgba(209, 67, 67, 0.08)" : "rgba(40, 197, 187, 0.08)";

  cursor.style.opacity = "1";
  cursor.style.left = `${rect.x + rect.width / 2}px`;
  cursor.style.top = `${rect.y + rect.height / 2}px`;

  if (message) {
    toast.textContent = message;
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
  }

  window.setTimeout(() => {
    highlight.style.opacity = "0";
    cursor.style.opacity = "0";
    toast.style.opacity = "0";
    toast.style.transform = "translateY(10px)";
  }, 1300);
}

export function showToast(message: string, error = false) {
  const toast = getPart("toast");
  if (!toast) {
    return;
  }
  toast.textContent = message;
  toast.style.opacity = "1";
  toast.style.transform = "translateY(0)";
  toast.style.background = error ? "rgba(138, 40, 40, 0.92)" : "rgba(32, 28, 24, 0.88)";

  window.setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(10px)";
  }, 1500);
}
