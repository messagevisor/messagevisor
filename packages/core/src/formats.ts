import type { FormatPresets } from "@messagevisor/types";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function mergeFormatPresets(
  parent?: FormatPresets,
  child?: FormatPresets,
): FormatPresets | undefined {
  if (typeof parent === "undefined") {
    return child;
  }

  if (typeof child === "undefined") {
    return parent;
  }

  if (!isPlainObject(parent) || !isPlainObject(child)) {
    return child;
  }

  const result: Record<string, unknown> = { ...parent };

  for (const typeKey of Object.keys(child)) {
    const parentStyles = result[typeKey];
    const childStyles = child[typeKey as keyof FormatPresets];

    if (!isPlainObject(parentStyles) || !isPlainObject(childStyles)) {
      result[typeKey] = childStyles;
      continue;
    }

    result[typeKey] = {
      ...parentStyles,
      ...childStyles,
    };
  }

  return result as FormatPresets;
}
