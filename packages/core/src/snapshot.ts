import * as fs from "node:fs/promises";
import * as path from "node:path";

import type { Attribute, Locale, Message, Segment, Target, Test } from "@messagevisor/types";

import type { Datasource } from "./datasource";
import type { EntityType } from "./datasource/adapter";

const SNAPSHOT_CACHE_VERSION = 1;

export const SNAPSHOT_ENTITY_TYPES: EntityType[] = [
  "locale",
  "message",
  "segment",
  "attribute",
  "target",
  "test",
];

export interface ProjectSnapshot {
  revision: string;
  /** Entity collections that were requested when this snapshot was loaded. */
  loadedEntityTypes: Set<EntityType>;
  keys: Record<EntityType, string[]>;
  keySets: Record<EntityType, Set<string>>;
  locales: Record<string, Locale>;
  messages: Record<string, Message>;
  segments: Record<string, Segment>;
  attributes: Record<string, Attribute>;
  targets: Record<string, Target>;
  tests: Record<string, Test>;
}

export interface LoadProjectSnapshotOptions {
  entityTypes?: EntityType[];
  /** Load keys for cross-reference validation without parsing those entities. */
  keyOnlyEntityTypes?: EntityType[];
  concurrency?: number;
  /** Keep valid entities when one source file cannot be parsed. */
  ignoreReadErrors?: boolean;
}

type SnapshotEntity = Locale | Message | Segment | Attribute | Target | Test;

interface SnapshotCacheEntry {
  fingerprint: string;
  entity: SnapshotEntity;
}

interface SnapshotCacheFile {
  version: number;
  entries: Partial<Record<EntityType, Record<string, SnapshotCacheEntry>>>;
}

function emptyKeys(): Record<EntityType, string[]> {
  return {
    locale: [],
    message: [],
    segment: [],
    attribute: [],
    target: [],
    test: [],
  };
}

function emptyEntities(): Record<EntityType, Record<string, SnapshotEntity>> {
  return {
    locale: {},
    message: {},
    segment: {},
    attribute: {},
    target: {},
    test: {},
  };
}

async function readSnapshotCache(datasource: Datasource): Promise<{
  path?: string;
  cache?: SnapshotCacheFile;
}> {
  const cachePath = datasource.getSnapshotCachePath();

  if (!cachePath) {
    return {};
  }

  try {
    const content = await fs.readFile(cachePath, "utf8");
    const cache = JSON.parse(content) as SnapshotCacheFile;

    if (cache.version !== SNAPSHOT_CACHE_VERSION || !cache.entries) {
      return { path: cachePath, cache: { version: SNAPSHOT_CACHE_VERSION, entries: {} } };
    }

    return { path: cachePath, cache };
  } catch {
    return { path: cachePath, cache: { version: SNAPSHOT_CACHE_VERSION, entries: {} } };
  }
}

async function writeSnapshotCache(cachePath: string, cache: SnapshotCacheFile) {
  const temporaryPath = `${cachePath}.${process.pid}.${Date.now()}.tmp`;

  try {
    await fs.mkdir(path.dirname(cachePath), { recursive: true });
    await fs.writeFile(temporaryPath, JSON.stringify(cache));
    await fs.rename(temporaryPath, cachePath);
  } catch {
    // The parse cache is an optimization. Read-only projects and unusual
    // adapters must never make a command fail because it cannot be updated.
    try {
      await fs.unlink(temporaryPath);
    } catch {
      // Ignore cleanup failures for the best-effort cache.
    }
  }
}

/**
 * Read a project once for a command invocation.
 *
 * Files are deliberately parsed through a small bounded worker pool. YAML
 * parsing is CPU and allocation heavy, so unbounded Promise.all increases
 * garbage collection pressure and is slower on large projects.
 */
export async function loadProjectSnapshot(
  datasource: Datasource,
  options: LoadProjectSnapshotOptions = {},
): Promise<ProjectSnapshot> {
  const requestedTypes = options.entityTypes || SNAPSHOT_ENTITY_TYPES;
  const entityTypes = Array.from(new Set(requestedTypes));
  const keyOnlyEntityTypes = Array.from(
    new Set((options.keyOnlyEntityTypes || []).filter((type) => !entityTypes.includes(type))),
  );
  const listedEntityTypes = [...entityTypes, ...keyOnlyEntityTypes];
  const requestedConcurrency = options.concurrency ?? 16;
  const concurrency = Number.isFinite(requestedConcurrency)
    ? Math.max(1, Math.floor(requestedConcurrency))
    : 16;
  const keys = emptyKeys();

  await Promise.all(
    listedEntityTypes.map(async (entityType) => {
      keys[entityType] = await datasource.listEntities(entityType);
    }),
  );

  const entities = emptyEntities();
  const cacheState = await readSnapshotCache(datasource);
  const cache = cacheState.cache;
  let cacheChanged = false;
  const jobs = entityTypes.flatMap((entityType) =>
    keys[entityType].map((key) => ({ entityType, key })),
  );
  let nextJobIndex = 0;

  async function worker() {
    while (nextJobIndex < jobs.length) {
      const job = jobs[nextJobIndex++];
      try {
        const fingerprint = await datasource.getEntityFingerprint(job.entityType, job.key);
        const cachedEntry = fingerprint ? cache?.entries[job.entityType]?.[job.key] : undefined;
        const entity =
          cachedEntry && cachedEntry.fingerprint === fingerprint
            ? cachedEntry.entity
            : await datasource.readEntity<SnapshotEntity>(job.entityType, job.key);

        entities[job.entityType][job.key] = entity;

        if (cache && fingerprint && (!cachedEntry || cachedEntry.fingerprint !== fingerprint)) {
          cache.entries[job.entityType] ||= {};
          cache.entries[job.entityType]![job.key] = { fingerprint, entity };
          cacheChanged = true;
        }
      } catch (error) {
        if (!options.ignoreReadErrors) {
          throw error;
        }
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, () => worker()));

  if (cache) {
    for (const entityType of listedEntityTypes) {
      const entries = cache.entries[entityType];
      if (!entries) continue;
      const currentKeys = new Set(keys[entityType]);

      for (const key of Object.keys(entries)) {
        if (!currentKeys.has(key)) {
          delete entries[key];
          cacheChanged = true;
        }
      }
    }
  }

  if (cacheState.path && cache && cacheChanged) {
    await writeSnapshotCache(cacheState.path, cache);
  }

  return {
    revision: await datasource.readRevision(),
    loadedEntityTypes: new Set(entityTypes),
    keys,
    keySets: {
      locale: new Set(keys.locale),
      message: new Set(keys.message),
      segment: new Set(keys.segment),
      attribute: new Set(keys.attribute),
      target: new Set(keys.target),
      test: new Set(keys.test),
    },
    locales: entities.locale as Record<string, Locale>,
    messages: entities.message as Record<string, Message>,
    segments: entities.segment as Record<string, Segment>,
    attributes: entities.attribute as Record<string, Attribute>,
    targets: entities.target as Record<string, Target>,
    tests: entities.test as Record<string, Test>,
  };
}
