import { z } from "zod";

export function getSegmentZodSchema(conditionsZodSchema: z.ZodTypeAny) {
  return z
    .object({
      key: z.string().optional(),
      archived: z.boolean().optional(),
      promotable: z.boolean().optional(),
      description: z.string({
        error: (issue) => (issue.input === undefined ? "Required" : undefined),
      }),
      conditions: conditionsZodSchema,
    })
    .strict();
}
