/**
 * Shared helpers for working with date inputs and query parameters.
 */

/**
 * Parses an ISO 8601 date string into a {@link Date} or returns `null` if parsing fails.
 */
export function parseISODate(value: string | null | undefined): Date | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }
  return date
}

/**
 * Parses a `YYYY-MM-DD` string into a {@link Date} or returns `null` if parsing fails.
 */
export function parseDateOnlyString(
  value: string | null | undefined
): Date | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null

  const date = new Date(`${trimmed}T00:00:00`)
  if (Number.isNaN(date.getTime())) {
    return null
  }
  return date
}

/**
 * Formats a {@link Date} into a `YYYY-MM-DD` string suitable for query params.
 */
export function formatDateOnlyParam(
  value: Date | null | undefined
): string | null {
  if (!value) return null
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, "0")
  const day = String(value.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/**
 * Converts a {@link Date} into an ISO string representing the start or end of the day.
 */
export function dateToBoundaryIso(
  value: Date | null | undefined,
  boundary: "start" | "end" = "start"
): string | null {
  if (!value) return null
  const date = new Date(value)
  if (boundary === "start") {
    date.setHours(0, 0, 0, 0)
  } else {
    date.setHours(23, 59, 59, 999)
  }
  return date.toISOString()
}
