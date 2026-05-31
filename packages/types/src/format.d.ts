/**
 * ECMA-402 / ICU-related format preset types (for `Intl.*Format` and skeleton strings).
 */

/**
 * Digit, grouping, notation, and rounding fields shared by all `Intl.NumberFormat` style variants (ECMA-402).
 */
export interface FormatNumberPresetShared {
  useGrouping?: boolean | "min2" | "auto" | "always";
  minimumIntegerDigits?: number;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  minimumSignificantDigits?: number;
  maximumSignificantDigits?: number;
  notation?: "standard" | "scientific" | "engineering" | "compact";
  compactDisplay?: "short" | "long";
  signDisplay?: "auto" | "never" | "always" | "exceptZero" | "negative";
  roundingPriority?: "auto" | "morePrecision" | "lessPrecision";
  roundingIncrement?:
    | 1
    | 2
    | 5
    | 10
    | 20
    | 25
    | 50
    | 100
    | 200
    | 250
    | 500
    | 1000
    | 2000
    | 2500
    | 5000;
  roundingMode?:
    | "ceil"
    | "floor"
    | "expand"
    | "trunc"
    | "halfCeil"
    | "halfFloor"
    | "halfExpand"
    | "halfTrunc"
    | "halfEven";
  trailingZeroDisplay?: "auto" | "stripIfInteger";
  numberingSystem?: string;
}

/**
 * Default / plain number formatting (`style` omitted or `"decimal"`). Do not set `currency` or `unit` here — use {@link FormatNumberCurrencyPreset} or {@link FormatNumberUnitPreset}.
 */
export type FormatNumberDecimalPreset = FormatNumberPresetShared & {
  style?: "decimal";
  currency?: never;
  currencyDisplay?: never;
  currencySign?: never;
  unit?: never;
  unitDisplay?: never;
};

/**
 * Currency formatting. `currency` may be omitted when the application supplies one at runtime.
 */
export type FormatNumberCurrencyPreset = FormatNumberPresetShared & {
  style: "currency";
  currency?: string;
  currencyDisplay?: "code" | "symbol" | "narrowSymbol" | "name";
  currencySign?: "standard" | "accounting";
  unit?: never;
  unitDisplay?: never;
};

/**
 * Percent formatting (`style: "percent"`). Values are fractional (e.g. `0.12` → `"12%"` in `en-US`).
 */
export type FormatNumberPercentPreset = FormatNumberPresetShared & {
  style: "percent";
  currency?: never;
  currencyDisplay?: never;
  currencySign?: never;
  unit?: never;
  unitDisplay?: never;
};

/**
 * Unit formatting (`style: "unit"`). Requires a [sanctioned unit identifier](https://tc39.es/ecma402/#table-sanctioned-single-unit-identifiers) in `unit`.
 */
export type FormatNumberUnitPreset = FormatNumberPresetShared & {
  style: "unit";
  unit: string;
  unitDisplay?: "short" | "narrow" | "long";
  currency?: never;
  currencyDisplay?: never;
  currencySign?: never;
};

/**
 * Discriminated union on `style` so currency / unit options are valid only when applicable. Assignable to `Intl.NumberFormatOptions`.
 */
export type FormatNumberPresetOptions =
  | FormatNumberDecimalPreset
  | FormatNumberCurrencyPreset
  | FormatNumberPercentPreset
  | FormatNumberUnitPreset;

/**
 * Fields shared by both date/time preset shapes (time zone, calendar, etc.).
 */
export interface FormatDateTimePresetShared {
  timeZone?: string;
  calendar?: string;
  numberingSystem?: string;
  hour12?: boolean;
  hourCycle?: "h11" | "h12" | "h23" | "h24";
}

/**
 * Use granular date/time fields (`year`, `hour`, …).
 */
export type FormatDateTimeFieldsPreset = FormatDateTimePresetShared & {
  dateStyle?: never;
  timeStyle?: never;
  formatMatcher?: "basic" | "best fit";
  weekday?: "long" | "short" | "narrow";
  era?: "long" | "short" | "narrow";
  year?: "numeric" | "2-digit";
  month?: "numeric" | "2-digit" | "long" | "short" | "narrow";
  day?: "numeric" | "2-digit";
  dayPeriod?: "long" | "short" | "narrow";
  hour?: "numeric" | "2-digit";
  minute?: "numeric" | "2-digit";
  second?: "numeric" | "2-digit";
  fractionalSecondDigits?: 1 | 2 | 3;
  timeZoneName?: "long" | "short" | "shortOffset" | "longOffset" | "shortGeneric" | "longGeneric";
};

export type FormatDateTimeStylePreset = FormatDateTimePresetShared & {
  dateStyle?: "full" | "long" | "medium" | "short";
  timeStyle?: "full" | "long" | "medium" | "short";
  formatMatcher?: never;
  weekday?: never;
  era?: never;
  year?: never;
  month?: never;
  day?: never;
  dayPeriod?: never;
  hour?: never;
  minute?: never;
  second?: never;
  fractionalSecondDigits?: never;
  timeZoneName?: never;
};

/**
 * Assignable to the portable Messagevisor date/time subset and broadly compatible with `Intl.DateTimeFormatOptions`.
 */
export type FormatDateTimePresetOptions = FormatDateTimeFieldsPreset | FormatDateTimeStylePreset;

/**
 * `Intl.RelativeTimeFormat` only exposes `numeric` and `style`; they are independent, so a single interface stays clearest.
 * Same keys as `Intl.RelativeTimeFormatOptions` without `localeMatcher`.
 */
export interface FormatRelativeTimePresetOptions {
  numeric?: "always" | "auto";
  style?: "long" | "short" | "narrow";
}

export interface FormatPresets {
  number?: Record<string, FormatNumberPresetOptions>;
  date?: Record<string, FormatDateTimePresetOptions>;
  time?: Record<string, FormatDateTimePresetOptions>;
  relative?: Record<string, FormatRelativeTimePresetOptions>;
  dateTimeRange?: Record<string, FormatDateTimePresetOptions>;
}

/**
 * Named ICU skeleton / compact format strings (e.g. UTS #35 date/time skeletons, compact number tokens for `::` in messages).
 */
// export interface IcuSkeletonFormats {
//   number?: Record<string, string>;
//   date?: Record<string, string>;
//   time?: Record<string, string>;
//   dateTime?: Record<string, string>;
// }
