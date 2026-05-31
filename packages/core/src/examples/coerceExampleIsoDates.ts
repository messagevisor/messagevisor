/**
 * Coerce ISO 8601-like strings in example `values` to `Date` for CLI evaluation (ICU date/time formatters).
 *
 * Accepted shapes (non-exhaustive; `Date.parse` must still succeed):
 * - Calendar: `YYYY-MM-DD`
 * - Datetime: `T` or space between date and time; `t` / `z` case-insensitive where applicable
 * - Time: `HH:MM` or `HH:MM:SS`, optional fractional seconds (`.` or `,`), optional `Z` or numeric offset (`±HH`, `±HH:MM`, `±HHMM`)
 */

const ISO_8601_LIKE =
  /^\d{4}-\d{2}-\d{2}(?:[Tt ]\d{2}:\d{2}(?::\d{2})?(?:[.,]\d{1,9})?(?:[Zz]|[+-]\d{2}(?::?\d{2})?)?)?$/;

function isIso8601TimestampString(value: string): boolean {
  const trimmed = value.trim();
  if (!ISO_8601_LIKE.test(trimmed)) {
    return false;
  }

  return !Number.isNaN(Date.parse(coerceParseableIsoLike(trimmed)));
}

/**
 * Normalize a few ISO variants so `Date.parse` behaves consistently (comma decimals, lowercase z).
 */
function normalizeIsoLikeForParse(value: string): string {
  let s = value.trim();
  if (s.includes(",") && /\d{2}:\d{2}(?::\d{2})?,/.test(s)) {
    s = s.replace(",", ".");
  }
  return s;
}

/**
 * If `Date.parse` rejects a valid-looking ISO string, apply small normalizations (hour-only offset).
 */
function coerceParseableIsoLike(trimmed: string): string {
  const commaNormalized = normalizeIsoLikeForParse(trimmed);
  if (!Number.isNaN(Date.parse(commaNormalized))) {
    return commaNormalized;
  }

  const s = commaNormalized;
  if (/[+-]\d{2}:\d{2}$/.test(s) || /[+-]\d{4}$/.test(s)) {
    return s;
  }

  const hourOnlyOffset = s.match(/^(.+)([+-]\d{2})$/);
  if (hourOnlyOffset) {
    const withMinutes = `${hourOnlyOffset[1]}${hourOnlyOffset[2]}:00`;
    if (!Number.isNaN(Date.parse(withMinutes))) {
      return withMinutes;
    }
  }

  return s;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date)
  );
}

function coerceLeaf(value: unknown): unknown {
  if (typeof value === "string" && isIso8601TimestampString(value)) {
    const trimmed = value.trim();
    return new Date(Date.parse(coerceParseableIsoLike(trimmed)));
  }

  if (isPlainObject(value)) {
    return coerceExampleValuesIsoDates(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => coerceLeaf(entry));
  }

  return value;
}

/**
 * Returns a shallow copy with coerced values (nested plain objects and arrays are walked).
 */
export function coerceExampleValuesIsoDates(
  values: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (typeof values === "undefined") {
    return undefined;
  }

  const result: Record<string, unknown> = {};

  for (const key of Object.keys(values)) {
    result[key] = coerceLeaf(values[key]);
  }

  return result;
}
