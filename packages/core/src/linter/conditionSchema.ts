/* eslint-disable @typescript-eslint/no-unused-vars */
import type { Attribute } from "@messagevisor/types";
import { z } from "zod";

import { refineWithMessage } from "./zodHelpers";

const commonOperators = ["equals", "notEquals"];
const numericOperators = ["greaterThan", "greaterThanOrEquals", "lessThan", "lessThanOrEquals"];
const stringOperators = ["contains", "notContains", "startsWith", "endsWith"];
const regexOperators = ["matches", "notMatches"];
const dateOperators = ["before", "after"];
const arrayOperators = ["includes", "notIncludes"];
const membershipOperators = ["in", "notIn"];
const operatorsWithoutValue = ["exists", "notExists"];
const featureOperators = ["isEnabled", "isDisabled"];
const experimentOperators = ["hasVariation"];

type SchemaNode = Attribute & {
  type?: string;
  properties?: Record<string, SchemaNode>;
  additionalProperties?: SchemaNode;
  oneOf?: SchemaNode[];
};
type ResolvedLeaf = { kind: "schema"; schema: SchemaNode } | { kind: "flat-object-property" };

function isPrimitiveValue(value: unknown): boolean {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}

function valuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function resolveAttributePath(
  attributePath: string,
  attributesByKey: Record<string, Attribute>,
): ResolvedLeaf | null {
  const [rootKey, ...rest] = attributePath.split(".");
  const rootAttribute = attributesByKey[rootKey];

  if (!rootAttribute) {
    return null;
  }

  let current: SchemaNode = rootAttribute;

  if (rest.length === 0) {
    return { kind: "schema", schema: current };
  }

  for (let index = 0; index < rest.length; index++) {
    const segment = rest[index];

    if (current.type !== "object") {
      return null;
    }

    if (current.properties && current.properties[segment]) {
      current = current.properties[segment];
      continue;
    }

    if (!current.properties && !current.additionalProperties) {
      return index === rest.length - 1 ? { kind: "flat-object-property" } : null;
    }

    if (current.additionalProperties) {
      current = current.additionalProperties;
      continue;
    }

    return null;
  }

  return { kind: "schema", schema: current };
}

function getLeafTypes(leaf: ResolvedLeaf): string[] {
  if (leaf.kind === "flat-object-property") {
    return ["primitive"];
  }

  if (leaf.schema.oneOf) {
    return Array.from(
      new Set(
        leaf.schema.oneOf.flatMap((branch) =>
          getLeafTypes({ kind: "schema", schema: branch as SchemaNode }),
        ),
      ),
    );
  }

  return leaf.schema.type ? [leaf.schema.type] : [];
}

function matchesSchemaValue(schema: SchemaNode, value: unknown): boolean {
  if (schema.oneOf) {
    return (
      schema.oneOf.filter((branch) => matchesSchemaValue(branch as SchemaNode, value)).length === 1
    );
  }

  if (schema.const !== undefined) {
    return valuesEqual(schema.const, value);
  }

  if (schema.enum) {
    return schema.enum.some((entry) => valuesEqual(entry, value));
  }

  if (!schema.type) {
    return true;
  }

  if (schema.type === "string" || schema.type === "date") {
    if (typeof value !== "string" && !(value instanceof Date)) return false;
    const stringValue = value instanceof Date ? value.toISOString() : value;
    if (schema.minLength !== undefined && stringValue.length < schema.minLength) return false;
    if (schema.maxLength !== undefined && stringValue.length > schema.maxLength) return false;
    if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(stringValue)) return false;
    return true;
  }

  if (schema.type === "boolean") {
    return typeof value === "boolean";
  }

  if (schema.type === "integer" || schema.type === "double") {
    if (typeof value !== "number") return false;
    if (schema.type === "integer" && !Number.isInteger(value)) return false;
    if (schema.minimum !== undefined && value < schema.minimum) return false;
    if (schema.maximum !== undefined && value > schema.maximum) return false;
    return true;
  }

  if (schema.type === "array") {
    return (
      Array.isArray(value) &&
      value.every((entry) =>
        schema.items ? matchesSchemaValue(schema.items as SchemaNode, entry) : true,
      )
    );
  }

  if (schema.type === "object") {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    return Object.entries(value as Record<string, unknown>).every(([key, entry]) => {
      const child = schema.properties?.[key] || schema.additionalProperties;
      return child ? matchesSchemaValue(child, entry) : !schema.properties;
    });
  }

  return true;
}

export function contextValueMatchesAttribute(attribute: Attribute, value: unknown): boolean {
  return matchesSchemaValue(attribute as SchemaNode, value);
}

function matchesLeafValue(leaf: ResolvedLeaf, value: unknown): boolean {
  if (leaf.kind === "flat-object-property") {
    return isPrimitiveValue(value);
  }

  return matchesSchemaValue(leaf.schema, value);
}

function addIssue(ctx: z.RefinementCtx, message: string, path: (string | number)[] = ["value"]) {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message,
    path,
  });
}

function validateAttributeAwareCondition(
  data: { attribute: string; operator: string; value?: unknown },
  ctx: z.RefinementCtx,
  attributesByKey: Record<string, Attribute>,
) {
  const leaf = resolveAttributePath(data.attribute, attributesByKey);

  if (!leaf) {
    return;
  }

  const leafTypes = getLeafTypes(leaf);

  if (operatorsWithoutValue.includes(data.operator)) {
    return;
  }

  if (leaf.kind === "schema" && leaf.schema.type === "object") {
    addIssue(
      ctx,
      `Attribute "${data.attribute}" resolves to an object. Use a nested attribute path or \`exists\`/\`notExists\`.`,
    );
    return;
  }

  if (
    numericOperators.includes(data.operator) &&
    !leafTypes.some((type) => ["integer", "double"].includes(type))
  ) {
    addIssue(
      ctx,
      `Operator "${data.operator}" can only be used with integer or double attributes.`,
    );
    return;
  }

  if (
    [...stringOperators, ...regexOperators].includes(data.operator) &&
    !leafTypes.some((type) => ["string", "date"].includes(type))
  ) {
    addIssue(ctx, `Operator "${data.operator}" can only be used with string or date attributes.`);
    return;
  }

  if (
    dateOperators.includes(data.operator) &&
    !leafTypes.some((type) => ["string", "date"].includes(type))
  ) {
    addIssue(ctx, `Operator "${data.operator}" can only be used with string or date attributes.`);
    return;
  }

  if (arrayOperators.includes(data.operator)) {
    if (!leafTypes.includes("array")) {
      addIssue(ctx, `Operator "${data.operator}" can only be used with array attributes.`);
      return;
    }

    if (typeof data.value !== "string") {
      addIssue(ctx, `Operator "${data.operator}" only supports string values.`);
    }

    return;
  }

  if (membershipOperators.includes(data.operator)) {
    if (!Array.isArray(data.value)) {
      return;
    }

    data.value.forEach((entry, index) => {
      if (!matchesLeafValue(leaf, entry)) {
        addIssue(
          ctx,
          `Value at index ${index} does not match the schema of attribute "${data.attribute}".`,
          ["value", index],
        );
      }
    });

    return;
  }

  if (
    commonOperators.includes(data.operator) &&
    data.value !== null &&
    !matchesLeafValue(leaf, data.value)
  ) {
    addIssue(ctx, `Value does not match the schema of attribute "${data.attribute}".`);
  }
}

export function getConditionsZodSchema(attributesByKey: Record<string, Attribute>) {
  type ConditionInput = any;

  const conditionZodSchema: z.ZodType<ConditionInput> = z.lazy(() => {
    const attributeCondition = z
      .object({
        attribute: refineWithMessage(
          z.string(),
          (value) => resolveAttributePath(value, attributesByKey) !== null,
          (value) => `Unknown attribute "${value}"`,
        ),
        operator: z.enum([
          ...commonOperators,
          ...numericOperators,
          ...stringOperators,
          ...regexOperators,
          ...dateOperators,
          ...arrayOperators,
          ...membershipOperators,
          ...operatorsWithoutValue,
        ]),
        value: z
          .union([
            z.string(),
            z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])),
            z.number(),
            z.boolean(),
            z.date(),
            z.null(),
          ])
          .optional(),
        regexFlags: z
          .string()
          .refine((value) => /^[imsu]+$/.test(value) && new Set(value).size === value.length, {
            message: "regexFlags must contain unique characters from: i, m, s, u",
          })
          .optional(),
      })
      .strict()
      .superRefine((data, ctx) => {
        if (operatorsWithoutValue.includes(data.operator) && typeof data.value !== "undefined") {
          addIssue(ctx, `when operator is "${data.operator}", value must not be provided`);
        }

        if (!operatorsWithoutValue.includes(data.operator) && typeof data.value === "undefined") {
          addIssue(ctx, `when operator is "${data.operator}", value must be provided`);
        }

        if (numericOperators.includes(data.operator) && typeof data.value !== "number") {
          addIssue(ctx, `when operator is "${data.operator}", value must be a number`);
        }

        if (
          [...stringOperators, ...regexOperators, ...dateOperators, ...arrayOperators].includes(
            data.operator,
          ) &&
          typeof data.value !== "string"
        ) {
          addIssue(ctx, `when operator is "${data.operator}", value must be a string`);
        }

        if (!regexOperators.includes(data.operator) && typeof data.regexFlags !== "undefined") {
          addIssue(ctx, "regexFlags is only supported by matches and notMatches", ["regexFlags"]);
        }

        if (
          dateOperators.includes(data.operator) &&
          !(data.value instanceof Date) &&
          (typeof data.value !== "string" ||
            !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(
              data.value,
            ))
        ) {
          addIssue(
            ctx,
            `when operator is "${data.operator}", value must be a portable ISO 8601 date-time with a timezone`,
            ["value"],
          );
        }

        if (regexOperators.includes(data.operator) && typeof data.value === "string") {
          try {
            new RegExp(data.value, data.regexFlags);
          } catch (error) {
            addIssue(
              ctx,
              `Invalid regular expression: ${error instanceof Error ? error.message : String(error)}`,
              ["value"],
            );
          }
        }

        if (membershipOperators.includes(data.operator) && !Array.isArray(data.value)) {
          addIssue(ctx, `when operator is "${data.operator}", value must be an array`);
        }

        validateAttributeAwareCondition(data, ctx, attributesByKey);
      });

    const featureCondition = z
      .object({
        feature: z.string(),
        operator: z.string(),
        attribute: z.never().optional(),
        experiment: z.never().optional(),
        value: z.unknown().optional(),
        regexFlags: z.never().optional(),
      })
      .strict()
      .superRefine((data, ctx) => {
        if (!featureOperators.includes(data.operator)) {
          addIssue(ctx, `Feature conditions only support operators "isEnabled" and "isDisabled".`, [
            "operator",
          ]);
        }

        if (typeof data.value !== "undefined") {
          addIssue(
            ctx,
            `Feature conditions must not define \`value\`; the flag state comes from resolveFlag.`,
            ["value"],
          );
        }
      });

    const experimentCondition = z
      .object({
        experiment: z.string(),
        operator: z.string(),
        value: z.unknown().optional(),
        attribute: z.never().optional(),
        feature: z.never().optional(),
        regexFlags: z.never().optional(),
      })
      .strict()
      .superRefine((data, ctx) => {
        if (data.operator !== "hasVariation") {
          addIssue(ctx, `Experiment conditions only support operator "hasVariation".`, [
            "operator",
          ]);
        }

        if (typeof data.value === "undefined") {
          addIssue(
            ctx,
            `Experiment conditions must define \`value\` with the expected variation.`,
            ["value"],
          );
          return;
        }

        if (typeof data.value !== "string") {
          addIssue(ctx, `Experiment condition \`value\` must be a string variation.`, ["value"]);
        }
      });

    const andCondition = z.object({ and: z.array(conditionZodSchema).min(1) }).strict();
    const orCondition = z.object({ or: z.array(conditionZodSchema).min(1) }).strict();
    const notCondition = z.object({ not: z.array(conditionZodSchema).min(1) }).strict();

    return z.union([
      attributeCondition,
      featureCondition,
      experimentCondition,
      andCondition,
      orCondition,
      notCondition,
    ]);
  });

  return z.union([z.literal("*"), conditionZodSchema, z.array(conditionZodSchema).min(1)]);
}
