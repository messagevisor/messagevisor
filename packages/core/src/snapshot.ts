import type { Attribute, Locale, Message, Segment, Target, Test } from "@messagevisor/types";

import type { Datasource } from "./datasource";
import type { EntityType } from "./datasource/adapter";

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
  concurrency?: number;
}

type SnapshotEntity = Locale | Message | Segment | Attribute | Target | Test;

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
  const requestedConcurrency = options.concurrency ?? 16;
  const concurrency = Number.isFinite(requestedConcurrency)
    ? Math.max(1, Math.floor(requestedConcurrency))
    : 16;
  const keys = emptyKeys();

  await Promise.all(
    entityTypes.map(async (entityType) => {
      keys[entityType] = await datasource.listEntities(entityType);
    }),
  );

  const entities = emptyEntities();
  const jobs = entityTypes.flatMap((entityType) =>
    keys[entityType].map((key) => ({ entityType, key })),
  );
  let nextJobIndex = 0;

  async function worker() {
    while (nextJobIndex < jobs.length) {
      const job = jobs[nextJobIndex++];
      const entity = await datasource.readEntity<SnapshotEntity>(job.entityType, job.key);
      entities[job.entityType][job.key] = entity;
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, () => worker()));

  return {
    revision: await datasource.readRevision(),
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
