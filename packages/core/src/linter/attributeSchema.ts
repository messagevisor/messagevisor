import { z } from "zod";

import { attributePropertyZodSchema, refineSchemaSemantics } from "./schema";

export function getAttributeZodSchema() {
  return attributePropertyZodSchema
    .and(
      z
        .object({
          key: z.string().optional(),
          archived: z.boolean().optional(),
          promotable: z.boolean().optional(),
          description: z.string({
            error: (issue) => (issue.input === undefined ? "Required" : undefined),
          }),
        })
        .strict(),
    )
    .superRefine((data: any, ctx) => {
      if (!data.type && !data.oneOf) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Attribute must define either \`type\` or \`oneOf\`.`,
          path: ["type"],
        });
      }

      if (data.type && data.oneOf) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Attribute cannot define both \`type\` and \`oneOf\`.`,
          path: ["oneOf"],
        });
      }

      refineSchemaSemantics(data, ctx);
    });
}
