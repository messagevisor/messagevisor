import * as fs from "node:fs/promises";
import * as path from "node:path";

import type { Attribute, Locale, Message, Segment, Target, Test } from "@messagevisor/types";

import type { Datasource } from "./datasource";
import type { EntityType } from "./datasource/adapter";

const SNAPSHOT_CACHE_VERSION = 2;

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
  /** Disable the best-effort persistent parse cache for this invocation. */
  cache?: boolean;
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

interface SnapshotCacheState {
  directoryPath?: string;
  caches: Partial<Record<EntityType, SnapshotCacheFile>>;
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

function orderEntityRecord<T>(keys: string[], values: Record<string, T>): Record<string, T> {
  const ordered: Record<string, T> = {};

  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(values, key)) {
      ordered[key] = values[key];
    }
  }

  return ordered;
}

async function readSnapshotCacheFile(directoryPath: string, entityType: EntityType) {
  const cachePath = path.join(directoryPath, `${entityType}.json`);

  try {
    const content = await fs.readFile(cachePath, "utf8");
    const cache = JSON.parse(content) as SnapshotCacheFile;

    if (cache.version === SNAPSHOT_CACHE_VERSION && cache.entries) {
      return cache;
    }
  } catch {
    // A missing or corrupt cache shard is rebuilt from source entities.
  }

  return { version: SNAPSHOT_CACHE_VERSION, entries: {} };
}

async function readSnapshotCache(
  datasource: Datasource,
  entityTypes: EntityType[],
): Promise<SnapshotCacheState> {
  const directoryPath = datasource.getSnapshotCachePath();

  if (!directoryPath) {
    return { caches: {} };
  }

  const cacheEntries = await Promise.all(
    entityTypes.map(
      async (entityType) =>
        [entityType, await readSnapshotCacheFile(directoryPath, entityType)] as const,
    ),
  );

  return {
    directoryPath,
    caches: Object.fromEntries(cacheEntries) as Partial<Record<EntityType, SnapshotCacheFile>>,
  };
}

async function writeSnapshotCache(
  directoryPath: string,
  entityType: EntityType,
  cache: SnapshotCacheFile,
) {
  const cachePath = path.join(directoryPath, `${entityType}.json`);
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
  const cacheEnabled = options.cache !== false && process.env.MESSAGEVISOR_NO_CACHE !== "1";

  await Promise.all(
    listedEntityTypes.map(async (entityType) => {
      keys[entityType] = await datasource.listEntities(entityType);
    }),
  );

  const entities = emptyEntities();
  const cacheState: SnapshotCacheState = cacheEnabled
    ? await readSnapshotCache(datasource, entityTypes)
    : { caches: {} };
  const changedEntityTypes = new Set<EntityType>();
  const jobs = entityTypes.flatMap((entityType) =>
    keys[entityType].map((key) => ({ entityType, key })),
  );
  let nextJobIndex = 0;

  async function worker() {
    while (nextJobIndex < jobs.length) {
      const job = jobs[nextJobIndex++];
      try {
        const fingerprint = await datasource.getEntityFingerprint(job.entityType, job.key);
        const cache = cacheState.caches[job.entityType];
        const cachedEntry = fingerprint ? cache?.entries[job.entityType]?.[job.key] : undefined;
        const entity =
          cachedEntry && cachedEntry.fingerprint === fingerprint
            ? cachedEntry.entity
            : await datasource.readEntity<SnapshotEntity>(job.entityType, job.key);

        // Snapshot entities are treated as immutable by current consumers.
        // Cache shards are deserialized per invocation, so this reference is
        // not shared with another process or with the cache file on disk.
        entities[job.entityType][job.key] = entity;

        if (cache && fingerprint && (!cachedEntry || cachedEntry.fingerprint !== fingerprint)) {
          cache.entries[job.entityType] ||= {};
          cache.entries[job.entityType]![job.key] = { fingerprint, entity };
          changedEntityTypes.add(job.entityType);
        }
      } catch (error) {
        if (!options.ignoreReadErrors) {
          throw error;
        }
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, () => worker()));

  // Workers finish in filesystem and parser dependent order. Rebuild every
  // loaded collection from the already sorted key list so consumers never
  // observe a different insertion order for the same project.
  for (const entityType of entityTypes) {
    entities[entityType] = orderEntityRecord(keys[entityType], entities[entityType]);
  }

  // Only listed types are pruned intentionally. Reading unrelated shards to
  // remove stale keys would make narrow lint and editor workflows slower.
  for (const entityType of listedEntityTypes) {
    const cache = cacheState.caches[entityType];
    const entries = cache?.entries[entityType];
    if (!entries) continue;
    const currentKeys = new Set(keys[entityType]);

    for (const key of Object.keys(entries)) {
      if (!currentKeys.has(key)) {
        delete entries[key];
        changedEntityTypes.add(entityType);
      }
    }
  }

  if (cacheState.directoryPath) {
    for (const entityType of changedEntityTypes) {
      const cache = cacheState.caches[entityType];
      if (cache) {
        await writeSnapshotCache(cacheState.directoryPath, entityType, cache);
      }
    }
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
