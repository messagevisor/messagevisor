import { z } from "zod";

export const primitiveValueZodSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.date(),
  z.null(),
  z.undefined(),
]);

export const valueZodSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([primitiveValueZodSchema, z.array(valueZodSchema), z.record(z.string(), valueZodSchema)]),
);

export const attributeTypeEnum = z.enum([
  "boolean",
  "string",
  "integer",
  "double",
  "date",
  "object",
  "array",
]);

type SchemaLike = {
  type?: string;
  enum?: unknown[];
  const?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  items?: unknown;
  properties?: Record<string, unknown>;
  additionalProperties?: unknown;
  required?: string[];
  oneOf?: unknown[];
};

function valueMatchesType(value: unknown, type: string): boolean {
  switch (type) {
    case "string":
    case "date":
      return typeof value === "string" || value instanceof Date;
    case "boolean":
      return typeof value === "boolean";
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "double":
      return typeof value === "number";
    case "object":
      return typeof value === "object" && value !== null && !Array.isArray(value);
    case "array":
      return Array.isArray(value) && value.every((entry) => typeof entry === "string");
    default:
      return true;
  }
}

function visitNested(
  schema: SchemaLike,
  pathPrefix: (string | number)[],
  visitor: (schema: SchemaLike, path: (string | number)[]) => void,
) {
  if (!schema || typeof schema !== "object") return;

  visitor(schema, pathPrefix);

  if (schema.items && typeof schema.items === "object") {
    visitNested(schema.items as SchemaLike, [...pathPrefix, "items"], visitor);
  }

  if (schema.properties && typeof schema.properties === "object") {
    for (const key of Object.keys(schema.properties)) {
      visitNested(
        schema.properties[key] as SchemaLike,
        [...pathPrefix, "properties", key],
        visitor,
      );
    }
  }

  if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
    visitNested(
      schema.additionalProperties as SchemaLike,
      [...pathPrefix, "additionalProperties"],
      visitor,
    );
  }

  if (schema.oneOf && Array.isArray(schema.oneOf)) {
    schema.oneOf.forEach((branch, index) => {
      if (branch && typeof branch === "object") {
        visitNested(branch as SchemaLike, [...pathPrefix, "oneOf", index], visitor);
      }
    });
  }
}

export function refineSchemaSemantics(schema: SchemaLike, ctx: z.RefinementCtx): void {
  visitNested(schema, [], (current, path) => {
    if (current.type && Array.isArray(current.enum)) {
      current.enum.forEach((value, index) => {
        if (!valueMatchesType(value, current.type as string)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Enum value at index ${index} (${JSON.stringify(value)}) does not match type "${current.type}".`,
            path: [...path, "enum", index],
          });
        }
      });
    }

    if (
      current.type &&
      current.const !== undefined &&
      !valueMatchesType(current.const, current.type)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `\`const\` value does not match type "${current.type}".`,
        path: [...path, "const"],
      });
    }

    if (
      (current.type === "integer" || current.type === "double") &&
      current.minimum !== undefined &&
      current.maximum !== undefined &&
      current.minimum > current.maximum
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `\`minimum\` (${current.minimum}) must be less than or equal to \`maximum\` (${current.maximum}).`,
        path: [...path, "minimum"],
      });
    }

    if (
      (current.type === "string" || current.type === "date") &&
      current.minLength !== undefined &&
      current.maxLength !== undefined &&
      current.minLength > current.maxLength
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `\`minLength\` (${current.minLength}) must be less than or equal to \`maxLength\` (${current.maxLength}).`,
        path: [...path, "minLength"],
      });
    }

    if ((current.type === "string" || current.type === "date") && current.pattern !== undefined) {
      try {
        new RegExp(current.pattern);
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `\`pattern\` must be a valid ECMA-262 regular expression.`,
          path: [...path, "pattern"],
        });
      }
    }

    if (current.type === "array" && current.items && typeof current.items === "object") {
      const itemSchema = current.items as SchemaLike;
      if (itemSchema.type !== "string") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Attribute arrays must contain strings only. \`items.type\` must be "string".`,
          path: [...path, "items", "type"],
        });
      }
    }

    if (current.type === "object" && Array.isArray(current.required) && current.properties) {
      const allowedKeys = Object.keys(current.properties);
      current.required.forEach((key, index) => {
        if (!allowedKeys.includes(key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Unknown required field "${key}". Required fields must exist in \`properties\`.`,
            path: [...path, "required", index],
          });
        }
      });
    }

    if (current.type === "object" && current.properties) {
      for (const key of Object.keys(current.properties)) {
        const property = current.properties[key] as SchemaLike;
        if (property.type === "object") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Object attributes must stay flat. Property "${key}" cannot be of type "object".`,
            path: [...path, "properties", key, "type"],
          });
        }
      }
    }
  });
}

export const attributePropertyZodSchema: z.ZodType<any> = z.lazy(() =>
  z
    .object({
      description: z.string().optional(),
      type: attributeTypeEnum.optional(),
      enum: z.array(valueZodSchema).optional(),
      const: valueZodSchema.optional(),
      maximum: z.number().optional(),
      minimum: z.number().optional(),
      maxLength: z.number().int().nonnegative().optional(),
      minLength: z.number().int().nonnegative().optional(),
      pattern: z.string().optional(),
      items: attributePropertyZodSchema.optional(),
      maxItems: z.number().int().nonnegative().optional(),
      minItems: z.number().int().nonnegative().optional(),
      uniqueItems: z.boolean().optional(),
      required: z.array(z.string()).optional(),
      properties: z.record(z.string(), attributePropertyZodSchema).optional(),
      additionalProperties: attributePropertyZodSchema.optional(),
      oneOf: z.array(attributePropertyZodSchema).min(2).optional(),
    })
    .strict(),
);
