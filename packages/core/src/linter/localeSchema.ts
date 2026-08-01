import { z } from "zod";

import { formatPresetsZodSchema } from "./formatSchema";
import { refineWithMessage } from "./zodHelpers";

export function getLocaleZodSchema(localeKeys: string[], messageKeys: string[]) {
  const matrixZodSchema = z.record(
    z.string(),
    z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])),
  );
  const expectedByRuntimeSchema = z
    .record(z.string(), z.string())
    .refine((value) => Object.keys(value).length > 0, {
      message: "`expectedByRuntime` must define at least one runtime.",
    });

  const localeExampleSchema = z
    .object({
      matrix: matrixZodSchema.optional(),
      index: z.number().int().min(0).optional(),
      description: z.string().optional(),
      values: z.record(z.string(), z.unknown()).optional(),
      context: z.record(z.string(), z.unknown()).optional(),
      formats: formatPresetsZodSchema.optional(),
      timeZone: z.string().optional(),
      currency: z.string().optional(),
      expectedByRuntime: expectedByRuntimeSchema.optional(),
      rawMessage: z.string().optional(),
      message: refineWithMessage(
        z.string(),
        (value) => messageKeys.includes(value),
        (value) => `Unknown message "${value}"`,
      ).optional(),
    })
    .strict()
    .superRefine((data, ctx) => {
      const hasRawMessage = typeof data.rawMessage !== "undefined";
      const hasMessage = typeof data.message !== "undefined";

      if (hasRawMessage === hasMessage) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Example must define exactly one of `rawMessage` or `message`.",
          path: ["rawMessage"],
        });
      }
    });

  return z
    .object({
      key: z.string().optional(),
      promotable: z.boolean().optional(),
      description: z.string({
        error: (issue) => (issue.input === undefined ? "Required" : undefined),
      }),
      direction: z.enum(["ltr", "rtl"]).optional(),
      inheritFormatsFrom: refineWithMessage(
        z.string(),
        (value) => localeKeys.includes(value),
        (value) => `Unknown locale "${value}"`,
      ).optional(),
      inheritTranslationsFrom: refineWithMessage(
        z.string(),
        (value) => localeKeys.includes(value),
        (value) => `Unknown locale "${value}"`,
      ).optional(),
      mergeExamplesFrom: refineWithMessage(
        z.string(),
        (value) => localeKeys.includes(value),
        (value) => `Unknown locale "${value}"`,
      ).optional(),
      formats: formatPresetsZodSchema.optional(),
      examples: z.array(localeExampleSchema).optional(),
    })
    .strict();
}
