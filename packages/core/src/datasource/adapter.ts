import type { DatafileContent } from "@messagevisor/types";

import type { ProjectConfig } from "../config";
import type { DatafileFile, WriteDatafileOptions } from "./index";

export type EntityType = "locale" | "message" | "segment" | "attribute" | "target" | "test";

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
  abstract entityExists(type: EntityType, key: string): Promise<boolean> | boolean;
  abstract readEntity<T>(type: EntityType, key: string): Promise<T>;
  abstract writeEntity<T>(type: EntityType, key: string, entity: T): Promise<T>;
  abstract deleteEntity(type: EntityType, key: string): Promise<void>;

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
