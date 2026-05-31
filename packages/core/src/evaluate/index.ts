import type { Condition, Context, GroupSegment, Segment } from "@messagevisor/types";

export interface EvaluateConditionOptions {
  context?: Context;
  segments?: Record<string, Segment>;
  resolveFlag?: (featureKey: string, context?: Context) => boolean;
  resolveVariation?: (experimentKey: string, context?: Context) => string;
}

function getContextValue(context: Context | undefined, attribute: string) {
  if (!context) {
    return undefined;
  }

  return attribute
    .split(".")
    .reduce((value: any, part) => (value ? value[part] : undefined), context as any);
}

function compareDate(value: unknown, expected: unknown, operator: "before" | "after") {
  const valueTime = new Date(value as any).getTime();
  const expectedTime = new Date(expected as any).getTime();

  if (Number.isNaN(valueTime) || Number.isNaN(expectedTime)) {
    return false;
  }

  return operator === "before" ? valueTime < expectedTime : valueTime > expectedTime;
}

export function evaluateCondition(
  condition: Condition | Condition[] | "*" | undefined,
  options: EvaluateConditionOptions = {},
): boolean {
  if (!condition || condition === "*") {
    return true;
  }

  if (Array.isArray(condition)) {
    return condition.every((item) => evaluateCondition(item, options));
  }

  if (typeof condition === "string") {
    return evaluateSegment(condition, options);
  }

  if ("and" in condition) {
    return condition.and.every((item) => evaluateCondition(item, options));
  }

  if ("or" in condition) {
    return condition.or.some((item) => evaluateCondition(item, options));
  }

  if ("not" in condition) {
    return !condition.not.every((item) => evaluateCondition(item, options));
  }

  if ("feature" in condition) {
    const enabled = options.resolveFlag
      ? options.resolveFlag(condition.feature, options.context)
      : false;
    return condition.operator === "isEnabled"
      ? enabled
      : condition.operator === "isDisabled"
        ? !enabled
        : false;
  }

  if ("experiment" in condition) {
    const variation = options.resolveVariation
      ? options.resolveVariation(condition.experiment, options.context)
      : undefined;
    return condition.operator === "hasVariation" ? variation === condition.value : false;
  }

  const value = getContextValue(options.context, condition.attribute);
  const expected = condition.value;

  switch (condition.operator) {
    case "equals":
      return value === expected;
    case "notEquals":
      return value !== expected;
    case "exists":
      return value !== undefined && value !== null;
    case "notExists":
      return value === undefined || value === null;
    case "greaterThan":
      return Number(value) > Number(expected);
    case "greaterThanOrEquals":
      return Number(value) >= Number(expected);
    case "lessThan":
      return Number(value) < Number(expected);
    case "lessThanOrEquals":
      return Number(value) <= Number(expected);
    case "contains":
      return String(value).includes(String(expected));
    case "notContains":
      return !String(value).includes(String(expected));
    case "startsWith":
      return String(value).startsWith(String(expected));
    case "endsWith":
      return String(value).endsWith(String(expected));
    case "before":
      return compareDate(value, expected, "before");
    case "after":
      return compareDate(value, expected, "after");
    case "includes":
      return Array.isArray(value) && value.includes(expected as any);
    case "notIncludes":
      return !Array.isArray(value) || !value.includes(expected as any);
    case "in":
      return Array.isArray(expected) && expected.includes(value as any);
    case "notIn":
      return !Array.isArray(expected) || !expected.includes(value as any);
    default:
      return false;
  }
}

export function evaluateGroupSegment(
  groupSegment: GroupSegment | GroupSegment[] | "*" | undefined,
  options: EvaluateConditionOptions = {},
): boolean {
  if (!groupSegment || groupSegment === "*") {
    return true;
  }

  if (Array.isArray(groupSegment)) {
    return groupSegment.every((item) => evaluateGroupSegment(item, options));
  }

  if (typeof groupSegment === "string") {
    return evaluateSegment(groupSegment, options);
  }

  if ("and" in groupSegment) {
    return groupSegment.and.every((item) => evaluateGroupSegment(item, options));
  }

  if ("or" in groupSegment) {
    return groupSegment.or.some((item) => evaluateGroupSegment(item, options));
  }

  if ("not" in groupSegment) {
    return !groupSegment.not.every((item) => evaluateGroupSegment(item, options));
  }

  return false;
}

export function evaluateSegment(segmentKey: string, options: EvaluateConditionOptions = {}) {
  const segment = options.segments ? options.segments[segmentKey] : undefined;

  if (!segment || segment.archived) {
    return false;
  }

  return evaluateCondition(segment.conditions, options);
}
