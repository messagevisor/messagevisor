import { z } from "zod";

const numberShared = {
  useGrouping: z.union([z.boolean(), z.enum(["min2", "auto", "always"])]).optional(),
  minimumIntegerDigits: z.number().int().nonnegative().optional(),
  minimumFractionDigits: z.number().int().nonnegative().optional(),
  maximumFractionDigits: z.number().int().nonnegative().optional(),
  minimumSignificantDigits: z.number().int().nonnegative().optional(),
  maximumSignificantDigits: z.number().int().nonnegative().optional(),
  notation: z.enum(["standard", "scientific", "engineering", "compact"]).optional(),
  compactDisplay: z.enum(["short", "long"]).optional(),
  signDisplay: z.enum(["auto", "never", "always", "exceptZero", "negative"]).optional(),
  roundingPriority: z.enum(["auto", "morePrecision", "lessPrecision"]).optional(),
  roundingIncrement: z
    .union([
      z.literal(1),
      z.literal(2),
      z.literal(5),
      z.literal(10),
      z.literal(20),
      z.literal(25),
      z.literal(50),
      z.literal(100),
      z.literal(200),
      z.literal(250),
      z.literal(500),
      z.literal(1000),
      z.literal(2000),
      z.literal(2500),
      z.literal(5000),
    ])
    .optional(),
  roundingMode: z
    .enum([
      "ceil",
      "floor",
      "expand",
      "trunc",
      "halfCeil",
      "halfFloor",
      "halfExpand",
      "halfTrunc",
      "halfEven",
    ])
    .optional(),
  trailingZeroDisplay: z.enum(["auto", "stripIfInteger"]).optional(),
  numberingSystem: z.string().optional(),
};

const numberPresetZodSchema = z
  .object({
    ...numberShared,
    style: z.enum(["decimal", "currency", "percent", "unit"]).optional(),
    currency: z.string().optional(),
    currencyDisplay: z.enum(["code", "symbol", "narrowSymbol", "name"]).optional(),
    currencySign: z.enum(["standard", "accounting"]).optional(),
    unit: z.string().optional(),
    unitDisplay: z.enum(["short", "narrow", "long"]).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.style !== "currency" && (data.currency || data.currencyDisplay || data.currencySign)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Currency options can only be used when \`style\` is "currency".`,
        path: ["style"],
      });
    }

    if (data.style === "unit" && !data.unit) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Unit number formats must define \`unit\`.`,
        path: ["unit"],
      });
    }

    if (data.style !== "unit" && (data.unit || data.unitDisplay)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Unit options can only be used when \`style\` is "unit".`,
        path: ["style"],
      });
    }

    if (data.notation !== "compact" && data.compactDisplay) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `\`compactDisplay\` can only be used when \`notation\` is "compact".`,
        path: ["notation"],
      });
    }
  });

const dateTimePresetZodSchema = z
  .object({
    timeZone: z.string().optional(),
    calendar: z.string().optional(),
    numberingSystem: z.string().optional(),
    hour12: z.boolean().optional(),
    hourCycle: z.enum(["h11", "h12", "h23", "h24"]).optional(),
    dateStyle: z.enum(["full", "long", "medium", "short"]).optional(),
    timeStyle: z.enum(["full", "long", "medium", "short"]).optional(),
    formatMatcher: z.enum(["basic", "best fit"]).optional(),
    fractionalSecondDigits: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
    weekday: z.enum(["long", "short", "narrow"]).optional(),
    era: z.enum(["long", "short", "narrow"]).optional(),
    year: z.enum(["numeric", "2-digit"]).optional(),
    month: z.enum(["numeric", "2-digit", "long", "short", "narrow"]).optional(),
    day: z.enum(["numeric", "2-digit"]).optional(),
    dayPeriod: z.enum(["long", "short", "narrow"]).optional(),
    hour: z.enum(["numeric", "2-digit"]).optional(),
    minute: z.enum(["numeric", "2-digit"]).optional(),
    second: z.enum(["numeric", "2-digit"]).optional(),
    timeZoneName: z
      .enum(["long", "short", "shortOffset", "longOffset", "shortGeneric", "longGeneric"])
      .optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    const hasStyleShortcut =
      typeof data.dateStyle !== "undefined" || typeof data.timeStyle !== "undefined";
    const hasGranularFields = [
      "weekday",
      "era",
      "year",
      "month",
      "day",
      "dayPeriod",
      "hour",
      "minute",
      "second",
      "fractionalSecondDigits",
      "timeZoneName",
    ].some((field) => typeof data[field as keyof typeof data] !== "undefined");

    if (hasStyleShortcut && hasGranularFields) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "`dateStyle` / `timeStyle` cannot be combined with granular date/time component fields.",
        path: ["dateStyle"],
      });
    }

    if (hasStyleShortcut && typeof data.formatMatcher !== "undefined") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "`formatMatcher` cannot be combined with `dateStyle` / `timeStyle`.",
        path: ["formatMatcher"],
      });
    }
  });

const relativeTimePresetZodSchema = z
  .object({
    numeric: z.enum(["always", "auto"]).optional(),
    style: z.enum(["long", "short", "narrow"]).optional(),
  })
  .strict();

export const formatPresetsZodSchema = z
  .object({
    number: z.record(z.string(), numberPresetZodSchema).optional(),
    date: z.record(z.string(), dateTimePresetZodSchema).optional(),
    time: z.record(z.string(), dateTimePresetZodSchema).optional(),
    relative: z.record(z.string(), relativeTimePresetZodSchema).optional(),
    dateTimeRange: z.record(z.string(), dateTimePresetZodSchema).optional(),
  })
  .strict();
