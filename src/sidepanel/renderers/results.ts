import { escapeHtml, RenderState } from "./common";

function renderArtifactDetail(title: string, content: string, open = false) {
  return `
    <details class="source-card"${open ? " open" : ""}>
      <summary class="source-summary">
        <span>${escapeHtml(title)}</span>
      </summary>
      <div class="source-body">${content}</div>
    </details>
  `;
}

function renderDocumentArtifact(renderState: RenderState, index: number) {
  const artifact = renderState.documentArtifacts[index];
  if (!artifact) {
    return "";
  }

  return `
    <div class="source-card">
      <div class="source-summary document-summary">
        <span>${escapeHtml(artifact.title)}</span>
        <span class="document-actions">
          <button
            type="button"
            class="button-secondary action-button action-button-small"
            data-copy-artifact-index="${index}"
          >
            ${escapeHtml(renderState.messages.documentCopyButton)}
          </button>
          <button
            type="button"
            class="button-secondary action-button action-button-small"
            data-download-artifact-index="${index}"
          >
            ${escapeHtml(renderState.messages.documentDownloadButton)}
          </button>
        </span>
      </div>
    </div>
  `;
}

export function renderResultsSection(renderState: RenderState) {
  const outputMode =
    renderState.currentState.finalResult?.outputMode ?? (renderState.documentArtifacts.length > 0 ? "artifact" : "inline");
  const errorMarkup = renderState.currentState.error ? `<div class="error-box">${escapeHtml(renderState.currentState.error)}</div>` : "";
  const noticeMarkup = renderState.uiNotice ? `<div class="notice-box notice-${renderState.uiNoticeTone}">${escapeHtml(renderState.uiNotice)}</div>` : "";

  const documentsMarkup =
    renderState.documentArtifacts.length > 0
      ? `
        <div class="timeline">
          ${renderArtifactDetail(
            renderState.messages.resultDocumentsTitle,
            renderState.documentArtifacts.map((_, index) => renderDocumentArtifact(renderState, index)).join(""),
            true,
          )}
        </div>
        `
      : "";

  if (!renderState.currentState.finalResult) {
    return "";
  }

  if (outputMode === "inline") {
    return "";
  }

  return `
    ${errorMarkup}
    ${noticeMarkup}
    ${documentsMarkup || `<div class="muted">${escapeHtml(renderState.messages.documentEmpty)}</div>`}
  `;
}
