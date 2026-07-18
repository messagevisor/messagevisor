import type { Condition, Context, GroupSegment, Segment } from "@messagevisor/types";

export interface EvaluateOptions {
  context?: Context;
  segments?: Record<string, Segment>;
  resolveFlag?: (featureKey: string, context?: Context) => boolean;
  resolveVariation?: (experimentKey: string, context?: Context) => string | null;
}

function getContextValue(context: Context | undefined, attribute: string) {
  if (!context) {
    return undefined;
  }

  return attribute
    .split(".")
    .reduce(
      (value: any, part) => (value !== null && typeof value === "object" ? value[part] : undefined),
      context as any,
    );
}

const isoDatePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

function getPortableDateTime(value: unknown) {
  if (value instanceof Date) {
    const time = value.getTime();
    return isNaN(time) ? undefined : time;
  }

  if (typeof value !== "string" || !isoDatePattern.test(value)) {
    return undefined;
  }

  const time = new Date(value).getTime();
  return isNaN(time) ? undefined : time;
}

function compareDate(value: unknown, expected: unknown, operator: "before" | "after") {
  const valueTime = getPortableDateTime(value);
  const expectedTime = getPortableDateTime(expected);

  if (typeof valueTime === "undefined" || typeof expectedTime === "undefined") {
    return false;
  }

  return operator === "before" ? valueTime < expectedTime : valueTime > expectedTime;
}

function stringContains(value: unknown, expected: unknown) {
  return (
    typeof value === "string" && typeof expected === "string" && value.indexOf(expected) !== -1
  );
}

function stringStartsWith(value: unknown, expected: unknown) {
  if (typeof value !== "string" || typeof expected !== "string") return false;
  const valueAsString = value;
  const expectedAsString = expected;

  return valueAsString.slice(0, expectedAsString.length) === expectedAsString;
}

function stringEndsWith(value: unknown, expected: unknown) {
  if (typeof value !== "string" || typeof expected !== "string") return false;
  const valueAsString = value;
  const expectedAsString = expected;

  return valueAsString.slice(valueAsString.length - expectedAsString.length) === expectedAsString;
}

function arrayContains(value: unknown[], expected: unknown) {
  return value.indexOf(expected) !== -1;
}

function parseStructuredString(value: string): unknown {
  if (!(value.startsWith("{") || value.startsWith("["))) {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function evaluateCondition(
  condition: Condition | Condition[] | "*" | undefined,
  options: EvaluateOptions = {},
): boolean {
  if (!condition || condition === "*") {
    return true;
  }

  if (Array.isArray(condition)) {
    return condition.every((item) => evaluateCondition(item, options));
  }

  if (typeof condition === "string") {
    const parsedCondition = parseStructuredString(condition);

    if (parsedCondition !== condition) {
      return evaluateCondition(parsedCondition as Condition | Condition[], options);
    }

    return false;
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
      return value !== undefined;
    case "notExists":
      return value === undefined;
    case "greaterThan":
      return typeof value === "number" && typeof expected === "number" && value > expected;
    case "greaterThanOrEquals":
      return typeof value === "number" && typeof expected === "number" && value >= expected;
    case "lessThan":
      return typeof value === "number" && typeof expected === "number" && value < expected;
    case "lessThanOrEquals":
      return typeof value === "number" && typeof expected === "number" && value <= expected;
    case "contains":
      return stringContains(value, expected);
    case "notContains":
      return (
        typeof value === "string" &&
        typeof expected === "string" &&
        !stringContains(value, expected)
      );
    case "startsWith":
      return stringStartsWith(value, expected);
    case "endsWith":
      return stringEndsWith(value, expected);
    case "matches":
    case "notMatches": {
      if (typeof value !== "string" || typeof expected !== "string") return false;
      if (condition.regexFlags && !/^[imsu]+$/.test(condition.regexFlags)) return false;
      try {
        const matched = new RegExp(expected, condition.regexFlags || "").test(value);
        return condition.operator === "matches" ? matched : !matched;
      } catch {
        return false;
      }
    }
    case "before":
      return compareDate(value, expected, "before");
    case "after":
      return compareDate(value, expected, "after");
    case "includes":
      return Array.isArray(value) && arrayContains(value, expected);
    case "notIncludes":
      return Array.isArray(value) && !arrayContains(value, expected);
    case "in":
      return Array.isArray(expected) && arrayContains(expected, value);
    case "notIn":
      return Array.isArray(expected) && !arrayContains(expected, value);
    default:
      return false;
  }
}

export function evaluateGroupSegment(
  groupSegment: GroupSegment | GroupSegment[] | "*" | undefined,
  options: EvaluateOptions = {},
): boolean {
  if (!groupSegment || groupSegment === "*") {
    return true;
  }

  if (Array.isArray(groupSegment)) {
    return groupSegment.every((item) => evaluateGroupSegment(item, options));
  }

  if (typeof groupSegment === "string") {
    const parsedGroupSegment = parseStructuredString(groupSegment);

    if (parsedGroupSegment !== groupSegment) {
      return evaluateGroupSegment(parsedGroupSegment as GroupSegment | GroupSegment[], options);
    }

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

export function evaluateSegment(segmentKey: string, options: EvaluateOptions = {}) {
  const segment = options.segments ? options.segments[segmentKey] : undefined;

  if (!segment || segment.archived) {
    return false;
  }

  return evaluateCondition(segment.conditions, options);
}
