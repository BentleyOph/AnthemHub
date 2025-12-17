export type ResultFileValue = string | string[] | null | undefined;

function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/**
 * Normalize a result_file_url value (string or string array) into a clean array of URLs.
 */
export function normalizeResultFileUrls(value: ResultFileValue): string[] {
  if (!value) {
    return [];
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return [];
    }

    // Handle JSON-encoded values stored in text columns (e.g. '["url1","url2"]')
    const parsed = tryParseJson(trimmed);
    if (Array.isArray(parsed)) {
      return parsed
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter((entry) => entry.length > 0);
    }

    if (typeof parsed === "string" && parsed.trim().length > 0) {
      return [parsed.trim()];
    }

    return [trimmed];
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
      .filter((entry) => entry.length > 0);
  }

  return [];
}

/**
 * Get the first URL from a normalized result_file_url value.
 */
export function getPrimaryResultFileUrl(value: ResultFileValue): string | null {
  return normalizeResultFileUrls(value)[0] ?? null;
}
