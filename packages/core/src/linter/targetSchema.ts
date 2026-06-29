import { z } from "zod";

import { formatPresetsZodSchema } from "./formatSchema";
import { refineWithMessage } from "./zodHelpers";

const messagePatternsZodSchema = z.union([z.string(), z.array(z.string())]);
const formatPatternsZodSchema = z
  .object({
    number: messagePatternsZodSchema.optional(),
    date: messagePatternsZodSchema.optional(),
    time: messagePatternsZodSchema.optional(),
    relative: messagePatternsZodSchema.optional(),
    dateTimeRange: messagePatternsZodSchema.optional(),
  })
  .strict();

export function getTargetZodSchema(localeKeys: string[]) {
  return z
    .object({
      key: z.string().optional(),
      promotable: z.boolean().optional(),
      stringify: z.boolean().optional(),
      pretty: z.boolean().optional(),
      revisionFromHash: z.boolean().optional(),
      description: z.string({
        error: (issue) => (issue.input === undefined ? "Required" : undefined),
      }),
      includeMessages: messagePatternsZodSchema.optional(),
      excludeMessages: messagePatternsZodSchema.optional(),
      includeOnlyUsedFormats: z.boolean().optional(),
      includeFormats: formatPatternsZodSchema.optional(),
      excludeFormats: formatPatternsZodSchema.optional(),
      locales: z
        .array(
          refineWithMessage(
            z.string(),
            (value) => localeKeys.includes(value),
            (value) => `Unknown locale "${value}"`,
          ),
        )
        .optional(),
      context: z.record(z.string(), z.unknown()).optional(),
      formats: z
        .record(
          refineWithMessage(
            z.string(),
            (value) => localeKeys.includes(value),
            (value) => `Unknown locale "${value}"`,
          ),
          formatPresetsZodSchema,
        )
        .optional(),
    })
    .strict()
    .superRefine((data, ctx) => {
      if (
        data.includeOnlyUsedFormats === true &&
        (typeof data.includeFormats !== "undefined" || typeof data.excludeFormats !== "undefined")
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["includeOnlyUsedFormats"],
          message:
            "`includeOnlyUsedFormats: true` cannot be combined with `includeFormats` or `excludeFormats`.",
        });
      }
    });
}
