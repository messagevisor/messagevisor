import type { FormatPresets } from "@messagevisor/types";

/** Fixed instants for stable catalog output across builds and locales. */
const SAMPLE_DATE_UTC = Date.UTC(2004, 2, 14, 15, 9, 26);

function sampleNumberForPreset(style: string | undefined): number {
  switch (style) {
    case "percent":
      return 0.715;
    case "currency":
      return 1234.56;
    case "unit":
      return 3.5;
    default:
      return 1234.567;
  }
}

function computePreviewForBucket(
  locale: string,
  kind: "number" | "date" | "time",
  presetKey: string,
  computedFormats: FormatPresets | undefined,
): string | undefined {
  const bucket =
    kind === "number"
      ? computedFormats?.number?.[presetKey]
      : kind === "date"
        ? computedFormats?.date?.[presetKey]
        : computedFormats?.time?.[presetKey];

  if (!bucket || typeof bucket !== "object" || Array.isArray(bucket)) {
    return undefined;
  }

  try {
    if (kind === "number") {
      const opts = bucket as Record<string, unknown> & { style?: string };
      const sample = sampleNumberForPreset(opts.style);
      return new Intl.NumberFormat(locale, opts as Intl.NumberFormatOptions).format(sample);
    }

    const sampleDate = new Date(SAMPLE_DATE_UTC);
    return new Intl.DateTimeFormat(locale, bucket as Intl.DateTimeFormatOptions).format(sampleDate);
  } catch {
    return undefined;
  }
}

/**
 * Adds `examplePreview` to format rows under `number.*`, `date.*`, and `time.*` (same preview
 * for all rows that share the same preset bucket, e.g. `number.money`).
 */
export function attachFormatExamplePreviews<R extends { path: string }>(
  localeKey: string,
  computedFormats: FormatPresets | undefined,
  rows: R[],
): Array<R & { examplePreview?: string }> {
  const cache = new Map<string, string | undefined>();

  return rows.map((row) => {
    const segments = row.path.split(".").filter(Boolean);
    if (segments.length < 2) {
      return row;
    }

    const kind = segments[0];
    if (kind !== "number" && kind !== "date" && kind !== "time") {
      return row;
    }

    const presetKey = segments[1];
    const cacheKey = `${kind}.${presetKey}`;
    if (!cache.has(cacheKey)) {
      cache.set(cacheKey, computePreviewForBucket(localeKey, kind, presetKey, computedFormats));
    }

    const preview = cache.get(cacheKey);
    if (!preview) {
      return row;
    }

    return { ...row, examplePreview: preview };
  });
}
