import { z } from "zod";

import { refineWithMessage } from "./zodHelpers";

export function getTestZodSchema(
  messageKeys: string[],
  segmentKeys: string[],
  localeKeys: string[],
  targetKeys: string[],
) {
  function validateAssertionKeys(
    assertions: Array<{ key?: string; promotable?: boolean }>,
    ctx: z.RefinementCtx,
  ) {
    const seenKeys = new Set<string>();
    assertions.forEach((assertion, index) => {
      if (typeof assertion.key === "string") {
        if (seenKeys.has(assertion.key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [index, "key"],
            message: `Duplicate assertion key "${assertion.key}".`,
          });
        }
        seenKeys.add(assertion.key);
      }
    });
  }

  const matrixZodSchema = z.record(
    z.string(),
    z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])),
  );
  const formatPresets = z.record(z.string(), z.unknown());
  const expectedByRuntime = z
    .record(z.string(), z.string())
    .refine((value) => Object.keys(value).length > 0, {
      message: "`expectedByRuntime` must define at least one runtime.",
    });
  const targetOrMatrixValue = refineWithMessage(
    z.string(),
    (value) => targetKeys.includes(value) || /^\$\{\{.+\}\}$/.test(value),
    (value) => `Unknown target "${value}"`,
  );
  const validateExpectedByRuntime = (
    data: {
      expectedTranslation?: string;
      expectedByRuntime?: Record<string, string>;
    },
    ctx: z.RefinementCtx,
  ) => {
    if (!data.expectedTranslation || !data.expectedByRuntime) {
      return;
    }

    for (const [runtime, expectedTranslation] of Object.entries(data.expectedByRuntime)) {
      if (expectedTranslation === data.expectedTranslation) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "`expectedByRuntime` entries must differ from `expectedTranslation`; remove redundant runtime expectations.",
          path: ["expectedByRuntime", runtime],
        });
      }
    }
  };

  const messageAssertion = z
    .object({
      key: z.string().min(1).optional(),
      promotable: z.boolean().optional(),
      matrix: matrixZodSchema.optional(),
      description: z.string().optional(),
      context: z.record(z.string(), z.unknown()).optional(),
      locale: refineWithMessage(
        z.string(),
        (value) => localeKeys.includes(value),
        (value) => `Unknown locale "${value}"`,
      ),
      target: targetOrMatrixValue.optional(),
      values: z.record(z.string(), z.unknown()).optional(),
      withFlags: z.record(z.string(), z.union([z.boolean(), z.string()])).optional(),
      withVariations: z.record(z.string(), z.string()).optional(),
      currency: z.string().optional(),
      timeZone: z.string().optional(),
      formats: formatPresets.optional(),
      expectedTranslation: z.string(),
      expectedByRuntime: expectedByRuntime.optional(),
    })
    .strict()
    .superRefine(validateExpectedByRuntime);

  const segmentAssertion = z
    .object({
      key: z.string().min(1).optional(),
      promotable: z.boolean().optional(),
      matrix: matrixZodSchema.optional(),
      description: z.string().optional(),
      segment: refineWithMessage(
        z.string(),
        (value) => segmentKeys.includes(value),
        (value) => `Unknown segment "${value}"`,
      ),
      context: z.record(z.string(), z.unknown()).optional(),
      expectedToMatch: z.union([z.boolean(), z.string()]),
    })
    .strict();

  const localeAssertion = z
    .object({
      key: z.string().min(1).optional(),
      promotable: z.boolean().optional(),
      matrix: matrixZodSchema.optional(),
      description: z.string().optional(),
      target: targetOrMatrixValue.optional(),
      expectedFormats: formatPresets.optional(),
      rawMessage: z.string().optional(),
      expectedTranslation: z.string().optional(),
      expectedByRuntime: expectedByRuntime.optional(),
      values: z.record(z.string(), z.unknown()).optional(),
      context: z.record(z.string(), z.unknown()).optional(),
      formats: formatPresets.optional(),
      currency: z.string().optional(),
      timeZone: z.string().optional(),
    })
    .strict()
    .superRefine((data, ctx) => {
      validateExpectedByRuntime(data, ctx);

      const hasExpectedFormats = typeof data.expectedFormats !== "undefined";
      const hasRawMessage = typeof data.rawMessage !== "undefined";
      const hasExpectedTranslation = typeof data.expectedTranslation !== "undefined";

      if (hasRawMessage !== hasExpectedTranslation) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Locale assertions must define `rawMessage` and `expectedTranslation` together.",
          path: hasRawMessage ? ["expectedTranslation"] : ["rawMessage"],
        });
      }

      if (!hasExpectedFormats && !hasRawMessage && !hasExpectedTranslation) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Locale assertions must define at least one of `expectedFormats` or `rawMessage` with `expectedTranslation`.",
          path: ["expectedFormats"],
        });
      }
    });

  const targetAssertion = z
    .object({
      key: z.string().min(1).optional(),
      promotable: z.boolean().optional(),
      matrix: matrixZodSchema.optional(),
      description: z.string().optional(),
      locale: refineWithMessage(
        z.string(),
        (value) => localeKeys.includes(value),
        (value) => `Unknown locale "${value}"`,
      ),
      expectedToIncludeMessages: z
        .array(
          refineWithMessage(
            z.string(),
            (value) => messageKeys.includes(value),
            (value) => `Unknown message "${value}"`,
          ),
        )
        .optional(),
      expectedToNotIncludeMessages: z
        .array(
          refineWithMessage(
            z.string(),
            (value) => messageKeys.includes(value),
            (value) => `Unknown message "${value}"`,
          ),
        )
        .optional(),
      expectedFormats: formatPresets.optional(),
      rawMessage: z.string().optional(),
      message: refineWithMessage(
        z.string(),
        (value) => messageKeys.includes(value),
        (value) => `Unknown message "${value}"`,
      ).optional(),
      expectedTranslation: z.string().optional(),
      expectedByRuntime: expectedByRuntime.optional(),
      values: z.record(z.string(), z.unknown()).optional(),
      context: z.record(z.string(), z.unknown()).optional(),
      formats: formatPresets.optional(),
      currency: z.string().optional(),
      timeZone: z.string().optional(),
    })
    .strict()
    .superRefine((data, ctx) => {
      validateExpectedByRuntime(data, ctx);

      const hasRawMessage = typeof data.rawMessage !== "undefined";
      const hasMessage = typeof data.message !== "undefined";
      const hasExpectedTranslation = typeof data.expectedTranslation !== "undefined";
      const hasStructureChecks =
        typeof data.expectedFormats !== "undefined" ||
        typeof data.expectedToIncludeMessages !== "undefined" ||
        typeof data.expectedToNotIncludeMessages !== "undefined";

      if (hasRawMessage && hasMessage) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Target assertions must define either `rawMessage` or `message`, not both.",
          path: ["rawMessage"],
        });
      }

      if ((hasRawMessage || hasMessage) && !hasExpectedTranslation) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Target assertions that define `rawMessage` or `message` must also define `expectedTranslation`.",
          path: ["expectedTranslation"],
        });
      }

      if (hasExpectedTranslation && !hasRawMessage && !hasMessage) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Target assertions that define `expectedTranslation` must also define `rawMessage` or `message`.",
          path: ["expectedTranslation"],
        });
      }

      if (!hasStructureChecks && !hasRawMessage && !hasMessage && !hasExpectedTranslation) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Target assertions must define inclusion/exclusion checks, `expectedFormats`, or translation.",
          path: ["expectedFormats"],
        });
      }
    });

  const messageTest = z
    .object({
      key: z.string().optional(),
      promotable: z.boolean().optional(),
      message: refineWithMessage(
        z.string(),
        (value) => messageKeys.includes(value),
        (value) => `Unknown message "${value}"`,
      ),
      assertions: z.array(messageAssertion).min(1).superRefine(validateAssertionKeys),
    })
    .strict();

  const segmentTest = z
    .object({
      key: z.string().optional(),
      promotable: z.boolean().optional(),
      segment: refineWithMessage(
        z.string(),
        (value) => segmentKeys.includes(value),
        (value) => `Unknown segment "${value}"`,
      ),
      assertions: z.array(segmentAssertion).min(1).superRefine(validateAssertionKeys),
    })
    .strict();

  const localeTest = z
    .object({
      key: z.string().optional(),
      promotable: z.boolean().optional(),
      locale: refineWithMessage(
        z.string(),
        (value) => localeKeys.includes(value),
        (value) => `Unknown locale "${value}"`,
      ),
      assertions: z.array(localeAssertion).min(1).superRefine(validateAssertionKeys),
    })
    .strict();

  const targetTest = z
    .object({
      key: z.string().optional(),
      promotable: z.boolean().optional(),
      target: refineWithMessage(
        z.string(),
        (value) => targetKeys.includes(value),
        (value) => `Unknown target "${value}"`,
      ),
      assertions: z.array(targetAssertion).min(1).superRefine(validateAssertionKeys),
    })
    .strict();

  return z.union([messageTest, segmentTest, localeTest, targetTest]);
}
