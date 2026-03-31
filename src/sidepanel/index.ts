import { DEFAULT_GOAL, STATUS_LABELS } from "../shared/constants";
import type { SessionPublicState } from "../shared/types";

const app = document.getElementById("app")!;

let currentState: SessionPublicState = {
  status: "idle",
  currentStep: 0,
  plan: [],
  items: [],
  updatedAt: Date.now(),
};

let lastGoal = DEFAULT_GOAL;

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function render() {
  const itemsRows =
    currentState.items.length > 0
      ? currentState.items
          .map(
            (item) => `
              <tr>
                <td><a class="result-link" href="${escapeHtml(item.url)}" target="_blank">${escapeHtml(item.title)}</a></td>
                <td>${escapeHtml(item.priceText)}</td>
                <td>${escapeHtml(item.shopText ?? "-")}</td>
                <td>${escapeHtml(item.summary ?? (item.tags?.join(" / ") ?? "-"))}</td>
              </tr>
            `,
          )
          .join("")
      : `<tr><td colspan="4" class="muted">No extracted items yet.</td></tr>`;

  const timeline = [
    ...(currentState.plan.length
      ? [
          `<div class="timeline-item">
            <div class="timeline-head"><span>Plan</span><span>${currentState.plan.length} steps</span></div>
            <div class="timeline-body">${currentState.plan.map((item) => escapeHtml(item)).join("<br />")}</div>
          </div>`,
        ]
      : []),
    ...(currentState.stepSummary
      ? [
          `<div class="timeline-item">
            <div class="timeline-head"><span>Latest</span><span>${new Date(currentState.updatedAt).toLocaleTimeString()}</span></div>
            <div class="timeline-body">${escapeHtml(currentState.stepSummary)}</div>
          </div>`,
        ]
      : []),
    ...(currentState.lastAction
      ? [
          `<div class="timeline-item">
            <div class="timeline-head"><span>Action</span><span>${escapeHtml(currentState.lastAction.type)}</span></div>
            <div class="timeline-body"><pre>${escapeHtml(JSON.stringify(currentState.lastAction, null, 2))}</pre></div>
          </div>`,
        ]
      : []),
    ...(currentState.lastActionResult
      ? [
          `<div class="timeline-item">
            <div class="timeline-head"><span>Result</span><span>${currentState.lastActionResult.success ? "OK" : "FAIL"}</span></div>
            <div class="timeline-body">${escapeHtml(currentState.lastActionResult.message)}</div>
          </div>`,
        ]
      : []),
  ].join("");

  app.innerHTML = `
    <div class="panel-shell">
      <section class="hero">
        <h1>Browser Agent MVP</h1>
        <p>Run the fixed JD demo flow: search laptops around CNY 5000, extract results, and return a concise recommendation.</p>
      </section>

      <section class="section">
        <h2>Session</h2>
        <div class="controls">
          <textarea id="goal-input" class="goal-input" placeholder="Describe the shopping goal">${escapeHtml(lastGoal)}</textarea>
          <div class="button-row">
            <button id="start-button" class="button-primary">Start</button>
            <button id="retry-button" class="button-secondary">Retry</button>
            <button id="stop-button" class="button-danger">Stop</button>
          </div>
        </div>
      </section>

      <section class="section">
        <h2>Status</h2>
        <div class="status-grid">
          <div class="status-card">
            <span class="status-label">Runtime</span>
            <span class="status-value"><span class="pill">${STATUS_LABELS[currentState.status]}</span></span>
          </div>
          <div class="status-card">
            <span class="status-label">Step</span>
            <span class="status-value">${currentState.currentStep}</span>
          </div>
          <div class="status-card">
            <span class="status-label">Items</span>
            <span class="status-value">${currentState.items.length}</span>
          </div>
          <div class="status-card">
            <span class="status-label">Session</span>
            <span class="status-value">${escapeHtml(currentState.sessionId?.slice(0, 8) ?? "-")}</span>
          </div>
        </div>
      </section>

      <section class="section">
        <h2>Timeline</h2>
        <div class="timeline">${timeline || `<div class="muted">Waiting for session start.</div>`}</div>
      </section>

      <section class="section">
        <h2>Results</h2>
        <table class="result-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Price</th>
              <th>Shop</th>
              <th>Summary</th>
            </tr>
          </thead>
          <tbody>${itemsRows}</tbody>
        </table>
        ${
          currentState.finalSummary
            ? `<p class="muted"><strong>Recommendation:</strong> ${escapeHtml(currentState.finalSummary)}</p>`
            : `<p class="muted">When enough products are extracted, the structured comparison and recommendation will appear here.</p>`
        }
      </section>

      ${
        currentState.error
          ? `<section class="section"><div class="error-box">${escapeHtml(currentState.error)}</div></section>`
          : ""
      }
    </div>
  `;

  const goalInput = document.getElementById("goal-input") as HTMLTextAreaElement | null;
  const startButton = document.getElementById("start-button");
  const retryButton = document.getElementById("retry-button");
  const stopButton = document.getElementById("stop-button");

  startButton?.addEventListener("click", async () => {
    const goal = goalInput?.value.trim() || DEFAULT_GOAL;
    lastGoal = goal;
    await chrome.runtime.sendMessage({
      type: "START_SESSION",
      goal,
    });
  });

  retryButton?.addEventListener("click", async () => {
    await chrome.runtime.sendMessage({
      type: "START_SESSION",
      goal: lastGoal,
    });
  });

  stopButton?.addEventListener("click", async () => {
    await chrome.runtime.sendMessage({
      type: "STOP_SESSION",
    });
  });
}

function applyState(next: SessionPublicState | undefined) {
  if (!next) {
    return;
  }
  currentState = next;
  if (next.goal) {
    lastGoal = next.goal;
  }
  render();
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "SESSION_UPDATE" || message.type === "SESSION_ERROR") {
    applyState(message.payload as SessionPublicState);
  }
});

async function bootstrap() {
  const response = (await chrome.runtime.sendMessage({
    type: "REQUEST_SESSION_STATE",
  })) as { ok: boolean; payload?: SessionPublicState };

  if (response.ok && response.payload) {
    applyState(response.payload);
  } else {
    render();
  }
}

render();
void bootstrap();
