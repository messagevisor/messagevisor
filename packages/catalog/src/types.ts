export type EntityType = "locale" | "message" | "attribute" | "segment" | "target";

export type EntityPath = "locales" | "messages" | "attributes" | "segments" | "targets";
export type GitProvider = "github" | "gitlab" | "bitbucket";
export type DevEditorId = "cursor" | "vscode";

export interface DevEditor {
  id: DevEditorId;
  label: string;
  icon: DevEditorId;
}

export interface LastModified {
  commit: string;
  author: string;
  timestamp: string;
}

export interface EntitySummary {
  key: string;
  description?: string;
  archived?: boolean;
  deprecated?: boolean;
  targets?: string[];
  overrideCount?: number;
  messageCount?: number;
  usedInMessageCount?: number;
  usedInSegmentCount?: number;
  locales?: string[];
  overrideLocales?: string[];
  lastModified?: LastModified;
  href: string;
}

export type CatalogValueSource = "direct" | "inherited" | "target" | "missing";

export interface FormatRow {
  path: string;
  value: unknown;
  source: CatalogValueSource;
  from?: string;
  /** Sample output from Intl for `number` / `date` / `time` presets (catalog build). */
  examplePreview?: string;
}

export interface TranslationRow {
  locale: string;
  value: string;
  source: CatalogValueSource;
  from?: string;
  status?: "draft" | "translated" | "reviewed";
  sourceHash?: string;
  stale?: boolean;
}

export interface DuplicateTranslationSource {
  messageKey: string;
  locale: string;
}

export interface DuplicateTranslationValue {
  value: string;
  messageKeys: string[];
  sources: DuplicateTranslationSource[];
}

export interface LocaleDuplicates {
  locale: string;
  summary: {
    duplicateValues: number;
    duplicateMessageKeys: number;
  };
  duplicateValues: DuplicateTranslationValue[];
}

export interface CatalogIndex {
  set: string;
  counts: Record<EntityType, number>;
  entities: Record<EntityType, EntitySummary[]>;
}

export interface CatalogManifest {
  schemaVersion: string;
  generatedAt: string;
  router?: "hash" | "browser";
  sets: boolean;
  setKeys: string[];
  dev?: {
    editors: DevEditor[];
  };
  links?: {
    provider?: GitProvider;
    repository?: string;
    source: string;
    commit: string;
  };
  features?: {
    translationSearch?: boolean;
    duplicates?: boolean;
  };
  layout?: {
    version: number;
    blockSize: number;
    vbucketBits: number;
    blockedTypes: EntityType[];
  };
  paths: {
    projectHistory: string;
    root?: string;
    sets?: Record<string, string>;
  };
  counts: Record<string, Record<EntityType, number>>;
}

export interface HistoryEntity {
  type: EntityType | "test";
  key: string;
  set?: string;
}

export interface HistoryEntry {
  commit: string;
  author: string;
  timestamp: string;
  entities: HistoryEntity[];
}

export interface HistoryPage {
  page: number;
  pageSize: number;
  totalPages: number;
  entries: HistoryEntry[];
}

export interface EntityDetail<T = Record<string, unknown>> {
  type: EntityType;
  key: string;
  entity: T;
  sourcePath?: string;
  editLinks?: Partial<Record<DevEditorId, string>>;
  lastModified?: LastModified;
  [key: string]: unknown;
}
