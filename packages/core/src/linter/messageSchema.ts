import { z } from "zod";

import { getConditionsZodSchema } from "./conditionSchema";
import { valueZodSchema } from "./schema";
import { refineWithMessage } from "./zodHelpers";

export function getGroupSegmentZodSchema(segmentKeys: string[]) {
  type GroupSegmentInput = any;

  const groupSegmentZodSchema: z.ZodType<GroupSegmentInput> = z.lazy(() =>
    z.union([
      refineWithMessage(
        z.string(),
        (value) => segmentKeys.includes(value),
        (value) => `Unknown segment "${value}"`,
      ),
      z.object({ and: z.array(groupSegmentZodSchema).min(1) }).strict(),
      z.object({ or: z.array(groupSegmentZodSchema).min(1) }).strict(),
      z.object({ not: z.array(groupSegmentZodSchema).min(1) }).strict(),
    ]),
  );

  return z.union([z.literal("*"), groupSegmentZodSchema, z.array(groupSegmentZodSchema).min(1)]);
}

export function getMessageZodSchema(
  localeKeys: string[],
  segmentKeys: string[],
  attributesByKey: any,
  options: {
    namespaceCharacter: string;
    exportOverrideKeySeparator: string;
  },
) {
  function validateTranslationStates(
    translations: Record<string, string>,
    states: Record<string, { status: string; sourceHash?: string }> | undefined,
    ctx: z.RefinementCtx,
    path: (string | number)[],
  ) {
    for (const locale of Object.keys(states || {})) {
      if (typeof translations[locale] === "undefined") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Translation state for locale "${locale}" requires a translation for that locale.`,
          path: [...path, locale],
        });
      }
    }
  }
  const matrixZodSchema = z.record(
    z.string(),
    z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])),
  );
  const expectedByRuntimeSchema = z
    .record(z.string(), z.string())
    .refine((value) => Object.keys(value).length > 0, {
      message: "`expectedByRuntime` must define at least one runtime.",
    });

  const messageExampleLocaleSchema = refineWithMessage(
    z.string(),
    (value) => localeKeys.includes(value) || /^\$\{\{.+\}\}$/.test(value),
    (value) => `Unknown locale "${value}"`,
  );

  const messageExampleZodSchema = z
    .object({
      matrix: matrixZodSchema.optional(),
      index: z.number().int().min(0).optional(),
      description: z.string().optional(),
      locale: messageExampleLocaleSchema,
      values: z.record(z.string(), z.unknown()).optional(),
      context: z.record(z.string(), z.unknown()).optional(),
      formats: z.record(z.string(), z.unknown()).optional(),
      timeZone: z.string().optional(),
      currency: z.string().optional(),
      expectedByRuntime: expectedByRuntimeSchema.optional(),
    })
    .strict();

  const localeTranslations = z
    .record(
      refineWithMessage(
        z.string(),
        (value) => localeKeys.includes(value),
        (value) => `Unknown locale "${value}"`,
      ),
      z.string(),
    )
    .refine((value) => Object.keys(value).length > 0, {
      message: "At least one translation is required",
    });

  const translationStates = z
    .record(
      refineWithMessage(
        z.string(),
        (value) => localeKeys.includes(value),
        (value) => `Unknown locale "${value}"`,
      ),
      z
        .object({
          status: z.enum(["draft", "translated", "reviewed"]),
          sourceHash: z
            .string()
            .regex(/^[a-f0-9]{64}$/)
            .optional(),
        })
        .strict(),
    )
    .optional();

  const conditionsZodSchema = getConditionsZodSchema(attributesByKey);
  const groupSegmentZodSchema = getGroupSegmentZodSchema(segmentKeys);

  const overrideZodSchema = z
    .object({
      key: z.string().min(1),
      promotable: z.boolean().optional(),
      description: z.string().optional(),
      summary: z.string().optional(),
      conditions: conditionsZodSchema.optional(),
      segments: groupSegmentZodSchema.optional(),
      translations: localeTranslations,
      translationStates,
    })
    .strict()
    .superRefine((data, ctx) => {
      validateTranslationStates(data.translations, data.translationStates, ctx, [
        "translationStates",
      ]);
      if (!data.conditions && !data.segments) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Override must define either `conditions` or `segments`.",
          path: ["conditions"],
        });
      }
    });

  return z
    .object({
      key: z.string().optional(),
      archived: z.boolean().optional(),
      promotable: z.boolean().optional(),
      deprecated: z.boolean().optional(),
      deprecationWarning: z.string().optional(),
      description: z.string({
        error: (issue) => (issue.input === undefined ? "Required" : undefined),
      }),
      summary: z.string().optional(),
      meta: z.record(z.string(), valueZodSchema).optional(),
      examples: z.array(messageExampleZodSchema).optional(),
      translations: localeTranslations,
      translationStates,
      overrides: z.array(overrideZodSchema).optional(),
    })
    .strict()
    .superRefine((data, ctx) => {
      validateTranslationStates(data.translations, data.translationStates, ctx, [
        "translationStates",
      ]);
      const overrideKeys = new Set<string>();

      for (let index = 0; index < (data.overrides || []).length; index++) {
        const override = (data.overrides || [])[index];
        const disallowedCharacters = [
          ["namespaceCharacter", options.namespaceCharacter],
          ["exportOverrideKeySeparator", options.exportOverrideKeySeparator],
        ];

        for (const [label, character] of disallowedCharacters) {
          if (override.key.includes(character)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Override key "${override.key}" must not include ${label} "${character}".`,
              path: ["overrides", index, "key"],
            });
          }
        }

        if (overrideKeys.has(override.key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Duplicate override key "${override.key}". Override keys must be unique within a message.`,
            path: ["overrides", index, "key"],
          });
        }

        overrideKeys.add(override.key);
      }

      if (data.deprecationWarning && !data.deprecated) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "`deprecationWarning` can only be set when `deprecated` is true.",
          path: ["deprecationWarning"],
        });
      }
    });
}
