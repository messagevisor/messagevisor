import type { DatafileContent } from "@messagevisor/types";

import type { ProjectConfig } from "../config";
import type { DatafileFile, WriteDatafileOptions } from "./index";

export type EntityType = "locale" | "message" | "segment" | "attribute" | "target" | "test";

export interface EntityDocument<T> {
  type: EntityType;
  key: string;
  entity: T;
  version: string;
}

export type EntityMutation =
  | {
      operation: "write";
      type: EntityType;
      key: string;
      entity: unknown;
      expectedVersion?: string | null;
    }
  | {
      operation: "delete";
      type: EntityType;
      key: string;
      expectedVersion?: string | null;
    };

export interface EntityMutationResult {
  type: EntityType;
  key: string;
  operation: EntityMutation["operation"];
  version: string | null;
}

export interface ApplyEntityMutationsOptions {
  dryRun?: boolean;
}

/**
 * Storage boundary for Messagevisor projects.
 *
 * Commands, Datasource, and Catalog must depend on this contract rather than
 * filesystem details so alternate storage and future editorial workflows can
 * provide the same atomic entity operations.
 */
export abstract class Adapter {
  constructor(
    protected config: ProjectConfig,
    protected rootDirectoryPath?: string,
  ) {}

  abstract listSets(): Promise<string[]>;
  abstract listEntities(type: EntityType): Promise<string[]>;
  abstract entityExists(type: EntityType, key: string): Promise<boolean>;
  abstract readEntity<T>(type: EntityType, key: string): Promise<T>;
  getEntityFingerprint?(type: EntityType, key: string): Promise<string | null>;
  getSnapshotCachePath?(): string | undefined;
  abstract readEntityDocument<T>(type: EntityType, key: string): Promise<EntityDocument<T>>;
  abstract writeEntity<T>(type: EntityType, key: string, entity: T): Promise<T>;
  abstract deleteEntity(type: EntityType, key: string): Promise<void>;
  abstract applyEntityMutations(
    mutations: EntityMutation[],
    options?: ApplyEntityMutationsOptions,
  ): Promise<EntityMutationResult[]>;

  abstract readRevision(): Promise<string>;
  abstract writeRevision(revision: string): Promise<void>;
  abstract writeDatafile(
    datafileContent: DatafileContent,
    options?: WriteDatafileOptions,
  ): Promise<void>;
  abstract readDatafile(target: string, locale: string): Promise<DatafileContent>;
  listDatafiles?(): Promise<DatafileFile[]>;
}

export type AdapterConstructor = new (config: ProjectConfig, rootDirectoryPath?: string) => Adapter;
