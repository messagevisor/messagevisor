import type { Locale, Message, Segment, Target, Test } from "@messagevisor/types";
import type { EntityType } from "../datasource";
import { omitDerivedEntityKey } from "../datasource/entityKey";

function replaceRecordKey<T>(record: Record<string, T> | undefined, from: string, to: string) {
  if (!record || !Object.prototype.hasOwnProperty.call(record, from)) return record;
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key === from ? to : key, value]),
  );
}

function mapArray<T>(values: T[] | undefined, map: (value: T) => T): T[] | undefined {
  return Array.isArray(values)
    ? values.map((value) => (value && typeof value === "object" ? map(value) : value))
    : values;
}

function mapStructuredString(value: string, map: (parsed: unknown) => unknown) {
  if (!(value.startsWith("{") || value.startsWith("["))) return value;
  try {
    return JSON.stringify(map(JSON.parse(value)));
  } catch {
    return value;
  }
}

function renameCondition(value: unknown, from: string, to: string): unknown {
  if (Array.isArray(value)) return value.map((entry) => renameCondition(entry, from, to));
  if (typeof value === "string")
    return mapStructuredString(value, (parsed) => renameCondition(parsed, from, to));
  if (!value || typeof value !== "object") return value;
  const condition = { ...(value as Record<string, unknown>) };
  if (typeof condition.attribute === "string") {
    const [root, ...rest] = condition.attribute.split(".");
    if (root === from) condition.attribute = [to, ...rest].join(".");
  }
  for (const operator of ["and", "or", "not"]) {
    if (operator in condition) condition[operator] = renameCondition(condition[operator], from, to);
  }
  return condition;
}

function renameGroupSegment(value: unknown, from: string, to: string): unknown {
  if (Array.isArray(value)) return value.map((entry) => renameGroupSegment(entry, from, to));
  if (typeof value === "string") {
    if (value === from) return to;
    return mapStructuredString(value, (parsed) => renameGroupSegment(parsed, from, to));
  }
  if (!value || typeof value !== "object") return value;
  const group = { ...(value as Record<string, unknown>) };
  for (const operator of ["and", "or", "not"]) {
    if (operator in group) group[operator] = renameGroupSegment(group[operator], from, to);
  }
  return group;
}

function replaceExactPattern(value: string | string[] | undefined, from: string, to: string) {
  if (typeof value === "string") return value === from ? to : value;
  return Array.isArray(value) ? value.map((entry) => (entry === from ? to : entry)) : value;
}

/** Visit only authored reference fields, never arbitrary values or translator copy. */
export function renameReferences(
  renamedType: EntityType,
  entityType: EntityType,
  entity: unknown,
  from: string,
  to: string,
): unknown {
  if (!entity || typeof entity !== "object" || Array.isArray(entity)) return entity;
  const next = omitDerivedEntityKey(structuredClone(entity));
  const exact = (value: string | undefined) => (value === from ? to : value);
  const context = <T extends { context?: Record<string, unknown> }>(value: T): T => {
    if (renamedType === "attribute") value.context = replaceRecordKey(value.context, from, to);
    return value;
  };

  switch (entityType) {
    case "locale": {
      const locale = next as Locale;
      if (renamedType === "locale") {
        locale.inheritFormatsFrom = exact(locale.inheritFormatsFrom);
        locale.inheritTranslationsFrom = exact(locale.inheritTranslationsFrom);
        locale.mergeExamplesFrom = exact(locale.mergeExamplesFrom);
      }
      locale.examples = mapArray(locale.examples, (example) => {
        if (renamedType === "message") example.message = exact(example.message);
        return context(example);
      });
      break;
    }
    case "message": {
      const message = next as Message;
      if (renamedType === "locale") {
        message.translations = replaceRecordKey(message.translations, from, to)!;
        message.translationStates = replaceRecordKey(message.translationStates, from, to);
      }
      message.examples = mapArray(message.examples, (example) => {
        if (renamedType === "locale") example.locale = exact(example.locale)!;
        return context(example);
      });
      message.overrides = mapArray(message.overrides, (override) => {
        if (renamedType === "attribute")
          override.conditions = renameCondition(
            override.conditions,
            from,
            to,
          ) as typeof override.conditions;
        if (renamedType === "segment")
          override.segments = renameGroupSegment(
            override.segments,
            from,
            to,
          ) as typeof override.segments;
        if (renamedType === "locale") {
          override.translations = replaceRecordKey(override.translations, from, to)!;
          override.translationStates = replaceRecordKey(override.translationStates, from, to);
        }
        return override;
      });
      break;
    }
    case "segment": {
      const segment = next as Segment;
      if (renamedType === "attribute")
        segment.conditions = renameCondition(
          segment.conditions,
          from,
          to,
        ) as typeof segment.conditions;
      break;
    }
    case "target": {
      const target = context(next as Target);
      if (renamedType === "locale") {
        target.locales = replaceExactPattern(target.locales, from, to) as typeof target.locales;
        target.formats = replaceRecordKey(target.formats, from, to);
      }
      if (renamedType === "message") {
        target.includeMessages = replaceExactPattern(target.includeMessages, from, to);
        target.excludeMessages = replaceExactPattern(target.excludeMessages, from, to);
      }
      break;
    }
    case "test": {
      const test = next as Test;
      if ("message" in test) {
        if (renamedType === "message") test.message = exact(test.message)!;
        test.assertions = mapArray(test.assertions, (assertion) => {
          if (renamedType === "locale") assertion.locale = exact(assertion.locale)!;
          if (renamedType === "target") assertion.target = exact(assertion.target);
          return context(assertion);
        })!;
      } else if ("segment" in test) {
        if (renamedType === "segment") test.segment = exact(test.segment)!;
        test.assertions = mapArray(test.assertions, (assertion) => {
          if (renamedType === "segment") assertion.segment = exact(assertion.segment)!;
          return context(assertion);
        })!;
      } else if ("locale" in test) {
        if (renamedType === "locale") test.locale = exact(test.locale)!;
        test.assertions = mapArray(test.assertions, (assertion) => {
          if (renamedType === "target") assertion.target = exact(assertion.target);
          return context(assertion);
        })!;
      } else if ("target" in test) {
        if (renamedType === "target") test.target = exact(test.target)!;
        test.assertions = mapArray(test.assertions, (assertion) => {
          if (renamedType === "locale") assertion.locale = exact(assertion.locale)!;
          if (renamedType === "message") {
            assertion.message = exact(assertion.message);
            assertion.expectedToIncludeMessages = replaceExactPattern(
              assertion.expectedToIncludeMessages,
              from,
              to,
            ) as typeof assertion.expectedToIncludeMessages;
            assertion.expectedToNotIncludeMessages = replaceExactPattern(
              assertion.expectedToNotIncludeMessages,
              from,
              to,
            ) as typeof assertion.expectedToNotIncludeMessages;
          }
          return context(assertion);
        })!;
      }
      break;
    }
  }
  return next;
}
