export function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function trimText(value: string, maxChars: number) {
  const normalized = normalizeWhitespace(value);
  if (normalized.length <= maxChars) {
    return {
      text: normalized,
      truncated: false,
    };
  }

  return {
    text: normalized.slice(0, Math.max(0, maxChars - 1)).trimEnd(),
    truncated: true,
  };
}

export function buildTextExcerpt(segments: string[], maxChars: number) {
  const picked: string[] = [];
  let total = 0;

  for (const segment of segments) {
    const normalized = normalizeWhitespace(segment);
    if (!normalized) {
      continue;
    }

    const separatorLength = picked.length > 0 ? 2 : 0;
    const nextLength = total + separatorLength + normalized.length;
    if (picked.length > 0 && nextLength > maxChars) {
      break;
    }

    if (picked.length === 0 && normalized.length > maxChars) {
      const trimmed = trimText(normalized, maxChars);
      picked.push(trimmed.text);
      total = trimmed.text.length;
      break;
    }

    picked.push(normalized);
    total = nextLength;
  }

  return picked.join("\n\n");
}

