import * as path from "path";

import type { ProjectConfig } from "../config";

export function assertValidEntityKey(config: ProjectConfig, key: string) {
  if (typeof key !== "string" || key.length === 0) {
    throw new Error("Entity key must be a non-empty string.");
  }

  const segments = key.split(config.namespaceCharacter);

  if (
    segments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        segment.includes("/") ||
        segment.includes("\\") ||
        !/^[a-zA-Z0-9_-]+$/.test(segment),
    )
  ) {
    throw new Error(
      `Invalid entity key "${key}". Namespace segments must be non-empty and contain only letters, numbers, "_", and "-".`,
    );
  }

  return segments;
}

export function assertPathWithinDirectory(directoryPath: string, filePath: string) {
  const relative = path.relative(path.resolve(directoryPath), path.resolve(filePath));

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Resolved entity path escapes its configured directory: ${filePath}`);
  }

  return filePath;
}

export function omitDerivedEntityKey<T>(entity: T): T {
  if (!entity || typeof entity !== "object" || Array.isArray(entity)) return entity;
  const persisted = { ...(entity as Record<string, unknown>) };
  delete persisted.key;
  return persisted as T;
}
