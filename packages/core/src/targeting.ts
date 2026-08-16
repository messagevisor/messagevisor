import type { Target } from "@messagevisor/types";

export type PatternValue = string | string[];

export function normalizePatterns(patterns?: PatternValue): string[] {
  if (typeof patterns === "undefined") {
    return [];
  }

  return Array.isArray(patterns) ? patterns : [patterns];
}

function compilePattern(pattern: string) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

export function compilePatternMatcher(patterns?: PatternValue) {
  const exactPatterns = new Set<string>();
  const patternMatchers: RegExp[] = [];

  for (const pattern of normalizePatterns(patterns)) {
    if (pattern.includes("*")) {
      patternMatchers.push(compilePattern(pattern));
    } else {
      exactPatterns.add(pattern);
    }
  }

  return (key: string) =>
    exactPatterns.has(key) || patternMatchers.some((matcher) => matcher.test(key));
}

export function matchesPattern(key: string, patterns?: PatternValue): boolean {
  const normalizedPatterns = normalizePatterns(patterns);

  if (normalizedPatterns.length === 0) {
    return false;
  }

  if (normalizedPatterns.length === 1) {
    const pattern = normalizedPatterns[0];
    return pattern.includes("*") ? compilePattern(pattern).test(key) : pattern === key;
  }

  return compilePatternMatcher(patterns)(key);
}

export function getTargetIncludedMessages(target?: Target): PatternValue {
  return typeof target?.includeMessages === "undefined" ? "*" : target.includeMessages;
}

export function compileTargetMessageMatcher(target?: Target) {
  const includeMatcher = compilePatternMatcher(getTargetIncludedMessages(target));
  const excludeMatcher = compilePatternMatcher(target?.excludeMessages);

  return (messageKey: string) => includeMatcher(messageKey) && !excludeMatcher(messageKey);
}

export function targetIncludesMessage(target: Target | undefined, messageKey: string): boolean {
  return compileTargetMessageMatcher(target)(messageKey);
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
