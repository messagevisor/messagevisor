import type { Condition, Context, GroupSegment, Segment } from "@messagevisor/types";

import { evaluateCondition } from "../evaluate";

export type TargetedResult<T> =
  | { state: "true" }
  | { state: "false" }
  | { state: "partial"; value: T };

function hasContextValue(context: Context | undefined, attribute: string) {
  if (!context) return false;
  let current: unknown = context;

  for (const part of attribute.split(".")) {
    if (
      !current ||
      typeof current !== "object" ||
      !Object.prototype.hasOwnProperty.call(current, part)
    ) {
      return false;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return true;
}

function simplifyAnd<T>(items: TargetedResult<T>[], create: (items: T[]) => T): TargetedResult<T> {
  if (items.some((item) => item.state === "false")) return { state: "false" };
  const partials = items
    .filter((item): item is { state: "partial"; value: T } => item.state === "partial")
    .map((item) => item.value);
  if (partials.length === 0) return { state: "true" };
  if (partials.length === 1) return { state: "partial", value: partials[0] };
  return { state: "partial", value: create(partials) };
}

function simplifyOr<T>(items: TargetedResult<T>[], create: (items: T[]) => T): TargetedResult<T> {
  if (items.some((item) => item.state === "true")) return { state: "true" };
  const partials = items
    .filter((item): item is { state: "partial"; value: T } => item.state === "partial")
    .map((item) => item.value);
  if (partials.length === 0) return { state: "false" };
  if (partials.length === 1) return { state: "partial", value: partials[0] };
  return { state: "partial", value: create(partials) };
}

function simplifyNot<T>(items: TargetedResult<T>[], create: (items: T[]) => T): TargetedResult<T> {
  // `not` negates the implicit AND of its children.
  if (items.some((item) => item.state === "false")) return { state: "true" };
  const partials = items
    .filter((item): item is { state: "partial"; value: T } => item.state === "partial")
    .map((item) => item.value);
  if (partials.length === 0) return { state: "false" };
  return { state: "partial", value: create(partials) };
}

export function createTargetContextSpecializer(
  segments: Record<string, Segment>,
  context?: Context,
) {
  const specializedSegments: Record<string, Segment> = {};
  const segmentResults: Record<string, TargetedResult<Condition | Condition[]>> = {};

  function applyContextToCondition(
    condition: Condition | Condition[],
  ): TargetedResult<Condition | Condition[]> {
    if (Array.isArray(condition)) {
      return simplifyAnd(condition.map(applyContextToCondition), (items) => items as Condition[]);
    }
    if (typeof condition === "string") return applyContextToGroupSegment(condition);
    if ("and" in condition) {
      return simplifyAnd(condition.and.map(applyContextToCondition), (items) => ({
        and: items as Condition[],
      }));
    }
    if ("or" in condition) {
      return simplifyOr(condition.or.map(applyContextToCondition), (items) => ({
        or: items as Condition[],
      }));
    }
    if ("not" in condition) {
      return simplifyNot(condition.not.map(applyContextToCondition), (items) => ({
        not: items as Condition[],
      }));
    }
    if (!("attribute" in condition) || !hasContextValue(context, condition.attribute)) {
      return { state: "partial", value: condition };
    }
    return evaluateCondition(condition, { context, segments })
      ? { state: "true" }
      : { state: "false" };
  }

  function applyContextToSegment(segmentKey: string): TargetedResult<Condition | Condition[]> {
    if (segmentResults[segmentKey]) return segmentResults[segmentKey];
    const segment = segments[segmentKey];
    if (!segment || segment.archived) return (segmentResults[segmentKey] = { state: "false" });

    const result = applyContextToCondition(segment.conditions);
    segmentResults[segmentKey] = result;
    if (result.state === "partial") {
      const datafileSegment = { ...segment } as Record<string, unknown>;
      delete datafileSegment.key;
      delete datafileSegment.description;
      delete datafileSegment.promotable;
      specializedSegments[segmentKey] = { ...datafileSegment, conditions: result.value };
    }
    return result;
  }

  function applyContextToGroupSegment(
    group: GroupSegment | GroupSegment[],
  ): TargetedResult<GroupSegment | GroupSegment[]> {
    if (Array.isArray(group)) {
      return simplifyAnd(group.map(applyContextToGroupSegment), (items) => items as GroupSegment[]);
    }
    if (typeof group === "string") {
      const result = applyContextToSegment(group);
      return result.state === "partial" ? { state: "partial", value: group } : result;
    }
    if ("and" in group) {
      return simplifyAnd(group.and.map(applyContextToGroupSegment), (items) => ({
        and: items as GroupSegment[],
      }));
    }
    if ("or" in group) {
      return simplifyOr(group.or.map(applyContextToGroupSegment), (items) => ({
        or: items as GroupSegment[],
      }));
    }
    return simplifyNot(group.not.map(applyContextToGroupSegment), (items) => ({
      not: items as GroupSegment[],
    }));
  }

  return {
    specializedSegments,
    applyContextToCondition,
    applyContextToGroupSegment,
  };
}
