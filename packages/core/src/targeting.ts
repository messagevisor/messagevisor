import type { Target } from "@messagevisor/types";

export type PatternValue = string | string[];

export function normalizePatterns(patterns?: PatternValue): string[] {
  if (typeof patterns === "undefined") {
    return [];
  }

  return Array.isArray(patterns) ? patterns : [patterns];
}

export function matchesPattern(key: string, patterns?: PatternValue): boolean {
  return normalizePatterns(patterns).some((pattern) => {
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    return new RegExp(`^${escaped}$`).test(key);
  });
}

export function getTargetIncludedMessages(target?: Target): PatternValue {
  return typeof target?.includeMessages === "undefined" ? "*" : target.includeMessages;
}

export function targetIncludesMessage(target: Target | undefined, messageKey: string): boolean {
  return (
    matchesPattern(messageKey, getTargetIncludedMessages(target)) &&
    !matchesPattern(messageKey, target?.excludeMessages)
  );
}

export function resolveSelectedTargetKeys(
  targetKeys: string[],
  requestedTargets?: PatternValue,
): string[] {
  const requested = normalizePatterns(requestedTargets);

  if (requested.length === 0) {
    return targetKeys;
  }

  return targetKeys.filter((targetKey) => matchesPattern(targetKey, requested));
}
