import { z } from "zod";

import { formatPresetsZodSchema } from "./formatSchema";
import { refineWithMessage } from "./zodHelpers";

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
      includeMessages: z.array(z.string()).optional(),
      excludeMessages: z.array(z.string()).optional(),
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
      if (!data.includeMessages || data.includeMessages.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Target must include at least one message pattern.",
          path: ["includeMessages"],
        });
      }
    });
}
