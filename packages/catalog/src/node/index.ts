/* eslint-disable @typescript-eslint/no-unused-vars */
import * as childProcess from "child_process";
import * as fs from "fs";
import * as http from "http";
import * as path from "path";

import type {
  Attribute,
  Condition,
  DatafileContent,
  FormatPresets,
  GroupSegment,
  Locale,
  Message,
  Override,
  Target,
  Segment,
  Test,
} from "@messagevisor/types";

import { attachFormatExamplePreviews } from "./formatExamplePreview";

const CLI_FORMAT_GREEN = "\x1b[32m%s\x1b[0m";
const CLI_FORMAT_DIM = "\x1b[2m%s\x1b[0m";
const CLI_FORMAT_BOLD = "\x1b[1m%s\x1b[0m";

function colorize(value: string, colorCode: number) {
  return `\x1b[${colorCode}m${value}\x1b[0m`;
}

function prettyDuration(diffInMs: number) {
  let diff = Math.abs(diffInMs);

  if (diff === 0) {
    return "0ms";
  }

  const ms = diff % 1000;
  diff = (diff - ms) / 1000;
  const secs = diff % 60;
  diff = (diff - secs) / 60;
  const mins = diff % 60;
  const hrs = (diff - mins) / 60;

  let result = "";

  if (hrs) {
    result += ` ${hrs}h`;
  }

  if (mins) {
    result += ` ${mins}m`;
  }

  if (secs) {
    result += ` ${secs}s`;
  }

  if (ms) {
    result += ` ${ms}ms`;
  }

  return result.trim();
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function formatCatalogPath(rootDirectoryPath: string, filePath: string) {
  const relativePath = path.relative(rootDirectoryPath, filePath);

  if (relativePath && !relativePath.startsWith("..") && !path.isAbsolute(relativePath)) {
    return relativePath;
  }

  return filePath;
}

class CatalogProgressReporter {
  private readonly startedAt = Date.now();

  constructor(
    private readonly rootDirectoryPath: string,
    private readonly outputDirectoryPath: string,
  ) {}

  start(options: { browserRouter: boolean; sets: boolean; features: string[] }) {
    console.log("");
    console.log(CLI_FORMAT_BOLD, "Generating Messagevisor catalog");
    console.log(
      `  ${colorize("Output", 36)}: ${formatCatalogPath(
        this.rootDirectoryPath,
        this.outputDirectoryPath,
      )}`,
    );
    console.log(`  ${colorize("Router", 36)}: ${options.browserRouter ? "browser" : "hash"}`);
    console.log(`  ${colorize("Sets", 36)}:   ${options.sets ? "enabled" : "none"}`);
    console.log(`  ${colorize("Features", 36)}: ${options.features.join(", ") || "none"}`);
    console.log("");
  }

  step(label: string, detail?: string) {
    const suffix = detail ? `: ${colorize(detail, 2)}` : "";
    console.log(`  ${colorize("•", 36)} ${label}${suffix}`);
    return Date.now();
  }

  substep(label: string, detail?: string) {
    const suffix = detail ? `: ${colorize(detail, 2)}` : "";
    console.log(`    ${colorize("•", 36)} ${label}${suffix}`);
    return Date.now();
  }

  done(startedAt: number, detail?: string) {
    const suffix = detail ? ` ${detail}` : "";
    console.log(CLI_FORMAT_DIM, `    done in ${prettyDuration(Date.now() - startedAt)}${suffix}`);
  }

  setStart(set: string | undefined) {
    console.log("");
    if (set) {
      console.log(CLI_FORMAT_BOLD, `Set "${set}"`);
    } else {
      console.log(CLI_FORMAT_BOLD, "Root catalog");
    }
    return Date.now();
  }

  complete() {
    console.log("");
    console.log(
      CLI_FORMAT_GREEN,
      `Catalog exported to ${formatCatalogPath(this.rootDirectoryPath, this.outputDirectoryPath)}`,
    );
    console.log(CLI_FORMAT_BOLD, `Time: ${prettyDuration(Date.now() - this.startedAt)}`);
  }
}

export interface CatalogPluginParsedOptions {
  _: string[];
  [key: string]: any;
}

export interface CatalogPluginHandlerOptions {
  rootDirectoryPath: string;
  projectConfig: any;
  datasource: any;
  parsed: CatalogPluginParsedOptions;
}

export interface CatalogPlugin {
  command: string;
  handler: (options: CatalogPluginHandlerOptions) => Promise<void | boolean>;
  examples: {
    command: string;
    description: string;
  }[];
}

export interface CatalogRuntime {
  mergeFormats: (parent?: FormatPresets, child?: FormatPresets) => FormatPresets | undefined;
  resolveFormats: (
    localeKey: string,
    locales: Record<string, Locale>,
    target?: Target,
  ) => FormatPresets | undefined;
  buildDatafile: (
    projectConfig: any,
    datasource: any,
    targetKey: string | undefined,
    localeKey: string,
    revision: string,
  ) => Promise<DatafileContent>;
  getProjectSetExecutions: (
    projectConfig: any,
    datasource: any,
    selectedSet?: string,
  ) => Promise<Array<{ set: string; projectConfig: any; datasource: any }>>;
  resolveExamples: (
    projectConfig: any,
    datasource: any,
    options?: {
      set?: string;
      locale?: string;
      message?: string;
      exampleIndex?: number | string;
      matrixIndex?: number | string;
      descriptionPattern?: string | RegExp;
      translationPattern?: string | RegExp;
      onlyMessages?: boolean;
      onlyLocales?: boolean;
    },
  ) => Promise<{
    locales: CatalogEvaluatedLocaleExample[];
    messages: CatalogEvaluatedMessageExample[];
  }>;
  findDuplicateTranslations: (
    projectConfig: any,
    datasource: any,
  ) => Promise<CatalogDuplicateTranslationsResult>;
  targetIncludesMessage: (target: Target | undefined, messageKey: string) => boolean;
  expandTestAssertions: (test: Test) => Array<Record<string, unknown>>;
}

export const CATALOG_SCHEMA_VERSION = "1";
export const CATALOG_HISTORY_PAGE_SIZE = 50;

type CatalogEntityType = "locale" | "message" | "attribute" | "segment" | "target";
export type CatalogGitProvider = "github" | "gitlab" | "bitbucket";
export type CatalogDevEditorId = "cursor" | "vscode";

export interface CatalogDevEditor {
  id: CatalogDevEditorId;
  label: string;
  icon: CatalogDevEditorId;
}

interface CatalogHistoryEntity {
  type: CatalogEntityType | "test";
  key: string;
  set?: string;
}

interface CatalogHistoryEntry {
  commit: string;
  author: string;
  timestamp: string;
  entities: CatalogHistoryEntity[];
}

interface CatalogLastModified {
  commit: string;
  author: string;
  timestamp: string;
}

interface CatalogEntitySummary {
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
  lastModified?: CatalogLastModified;
  href: string;
}

type CatalogValueSource = "direct" | "inherited" | "target" | "missing";

interface CatalogFormatRow {
  path: string;
  value: unknown;
  source: CatalogValueSource;
  from?: string;
  examplePreview?: string;
}

interface CatalogTranslationRow {
  locale: string;
  value: string;
  source: CatalogValueSource;
  from?: string;
}

interface CatalogEvaluatedMessageExample {
  set?: string;
  message: string;
  locale: string;
  exampleIndex: number;
  matrixIndex?: number;
  description?: string;
  values?: Record<string, unknown>;
  context?: Record<string, unknown>;
  formats?: FormatPresets;
  currency?: string;
  timeZone?: string;
  evaluatedTranslation: unknown;
}

interface CatalogEvaluatedLocaleExample {
  set?: string;
  locale: string;
  sourceLocale: string;
  exampleIndex: number;
  matrixIndex?: number;
  description?: string;
  rawMessage?: string;
  message?: string;
  originalTranslation?: string;
  values?: Record<string, unknown>;
  context?: Record<string, unknown>;
  formats?: FormatPresets;
  currency?: string;
  timeZone?: string;
  evaluatedTranslation: unknown;
}

interface CatalogDuplicateTranslationSource {
  messageKey: string;
  locale: string;
}

interface CatalogDuplicateTranslationValue {
  value: string;
  messageKeys: string[];
  sources: CatalogDuplicateTranslationSource[];
}

interface CatalogDuplicateTranslationsLocaleResult {
  locale: string;
  duplicateValues: CatalogDuplicateTranslationValue[];
}

interface CatalogDuplicateTranslationsSetResult {
  set: string | null;
  locales: CatalogDuplicateTranslationsLocaleResult[];
}

interface CatalogDuplicateTranslationsResult {
  summary: {
    sets: number;
    locales: number;
    duplicateValues: number;
    duplicateMessageKeys: number;
  };
  results: CatalogDuplicateTranslationsSetResult[];
}

interface CatalogLocaleDuplicatesFile {
  locale: string;
  summary: {
    duplicateValues: number;
    duplicateMessageKeys: number;
  };
  duplicateValues: CatalogDuplicateTranslationValue[];
}

interface CatalogSetIndex {
  set: string;
  counts: Record<CatalogEntityType, number>;
  entities: Record<CatalogEntityType, CatalogEntitySummary[]>;
}

export interface CatalogExportOptions {
  outDir?: string;
  copyAssets?: boolean;
  browserRouter?: boolean;
  dev?: boolean;
  devEditors?: CatalogDevEditor[];
  withTranslationSearch?: boolean;
  withDuplicates?: boolean;
  sets?: string[];
  devSession?: CatalogDevSession;
  preserveAssets?: boolean;
}

export interface CatalogServeOptions {
  outDir?: string;
  port?: number | string;
  browserRouter?: boolean;
  liveReload?: boolean;
  sets?: string[];
}

export interface CatalogServerHandle {
  close: () => Promise<void>;
  triggerReload: () => void;
}

interface CatalogBuildContext {
  rootDirectoryPath: string;
  repositoryRootDirectoryPath: string;
  repositorySourceRootDirectoryPath: string;
  outputDirectoryPath: string;
  dataDirectoryPath: string;
  historyIndex: CatalogHistoryIndex;
  runtime: CatalogRuntime;
  devEditors: CatalogDevEditor[];
  duplicateResultsBySet: Record<string, CatalogDuplicateTranslationsSetResult>;
  withTranslationSearch: boolean;
  withDuplicates: boolean;
  progress: CatalogProgressReporter;
  writer: CatalogJsonWriter;
}

interface CatalogDevSession {
  outputDirectoryPath: string;
  devEditors: CatalogDevEditor[];
  historyIndex: CatalogHistoryIndex;
  links: ReturnType<typeof getRepoLinks>;
  repositoryRootDirectoryPath: string;
  repositorySourceRootDirectoryPath: string;
}

interface CatalogDevRebuildRequest {
  kind: "full" | "set" | "message";
  reason: string;
  set?: string;
  messageKeys?: string[];
}

interface SourceFileInfo {
  sourcePath: string;
  absolutePath: string;
}

interface EntityPathInfo {
  type: CatalogEntityType | "test";
  key: string;
  set?: string;
}

interface CatalogHistoryIndex {
  entries: CatalogHistoryEntry[];
  bySet: Record<string, CatalogHistoryEntry[]>;
  byEntity: Record<string, CatalogHistoryEntry[]>;
  lastModifiedByEntity: Record<string, CatalogLastModified>;
}

interface StreamingGitCommit {
  commit: string;
  author: string;
  timestamp: string;
  entities: CatalogHistoryEntity[];
  seenEntityKeys: Set<string>;
}

function toPosixPath(value: string) {
  return value.split(path.sep).join("/");
}

function getRealPath(value: string) {
  try {
    return fs.realpathSync.native(value);
  } catch (_error) {
    return value;
  }
}

function encodeKey(key: string) {
  return encodeURIComponent(key);
}

async function readAll<T>(keys: string[], read: (key: string) => Promise<T>) {
  const result: Record<string, T> = {};

  for (const key of keys) {
    result[key] = await read(key);
  }

  return result;
}

function sortStrings(values: string[]) {
  return Array.from(new Set(values)).sort();
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function getLocaleDirections(locales: Record<string, Locale>) {
  return Object.fromEntries(
    Object.entries(locales).map(([localeKey, locale]) => [localeKey, locale.direction]),
  );
}

function collectAttributeKeysFromConditions(
  condition: Condition | Condition[] | "*" | undefined,
  result: Set<string>,
) {
  if (!condition || condition === "*") {
    return;
  }

  if (Array.isArray(condition)) {
    for (const item of condition) {
      collectAttributeKeysFromConditions(item, result);
    }

    return;
  }

  if (typeof condition === "string") {
    return;
  }

  if ("attribute" in condition) {
    result.add(condition.attribute);
    return;
  }

  if ("and" in condition) {
    collectAttributeKeysFromConditions(condition.and, result);
  }

  if ("or" in condition) {
    collectAttributeKeysFromConditions(condition.or, result);
  }

  if ("not" in condition) {
    collectAttributeKeysFromConditions(condition.not, result);
  }
}

function collectSegmentKeys(
  segments: GroupSegment | GroupSegment[] | "*" | undefined,
  result: Set<string>,
) {
  if (!segments || segments === "*") {
    return;
  }

  if (typeof segments === "string") {
    result.add(segments);
    return;
  }

  if (Array.isArray(segments)) {
    for (const segment of segments) {
      collectSegmentKeys(segment, result);
    }

    return;
  }

  if ("and" in segments) {
    collectSegmentKeys(segments.and, result);
  }

  if ("or" in segments) {
    collectSegmentKeys(segments.or, result);
  }

  if ("not" in segments) {
    collectSegmentKeys(segments.not, result);
  }
}

function getTargetMessageKeys(runtime: CatalogRuntime, target: Target, messageKeys: string[]) {
  return messageKeys.filter((key) => runtime.targetIncludesMessage(target, key)).sort();
}

function getHistoryEntityKey(type: CatalogEntityType | "test", key: string, set?: string) {
  return `${set || ""}\x1f${type}\x1f${key}`;
}

function toLastModified(entry: CatalogHistoryEntry): CatalogLastModified {
  return {
    commit: entry.commit,
    author: entry.author,
    timestamp: entry.timestamp,
  };
}

function getLastModified(
  historyIndex: CatalogHistoryIndex,
  type: CatalogEntityType,
  key: string,
  set?: string,
): CatalogLastModified | undefined {
  return historyIndex.lastModifiedByEntity[getHistoryEntityKey(type, key, set)];
}

function getEntitySummary(
  entity: Locale | Message | Attribute | Segment | Target,
  type: CatalogEntityType,
  key: string,
  historyIndex: CatalogHistoryIndex,
  set?: string,
  extra: Partial<CatalogEntitySummary> = {},
): CatalogEntitySummary {
  return {
    key,
    description: (entity as any).description,
    archived: (entity as any).archived,
    deprecated: (entity as any).deprecated,
    ...extra,
    lastModified: getLastModified(historyIndex, type, key, set),
    href: `entities/${type}/${encodeKey(key)}.json`,
  };
}

function getPathValue(value: unknown, segments: string[]): unknown {
  let current = value as any;

  for (const segment of segments) {
    if (!current || typeof current !== "object" || !(segment in current)) {
      return undefined;
    }

    current = current[segment];
  }

  return current;
}

function flattenObjectRows(value: unknown, prefix = ""): { path: string; value: unknown }[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return prefix ? [{ path: prefix, value }] : [];
  }

  const rows: { path: string; value: unknown }[] = [];

  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    const childPath = prefix ? `${prefix}.${key}` : key;
    const childValue = (value as Record<string, unknown>)[key];

    if (childValue && typeof childValue === "object" && !Array.isArray(childValue)) {
      rows.push(...flattenObjectRows(childValue, childPath));
    } else {
      rows.push({ path: childPath, value: childValue });
    }
  }

  return rows;
}

function resolveLocaleChain(
  localeKey: string,
  locales: Record<string, Locale>,
  field: "inheritFormatsFrom" | "inheritTranslationsFrom",
) {
  const chain: string[] = [];
  const seen = new Set<string>();
  let currentKey: string | undefined = localeKey;

  while (currentKey && !seen.has(currentKey)) {
    seen.add(currentKey);
    chain.unshift(currentKey);
    currentKey = locales[currentKey]?.[field];
  }

  return chain;
}

function getLocaleFormatSource(
  localeKey: string,
  locales: Record<string, Locale>,
  formatPath: string,
): Pick<CatalogFormatRow, "source" | "from"> {
  const pathSegments = getFormatStylePathSegments(formatPath);

  if (typeof getPathValue(locales[localeKey]?.formats, pathSegments) !== "undefined") {
    return { source: "direct" };
  }

  const chain = resolveLocaleChain(localeKey, locales, "inheritFormatsFrom").reverse();

  for (const candidate of chain) {
    if (
      candidate !== localeKey &&
      typeof getPathValue(locales[candidate]?.formats, pathSegments) !== "undefined"
    ) {
      return { source: "inherited", from: candidate };
    }
  }

  return { source: "missing" };
}

function getFormatStylePathSegments(formatPath: string): string[] {
  const pathSegments = formatPath.split(".").filter(Boolean);
  return pathSegments.length > 2 ? pathSegments.slice(0, 2) : pathSegments;
}

function getFormatRows(
  runtime: CatalogRuntime,
  localeKey: string,
  locales: Record<string, Locale>,
  target?: Target,
  computedFormats?: FormatPresets,
): CatalogFormatRow[] {
  const effectiveFormats =
    computedFormats || runtime.resolveFormats(localeKey, locales, target) || {};

  const rows = flattenObjectRows(effectiveFormats).map((row) => {
    if (
      target &&
      typeof getPathValue(target.formats?.[localeKey], getFormatStylePathSegments(row.path)) !==
        "undefined"
    ) {
      return { ...row, source: "target" as const, from: "target" };
    }

    return {
      ...row,
      ...getLocaleFormatSource(localeKey, locales, row.path),
    };
  });

  return attachFormatExamplePreviews(localeKey, effectiveFormats, rows);
}

function resolveTranslationRow(
  translations: Record<string, string> | undefined,
  localeKey: string,
  locales: Record<string, Locale>,
): CatalogTranslationRow {
  if (typeof translations?.[localeKey] !== "undefined") {
    return {
      locale: localeKey,
      value: translations[localeKey],
      source: "direct",
    };
  }

  const chain = resolveLocaleChain(localeKey, locales, "inheritTranslationsFrom").reverse();

  for (const candidate of chain) {
    if (candidate !== localeKey && typeof translations?.[candidate] !== "undefined") {
      return {
        locale: localeKey,
        value: translations[candidate],
        source: "inherited",
        from: candidate,
      };
    }
  }

  return {
    locale: localeKey,
    value: "",
    source: "missing",
  };
}

function getDuplicateSetKey(set: string | null | undefined) {
  return set || "root";
}

function toLocaleDuplicatesFile(
  localeKey: string,
  duplicatesByLocale: Record<string, CatalogDuplicateTranslationsLocaleResult>,
): CatalogLocaleDuplicatesFile {
  const duplicateValues = duplicatesByLocale[localeKey]?.duplicateValues || [];

  return {
    locale: localeKey,
    summary: {
      duplicateValues: duplicateValues.length,
      duplicateMessageKeys: duplicateValues.reduce(
        (sum, duplicate) => sum + duplicate.messageKeys.length,
        0,
      ),
    },
    duplicateValues,
  };
}

class CatalogJsonWriter {
  private readonly directories = new Map<string, Promise<void>>();

  private ensureDirectory(directoryPath: string) {
    let promise = this.directories.get(directoryPath);

    if (!promise) {
      promise = fs.promises.mkdir(directoryPath, { recursive: true }).then(() => undefined);
      this.directories.set(directoryPath, promise);
    }

    return promise;
  }

  async write(filePath: string, content: unknown) {
    await this.ensureDirectory(path.dirname(filePath));
    await fs.promises.writeFile(filePath, JSON.stringify(content, null, 2));
  }
}

async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  callback: (item: T, index: number) => Promise<void>,
) {
  let nextIndex = 0;
  const workerCount = Math.min(concurrency, items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      await callback(items[index], index);
    }
  });

  await Promise.all(workers);
}

function getEntityDirectoryPaths(config: any): Record<CatalogEntityType | "test", string> {
  return {
    locale: config.localesDirectoryPath,
    message: config.messagesDirectoryPath,
    attribute: config.attributesDirectoryPath,
    segment: config.segmentsDirectoryPath,
    target: config.targetsDirectoryPath,
    test: config.testsDirectoryPath,
  };
}

function getKeyFromRelativeEntityPath(
  relativePath: string,
  extension: string,
  namespaceCharacter: string,
) {
  const withoutExtension = relativePath.slice(0, -extension.length);
  const parts = withoutExtension.split(path.sep);
  const last = parts[parts.length - 1];

  if (last.endsWith(".spec")) {
    parts[parts.length - 1] = last.slice(0, -".spec".length);
  }

  return parts.join(namespaceCharacter);
}

function getEntityInfoFromRelativePath(
  rootDirectoryPath: string,
  projectConfig: any,
  relativePath: string,
): EntityPathInfo | undefined {
  const absolutePath = path.join(rootDirectoryPath, relativePath);
  const extension = `.${(projectConfig.parser as any).extension}`;
  const configs = projectConfig.sets
    ? fs.existsSync(projectConfig.setsDirectoryPath)
      ? fs
          .readdirSync(projectConfig.setsDirectoryPath, { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => ({
            set: entry.name,
            directories: getEntityDirectoryPaths({
              ...projectConfig,
              localesDirectoryPath: path.join(
                projectConfig.setsDirectoryPath,
                entry.name,
                "locales",
              ),
              messagesDirectoryPath: path.join(
                projectConfig.setsDirectoryPath,
                entry.name,
                "messages",
              ),
              attributesDirectoryPath: path.join(
                projectConfig.setsDirectoryPath,
                entry.name,
                "attributes",
              ),
              segmentsDirectoryPath: path.join(
                projectConfig.setsDirectoryPath,
                entry.name,
                "segments",
              ),
              targetsDirectoryPath: path.join(
                projectConfig.setsDirectoryPath,
                entry.name,
                "targets",
              ),
              testsDirectoryPath: path.join(projectConfig.setsDirectoryPath, entry.name, "tests"),
            }),
          }))
      : []
    : [{ set: undefined, directories: getEntityDirectoryPaths(projectConfig) }];

  for (const config of configs) {
    for (const type of Object.keys(config.directories) as (CatalogEntityType | "test")[]) {
      const directoryPath = config.directories[type];

      if (
        absolutePath === directoryPath ||
        !absolutePath.startsWith(`${directoryPath}${path.sep}`) ||
        !absolutePath.endsWith(extension)
      ) {
        continue;
      }

      return {
        type,
        key: getKeyFromRelativeEntityPath(
          path.relative(directoryPath, absolutePath),
          extension,
          projectConfig.namespaceCharacter,
        ),
        set: config.set,
      };
    }
  }

  return undefined;
}

function runGit(rootDirectoryPath: string, args: string[]) {
  return childProcess.execFileSync("git", ["-C", rootDirectoryPath, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
}

function getCatalogHistoryPathPatterns(rootDirectoryPath: string, projectConfig: any) {
  return projectConfig.sets
    ? [path.relative(rootDirectoryPath, projectConfig.setsDirectoryPath)]
    : [
        path.relative(rootDirectoryPath, projectConfig.localesDirectoryPath),
        path.relative(rootDirectoryPath, projectConfig.messagesDirectoryPath),
        path.relative(rootDirectoryPath, projectConfig.attributesDirectoryPath),
        path.relative(rootDirectoryPath, projectConfig.segmentsDirectoryPath),
        path.relative(rootDirectoryPath, projectConfig.targetsDirectoryPath),
        path.relative(rootDirectoryPath, projectConfig.testsDirectoryPath),
      ];
}

function createEmptyHistoryIndex(): CatalogHistoryIndex {
  return {
    entries: [],
    bySet: {},
    byEntity: {},
    lastModifiedByEntity: {},
  };
}

function addHistoryIndexEntry(
  target: Record<string, CatalogHistoryEntry[]>,
  key: string,
  entry: CatalogHistoryEntry,
) {
  if (!target[key]) {
    target[key] = [];
  }

  target[key].push(entry);
}

function toEntityHistoryEntry(
  entry: CatalogHistoryEntry,
  entity: CatalogHistoryEntity,
): CatalogHistoryEntry {
  return {
    commit: entry.commit,
    author: entry.author,
    timestamp: entry.timestamp,
    entities: [entity],
  };
}

function buildCatalogHistoryIndex(entries: CatalogHistoryEntry[]): CatalogHistoryIndex {
  const index = createEmptyHistoryIndex();
  index.entries = entries;

  for (const entry of entries) {
    const seenSets = new Set<string>();

    for (const entity of entry.entities) {
      if (entity.type === "test") {
        continue;
      }

      const entityKey = getHistoryEntityKey(entity.type, entity.key, entity.set);
      addHistoryIndexEntry(index.byEntity, entityKey, toEntityHistoryEntry(entry, entity));

      if (!index.lastModifiedByEntity[entityKey]) {
        index.lastModifiedByEntity[entityKey] = toLastModified(entry);
      }

      if (entity.set && !seenSets.has(entity.set)) {
        seenSets.add(entity.set);
        addHistoryIndexEntry(index.bySet, entity.set, entry);
      }
    }
  }

  return index;
}

function appendHistoryEntry(
  history: CatalogHistoryEntry[],
  current: StreamingGitCommit | undefined,
) {
  if (!current || current.entities.length === 0) {
    return;
  }

  history.push({
    commit: current.commit,
    author: current.author,
    timestamp: current.timestamp,
    entities: current.entities,
  });
}

function addHistoryEntity(current: StreamingGitCommit, entity: CatalogHistoryEntity) {
  if (entity.type === "test") {
    return;
  }

  const entityKey = getHistoryEntityKey(entity.type, entity.key, entity.set);

  if (current.seenEntityKeys.has(entityKey)) {
    return;
  }

  current.seenEntityKeys.add(entityKey);
  current.entities.push(entity);
}

async function streamCatalogGitHistory(
  rootDirectoryPath: string,
  projectConfig: any,
): Promise<CatalogHistoryEntry[]> {
  const pathPatterns = getCatalogHistoryPathPatterns(rootDirectoryPath, projectConfig);
  const args = [
    "-C",
    rootDirectoryPath,
    "log",
    "--name-only",
    "--pretty=format:%x1e%h%x1f%an%x1f%aI",
    "--relative",
    "--no-merges",
    "--",
    ...pathPatterns,
  ];

  return new Promise((resolve, reject) => {
    let current: StreamingGitCommit | undefined;
    let buffer = "";
    const history: CatalogHistoryEntry[] = [];
    const git = childProcess.spawn("git", args, {
      stdio: ["ignore", "pipe", "ignore"],
    });

    function processLine(line: string) {
      if (!line) {
        return;
      }

      if (line.startsWith("\x1e")) {
        appendHistoryEntry(history, current);

        const [commit, author, timestamp] = line.slice(1).split("\x1f");
        current =
          commit && author && timestamp
            ? {
                commit,
                author,
                timestamp,
                entities: [],
                seenEntityKeys: new Set(),
              }
            : undefined;
        return;
      }

      if (!current) {
        return;
      }

      const entity = getEntityInfoFromRelativePath(rootDirectoryPath, projectConfig, line);

      if (entity) {
        addHistoryEntity(current, entity);
      }
    }

    git.stdout.setEncoding("utf8");
    git.stdout.on("data", (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";

      for (const line of lines) {
        processLine(line);
      }
    });
    git.on("error", reject);
    git.on("close", (code) => {
      if (buffer) {
        processLine(buffer);
      }

      appendHistoryEntry(history, current);

      if (code === 0) {
        resolve(history);
        return;
      }

      reject(new Error(`git log exited with code ${code}`));
    });
  });
}

function isExecutableFile(filePath: string) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      return false;
    }

    if (process.platform === "win32") {
      return true;
    }

    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch (_error) {
    return false;
  }
}

function hasCommandInPath(command: string) {
  const pathEntries = (process.env.PATH || "").split(path.delimiter).filter(Boolean);
  const extensions =
    process.platform === "win32"
      ? (process.env.PATHEXT || ".EXE;.CMD;.BAT;.COM").split(";").filter(Boolean)
      : [""];

  return pathEntries.some((entry) =>
    extensions.some((extension) => isExecutableFile(path.join(entry, `${command}${extension}`))),
  );
}

function hasKnownEditorInstall(editor: CatalogDevEditorId) {
  if (hasCommandInPath(editor === "cursor" ? "cursor" : "code")) {
    return true;
  }

  if (process.platform === "darwin") {
    const appName = editor === "cursor" ? "Cursor.app" : "Visual Studio Code.app";

    return [
      path.join("/Applications", appName),
      path.join(process.env.HOME || "", "Applications", appName),
    ].some((appPath) => fs.existsSync(appPath));
  }

  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA || "";
    const programFiles = process.env.ProgramFiles || "";
    const programFilesX86 = process.env["ProgramFiles(x86)"] || "";
    const candidates =
      editor === "cursor"
        ? [
            path.join(localAppData, "Programs", "Cursor", "Cursor.exe"),
            path.join(programFiles, "Cursor", "Cursor.exe"),
            path.join(programFilesX86, "Cursor", "Cursor.exe"),
          ]
        : [
            path.join(localAppData, "Programs", "Microsoft VS Code", "Code.exe"),
            path.join(programFiles, "Microsoft VS Code", "Code.exe"),
            path.join(programFilesX86, "Microsoft VS Code", "Code.exe"),
          ];

    return candidates.some((candidate) => fs.existsSync(candidate));
  }

  return false;
}

function detectDevEditors(): CatalogDevEditor[] {
  const editors: CatalogDevEditor[] = [];

  if (hasKnownEditorInstall("cursor")) {
    editors.push({ id: "cursor", label: "Cursor", icon: "cursor" });
  }

  if (hasKnownEditorInstall("vscode")) {
    editors.push({ id: "vscode", label: "VS Code", icon: "vscode" });
  }

  return editors;
}

async function getGitHistoryIndex(
  rootDirectoryPath: string,
  projectConfig: any,
): Promise<CatalogHistoryIndex> {
  try {
    return buildCatalogHistoryIndex(
      await streamCatalogGitHistory(rootDirectoryPath, projectConfig),
    );
  } catch (_error) {
    return createEmptyHistoryIndex();
  }
}

function getCurrentBranch(rootDirectoryPath: string) {
  try {
    return runGit(rootDirectoryPath, ["symbolic-ref", "--short", "HEAD"]).trim() || "HEAD";
  } catch (_error) {
    return "HEAD";
  }
}

function getRepositoryRootDirectoryPath(rootDirectoryPath: string) {
  try {
    return (
      getRealPath(runGit(rootDirectoryPath, ["rev-parse", "--show-toplevel"]).trim()) ||
      getRealPath(rootDirectoryPath)
    );
  } catch (_error) {
    return getRealPath(rootDirectoryPath);
  }
}

function getRepositorySourceRootDirectoryPath(rootDirectoryPath: string) {
  try {
    const gitRootDirectoryPath =
      runGit(rootDirectoryPath, ["rev-parse", "--show-toplevel"]).trim() || rootDirectoryPath;
    const realRootDirectoryPath = getRealPath(rootDirectoryPath);

    if (realRootDirectoryPath !== rootDirectoryPath) {
      return path.resolve(
        rootDirectoryPath,
        path.relative(realRootDirectoryPath, gitRootDirectoryPath),
      );
    }

    return gitRootDirectoryPath;
  } catch (_error) {
    return rootDirectoryPath;
  }
}

function getOwnerAndRepoFromGitRemote(origin: string, host: string) {
  const escapedHost = host.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  const match = origin.match(new RegExp(`${escapedHost}[:/]([^/]+)/(.+?)(?:\\.git)?$`));

  if (!match) {
    return undefined;
  }

  return {
    owner: match[1],
    repo: match[2],
  };
}

function getRepoLinks(rootDirectoryPath: string) {
  try {
    const origin = runGit(rootDirectoryPath, ["config", "--get", "remote.origin.url"]).trim();
    const branch = encodeURI(getCurrentBranch(rootDirectoryPath));
    const providers: Record<
      CatalogGitProvider,
      {
        host: string;
        repository: (owner: string, repo: string) => string;
        source: (owner: string, repo: string) => string;
        commit: (owner: string, repo: string) => string;
      }
    > = {
      github: {
        host: "github.com",
        repository: (owner, repo) => `https://github.com/${owner}/${repo}`,
        source: (owner, repo) => `https://github.com/${owner}/${repo}/blob/${branch}/{{path}}`,
        commit: (owner, repo) => `https://github.com/${owner}/${repo}/commit/{{hash}}`,
      },
      gitlab: {
        host: "gitlab.com",
        repository: (owner, repo) => `https://gitlab.com/${owner}/${repo}`,
        source: (owner, repo) => `https://gitlab.com/${owner}/${repo}/-/blob/${branch}/{{path}}`,
        commit: (owner, repo) => `https://gitlab.com/${owner}/${repo}/-/commit/{{hash}}`,
      },
      bitbucket: {
        host: "bitbucket.org",
        repository: (owner, repo) => `https://bitbucket.org/${owner}/${repo}`,
        source: (owner, repo) => `https://bitbucket.org/${owner}/${repo}/src/${branch}/{{path}}`,
        commit: (owner, repo) => `https://bitbucket.org/${owner}/${repo}/commits/{{hash}}`,
      },
    };

    for (const provider of Object.keys(providers) as CatalogGitProvider[]) {
      const config = providers[provider];
      const details = getOwnerAndRepoFromGitRemote(origin, config.host);

      if (details) {
        return {
          provider,
          repository: config.repository(details.owner, details.repo),
          source: config.source(details.owner, details.repo),
          commit: config.commit(details.owner, details.repo),
        };
      }
    }
  } catch (_error) {
    return undefined;
  }
}

function chunkHistory(history: CatalogHistoryEntry[], pageSize = CATALOG_HISTORY_PAGE_SIZE) {
  const pages: CatalogHistoryEntry[][] = [];

  for (let index = 0; index < history.length; index += pageSize) {
    pages.push(history.slice(index, index + pageSize));
  }

  return pages.length > 0 ? pages : [[]];
}

async function writeHistoryPages(
  writer: CatalogJsonWriter,
  directoryPath: string,
  history: CatalogHistoryEntry[],
  options: { skipEmpty?: boolean } = {},
) {
  if (options.skipEmpty && history.length === 0) {
    return 1;
  }

  const pages = chunkHistory(history);

  for (let index = 0; index < pages.length; index++) {
    await writer.write(path.join(directoryPath, `page-${index + 1}.json`), {
      page: index + 1,
      pageSize: CATALOG_HISTORY_PAGE_SIZE,
      totalPages: pages.length,
      entries: pages[index],
    });
  }

  return 0;
}

function getHistoryForEntity(
  historyIndex: CatalogHistoryIndex,
  type: CatalogEntityType,
  key: string,
  set?: string,
) {
  return historyIndex.byEntity[getHistoryEntityKey(type, key, set)] || [];
}

function getSourceFileInfo(
  repositorySourceRootDirectoryPath: string,
  rootDirectoryPath: string,
  projectConfig: any,
  type: CatalogEntityType,
  key: string,
  options: { resolveAbsolutePath?: boolean } = {},
): SourceFileInfo {
  const directoryByType: Record<CatalogEntityType, string> = {
    locale: projectConfig.localesDirectoryPath,
    message: projectConfig.messagesDirectoryPath,
    attribute: projectConfig.attributesDirectoryPath,
    segment: projectConfig.segmentsDirectoryPath,
    target: projectConfig.targetsDirectoryPath,
  };
  const extension = `.${(projectConfig.parser as any).extension}`;
  const filePath = path.resolve(
    path.resolve(
      rootDirectoryPath,
      directoryByType[type],
      ...key.split(projectConfig.namespaceCharacter),
    ) + extension,
  );
  const absolutePath = options.resolveAbsolutePath ? getRealPath(filePath) : filePath;

  return {
    sourcePath: toPosixPath(path.relative(repositorySourceRootDirectoryPath, filePath)),
    absolutePath,
  };
}

function encodeEditorPath(filePath: string) {
  return encodeURI(filePath.split(path.sep).join("/")).replace(/#/g, "%23").replace(/\?/g, "%3F");
}

function getEditorUri(editor: CatalogDevEditorId, filePath: string) {
  return `${editor === "cursor" ? "cursor" : "vscode"}://file/${encodeEditorPath(filePath)}`;
}

function getEditorLinks(editors: CatalogDevEditor[], sourceFileInfo: SourceFileInfo) {
  if (editors.length === 0) {
    return undefined;
  }

  return Object.fromEntries(
    editors.map((editor) => [editor.id, getEditorUri(editor.id, sourceFileInfo.absolutePath)]),
  );
}

async function buildSetCatalog(
  context: CatalogBuildContext,
  set: string,
  projectConfig: any,
  datasource: any,
  outputRelativeDirectory: string,
) {
  const outputDirectoryPath = path.join(context.dataDirectoryPath, outputRelativeDirectory);
  const setStartedAt = context.progress.setStart(set);
  const entitiesStartedAt = context.progress.step("Processing entities");
  const [localeKeys, messageKeys, attributeKeys, segmentKeys, targetKeys, testKeys] =
    (await Promise.all([
      datasource.listLocales(),
      datasource.listMessages(),
      datasource.listAttributes(),
      datasource.listSegments(),
      datasource.listTargets(),
      datasource.listTests(),
    ])) as [string[], string[], string[], string[], string[], string[]];
  const [locales, messages, attributes, segments, targets, tests] = await Promise.all([
    readAll<Locale>(localeKeys, (key) => datasource.readLocale(key)),
    readAll<Message>(messageKeys, (key) => datasource.readMessage(key)),
    readAll<Attribute>(attributeKeys, (key) => datasource.readAttribute(key)),
    readAll<Segment>(segmentKeys, (key) => datasource.readSegment(key)),
    readAll<Target>(targetKeys, (key) => datasource.readTarget(key)),
    readAll<Test>(testKeys, (key) => datasource.readTest(key)),
  ]);
  context.progress.done(
    entitiesStartedAt,
    `(${[
      pluralize(localeKeys.length, "locale"),
      pluralize(messageKeys.length, "message"),
      pluralize(attributeKeys.length, "attribute"),
      pluralize(segmentKeys.length, "segment"),
      pluralize(targetKeys.length, "target"),
    ].join(", ")})`,
  );

  const relationshipsStartedAt = context.progress.step("Mapping relationships");
  const messageTargets: Record<string, string[]> = {};
  const targetMessages: Record<string, string[]> = {};
  const localeTargets: Record<string, Set<string>> = {};
  const attributeTargets: Record<string, Set<string>> = {};
  const segmentTargets: Record<string, Set<string>> = {};
  const attributesUsedInSegments: Record<string, Set<string>> = {};
  const attributesUsedInMessages: Record<string, Set<string>> = {};
  const segmentsUsedInMessages: Record<string, Set<string>> = {};
  const testsByEntity: Record<string, Array<Record<string, unknown>>> = {};

  for (const testKey of testKeys) {
    const test = tests[testKey];
    const entityType =
      "message" in test
        ? "message"
        : "segment" in test
          ? "segment"
          : "locale" in test
            ? "locale"
            : "target" in test
              ? "target"
              : undefined;
    if (!entityType || !Array.isArray((test as any).assertions)) continue;
    const entityKey = (test as any)[entityType];
    const relationshipKey = `${entityType}:${entityKey}`;
    if (!testsByEntity[relationshipKey]) testsByEntity[relationshipKey] = [];
    testsByEntity[relationshipKey].push({
      key: testKey,
      entityType,
      entityKey,
      assertions: context.runtime.expandTestAssertions(test),
    });
  }

  for (const targetKey of targetKeys) {
    targetMessages[targetKey] = getTargetMessageKeys(
      context.runtime,
      targets[targetKey],
      messageKeys,
    );
    const targetLocaleKeys = targets[targetKey].locales?.length
      ? targets[targetKey].locales
      : localeKeys;

    for (const localeKey of targetLocaleKeys) {
      if (!localeTargets[localeKey]) {
        localeTargets[localeKey] = new Set();
      }

      localeTargets[localeKey].add(targetKey);
    }

    for (const messageKey of targetMessages[targetKey]) {
      if (!messageTargets[messageKey]) {
        messageTargets[messageKey] = [];
      }

      messageTargets[messageKey].push(targetKey);
    }
  }

  for (const segmentKey of segmentKeys) {
    const usedAttributes = new Set<string>();
    collectAttributeKeysFromConditions(segments[segmentKey].conditions, usedAttributes);

    for (const attributeKey of Array.from(usedAttributes)) {
      if (!attributesUsedInSegments[attributeKey]) {
        attributesUsedInSegments[attributeKey] = new Set();
      }

      attributesUsedInSegments[attributeKey].add(segmentKey);
    }
  }

  for (const messageKey of messageKeys) {
    const message = messages[messageKey];
    const targetsForMessage = messageTargets[messageKey] || [];

    for (const override of message.overrides || []) {
      const usedAttributes = new Set<string>();
      const usedSegments = new Set<string>();
      collectAttributeKeysFromConditions(override.conditions, usedAttributes);
      collectSegmentKeys(override.segments, usedSegments);

      for (const attributeKey of Array.from(usedAttributes)) {
        if (!attributesUsedInMessages[attributeKey]) {
          attributesUsedInMessages[attributeKey] = new Set();
        }

        attributesUsedInMessages[attributeKey].add(messageKey);

        for (const targetKey of targetsForMessage) {
          if (!attributeTargets[attributeKey]) {
            attributeTargets[attributeKey] = new Set();
          }

          attributeTargets[attributeKey].add(targetKey);
        }
      }

      for (const segmentKey of Array.from(usedSegments)) {
        if (!segmentsUsedInMessages[segmentKey]) {
          segmentsUsedInMessages[segmentKey] = new Set();
        }

        segmentsUsedInMessages[segmentKey].add(messageKey);

        for (const targetKey of targetsForMessage) {
          if (!segmentTargets[segmentKey]) {
            segmentTargets[segmentKey] = new Set();
          }

          segmentTargets[segmentKey].add(targetKey);
        }
      }
    }
  }

  for (const attributeKey of Object.keys(attributesUsedInSegments)) {
    for (const segmentKey of Array.from(attributesUsedInSegments[attributeKey])) {
      for (const targetKey of Array.from(segmentTargets[segmentKey] || [])) {
        if (!attributeTargets[attributeKey]) {
          attributeTargets[attributeKey] = new Set();
        }

        attributeTargets[attributeKey].add(targetKey);
      }
    }
  }
  context.progress.done(relationshipsStartedAt);

  const history = set ? context.historyIndex.bySet[set] || [] : context.historyIndex.entries;
  const localeDirections = getLocaleDirections(locales);
  const duplicateResult = context.duplicateResultsBySet[getDuplicateSetKey(set)] || {
    set: set || null,
    locales: [],
  };
  const duplicatesByLocale = Object.fromEntries(
    duplicateResult.locales.map((entry) => [entry.locale, entry]),
  );
  const index: CatalogSetIndex = {
    set,
    counts: {
      locale: localeKeys.length,
      message: messageKeys.length,
      attribute: attributeKeys.length,
      segment: segmentKeys.length,
      target: targetKeys.length,
    },
    entities: {
      locale: [],
      message: [],
      attribute: [],
      segment: [],
      target: [],
    },
  };

  const historyStartedAt = context.progress.step("Writing history pages");
  await writeHistoryPages(context.writer, path.join(outputDirectoryPath, "history"), history);
  context.progress.done(historyStartedAt, `(${pluralize(history.length, "entry", "entries")})`);

  const examplesStartedAt = context.progress.step("Evaluating examples");
  const evaluatedMessageExamplesByKey = (
    await context.runtime.resolveExamples(projectConfig, datasource, {
      onlyMessages: true,
    })
  ).messages.reduce<Record<string, CatalogEvaluatedMessageExample[]>>((accumulator, example) => {
    if (!accumulator[example.message]) {
      accumulator[example.message] = [];
    }

    accumulator[example.message].push(example);
    return accumulator;
  }, {});

  const evaluatedLocaleExamplesByKey = (
    await context.runtime.resolveExamples(projectConfig, datasource, {
      onlyLocales: true,
    })
  ).locales.reduce<Record<string, CatalogEvaluatedLocaleExample[]>>((accumulator, example) => {
    const originalTranslation = example.message
      ? resolveTranslationRow(messages[example.message]?.translations, example.locale, locales)
          .value
      : undefined;

    if (!accumulator[example.locale]) {
      accumulator[example.locale] = [];
    }

    accumulator[example.locale].push({
      ...example,
      originalTranslation: originalTranslation || undefined,
    });
    return accumulator;
  }, {});
  context.progress.done(
    examplesStartedAt,
    `(${pluralize(
      Object.values(evaluatedMessageExamplesByKey).reduce(
        (total, items) => total + items.length,
        0,
      ),
      "message example",
    )}, ${pluralize(
      Object.values(evaluatedLocaleExamplesByKey).reduce((total, items) => total + items.length, 0),
      "locale example",
    )})`,
  );

  const localesStartedAt = context.progress.step("Writing locales");
  let skippedEmptyHistoryCount = 0;
  await mapWithConcurrency(localeKeys, 32, async (localeKey) => {
    const locale = locales[localeKey];
    const sourceFileInfo = getSourceFileInfo(
      context.repositorySourceRootDirectoryPath,
      context.rootDirectoryPath,
      projectConfig,
      "locale",
      localeKey,
      { resolveAbsolutePath: context.devEditors.length > 0 },
    );
    const detail = {
      type: "locale",
      key: localeKey,
      entity: locale,
      sourcePath: sourceFileInfo.sourcePath,
      editLinks: getEditorLinks(context.devEditors, sourceFileInfo),
      baseFormats: locale.formats || {},
      computedFormats: context.runtime.resolveFormats(localeKey, locales),
      formatRows: getFormatRows(context.runtime, localeKey, locales),
      evaluatedExamples: evaluatedLocaleExamplesByKey[localeKey] || [],
      targetFormats: Object.fromEntries(
        targetKeys.map((targetKey) => [
          targetKey,
          context.runtime.resolveFormats(localeKey, locales, targets[targetKey]),
        ]),
      ),
      targets: sortStrings(Array.from(localeTargets[localeKey] || [])),
      tests: testsByEntity[`locale:${localeKey}`] || [],
      lastModified: getLastModified(context.historyIndex, "locale", localeKey, set || undefined),
    };

    index.entities.locale.push(
      getEntitySummary(locale, "locale", localeKey, context.historyIndex, set || undefined, {
        targets: sortStrings(Array.from(localeTargets[localeKey] || [])),
      }),
    );
    await context.writer.write(
      path.join(outputDirectoryPath, "entities", "locale", `${encodeKey(localeKey)}.json`),
      detail,
    );
    skippedEmptyHistoryCount += await writeHistoryPages(
      context.writer,
      path.join(outputDirectoryPath, "history", "locale", encodeKey(localeKey)),
      getHistoryForEntity(context.historyIndex, "locale", localeKey, set || undefined),
      { skipEmpty: true },
    );
  });
  context.progress.done(localesStartedAt, `(${pluralize(localeKeys.length, "locale")})`);

  if (context.withDuplicates) {
    const duplicatesStartedAt = context.progress.step("Writing duplicate reports");

    await mapWithConcurrency(localeKeys, 32, async (localeKey) => {
      await context.writer.write(
        path.join(outputDirectoryPath, "duplicates", "locales", `${encodeKey(localeKey)}.json`),
        toLocaleDuplicatesFile(localeKey, duplicatesByLocale),
      );
    });

    context.progress.done(duplicatesStartedAt, `(${pluralize(localeKeys.length, "locale")})`);
  }

  // translationShards[3charPrefix][messageKey] = Set<lowercased value>
  const translationShards: Record<string, Record<string, Set<string>>> = {};

  function addToTranslationShard(msgKey: string, value: string) {
    if (!value || value.length < 3) return;
    const lower = value.toLowerCase();
    const seenSubs = new Set<string>();
    for (let i = 0; i <= lower.length - 3; i++) {
      const sub = lower.slice(i, i + 3);
      if (seenSubs.has(sub)) continue;
      seenSubs.add(sub);
      const filename = Buffer.from(sub, "utf8").toString("hex");
      if (!translationShards[filename]) translationShards[filename] = {};
      if (!translationShards[filename][msgKey]) translationShards[filename][msgKey] = new Set();
      translationShards[filename][msgKey].add(lower);
    }
  }

  const messagesStartedAt = context.progress.step("Writing messages");
  const messageDetailsStartedAt = context.progress.substep("Writing message details");
  let skippedEmptyMessageHistoryCount = 0;
  await mapWithConcurrency(messageKeys, 32, async (messageKey) => {
    const message = messages[messageKey];
    const overrides = (message.overrides || []).map((override: Override) => {
      const attributes = new Set<string>();
      const overrideSegments = new Set<string>();
      collectAttributeKeysFromConditions(override.conditions, attributes);
      collectSegmentKeys(override.segments, overrideSegments);

      return {
        ...override,
        usedAttributes: sortStrings(Array.from(attributes)),
        usedSegments: sortStrings(Array.from(overrideSegments)),
      };
    });
    const sourceFileInfo = getSourceFileInfo(
      context.repositorySourceRootDirectoryPath,
      context.rootDirectoryPath,
      projectConfig,
      "message",
      messageKey,
      { resolveAbsolutePath: context.devEditors.length > 0 },
    );
    const detail = {
      type: "message",
      key: messageKey,
      entity: { ...message, overrides },
      sourcePath: sourceFileInfo.sourcePath,
      editLinks: getEditorLinks(context.devEditors, sourceFileInfo),
      targets: sortStrings(messageTargets[messageKey] || []),
      localeKeys,
      localeDirections,
      translations: localeKeys.map((localeKey) =>
        resolveTranslationRow(message.translations, localeKey, locales),
      ),
      evaluatedExamples: evaluatedMessageExamplesByKey[messageKey] || [],
      tests: testsByEntity[`message:${messageKey}`] || [],
      overrideTranslations: overrides.map((override) => ({
        key: override.key,
        rows: localeKeys.map((localeKey) =>
          resolveTranslationRow(override.translations, localeKey, locales),
        ),
      })),
      lastModified: getLastModified(context.historyIndex, "message", messageKey, set || undefined),
    };

    const directLocales = localeKeys.filter(
      (lk) => message.translations && typeof message.translations[lk] === "string",
    );
    const overrideLocalesSet = new Set<string>();
    for (const override of overrides) {
      for (const lk of Object.keys(override.translations || {})) {
        overrideLocalesSet.add(lk);
      }
    }
    const overrideLocalesList = sortStrings(Array.from(overrideLocalesSet));

    index.entities.message.push(
      getEntitySummary(message, "message", messageKey, context.historyIndex, set || undefined, {
        targets: sortStrings(messageTargets[messageKey] || []),
        ...(overrides.length > 0 ? { overrideCount: overrides.length } : {}),
        ...(directLocales.length > 0 ? { locales: sortStrings(directLocales) } : {}),
        ...(overrideLocalesList.length > 0 ? { overrideLocales: overrideLocalesList } : {}),
      }),
    );
    await context.writer.write(
      path.join(outputDirectoryPath, "entities", "message", `${encodeKey(messageKey)}.json`),
      detail,
    );
  });
  context.progress.done(messageDetailsStartedAt, `(${pluralize(messageKeys.length, "message")})`);

  const messageHistoryStartedAt = context.progress.substep("Writing message history pages");
  await mapWithConcurrency(messageKeys, 32, async (messageKey) => {
    const skippedHistory = await writeHistoryPages(
      context.writer,
      path.join(outputDirectoryPath, "history", "message", encodeKey(messageKey)),
      getHistoryForEntity(context.historyIndex, "message", messageKey, set || undefined),
      { skipEmpty: true },
    );
    skippedEmptyMessageHistoryCount += skippedHistory;
    skippedEmptyHistoryCount += skippedHistory;
  });
  context.progress.done(
    messageHistoryStartedAt,
    `(${pluralize(messageKeys.length, "message")}, ${pluralize(
      skippedEmptyMessageHistoryCount,
      "empty history",
      "empty histories",
    )} skipped)`,
  );
  context.progress.done(
    messagesStartedAt,
    `(${pluralize(messageKeys.length, "message")}, ${pluralize(
      skippedEmptyMessageHistoryCount,
      "empty history",
      "empty histories",
    )} skipped)`,
  );

  if (context.withTranslationSearch) {
    const translationSearchStartedAt = context.progress.step("Building translation search shards");

    for (const messageKey of messageKeys) {
      const message = messages[messageKey];

      for (const localeKey of localeKeys) {
        const row = resolveTranslationRow(message.translations, localeKey, locales);
        if (row.source !== "missing" && row.value) {
          addToTranslationShard(messageKey, row.value);
        }

        for (const override of message.overrides || []) {
          const overrideRow = resolveTranslationRow(override.translations, localeKey, locales);
          if (overrideRow.source !== "missing" && overrideRow.value) {
            addToTranslationShard(messageKey, overrideRow.value);
          }
        }
      }
    }

    for (const [prefix, messageMap] of Object.entries(translationShards)) {
      const shardData: Record<string, string[]> = {};
      for (const [msgKey, valueSet] of Object.entries(messageMap)) {
        shardData[msgKey] = Array.from(valueSet);
      }
      await context.writer.write(
        path.join(outputDirectoryPath, "translations", `${prefix}.json`),
        shardData,
      );
    }
    context.progress.done(
      translationSearchStartedAt,
      `(${pluralize(Object.keys(translationShards).length, "shard")})`,
    );
  }

  const attributesStartedAt = context.progress.step("Writing attributes");
  await mapWithConcurrency(attributeKeys, 32, async (attributeKey) => {
    const attribute = attributes[attributeKey];
    const sourceFileInfo = getSourceFileInfo(
      context.repositorySourceRootDirectoryPath,
      context.rootDirectoryPath,
      projectConfig,
      "attribute",
      attributeKey,
      { resolveAbsolutePath: context.devEditors.length > 0 },
    );
    const detail = {
      type: "attribute",
      key: attributeKey,
      entity: attribute,
      sourcePath: sourceFileInfo.sourcePath,
      editLinks: getEditorLinks(context.devEditors, sourceFileInfo),
      usage: {
        segments: sortStrings(Array.from(attributesUsedInSegments[attributeKey] || [])),
        messages: sortStrings(Array.from(attributesUsedInMessages[attributeKey] || [])),
      },
      targets: sortStrings(Array.from(attributeTargets[attributeKey] || [])),
      lastModified: getLastModified(
        context.historyIndex,
        "attribute",
        attributeKey,
        set || undefined,
      ),
    };

    index.entities.attribute.push(
      getEntitySummary(
        attribute,
        "attribute",
        attributeKey,
        context.historyIndex,
        set || undefined,
        {
          targets: sortStrings(Array.from(attributeTargets[attributeKey] || [])),
          usedInSegmentCount: (attributesUsedInSegments[attributeKey] || new Set()).size,
          usedInMessageCount: (attributesUsedInMessages[attributeKey] || new Set()).size,
        },
      ),
    );
    await context.writer.write(
      path.join(outputDirectoryPath, "entities", "attribute", `${encodeKey(attributeKey)}.json`),
      detail,
    );
    skippedEmptyHistoryCount += await writeHistoryPages(
      context.writer,
      path.join(outputDirectoryPath, "history", "attribute", encodeKey(attributeKey)),
      getHistoryForEntity(context.historyIndex, "attribute", attributeKey, set || undefined),
      { skipEmpty: true },
    );
  });
  context.progress.done(attributesStartedAt, `(${pluralize(attributeKeys.length, "attribute")})`);

  const segmentsStartedAt = context.progress.step("Writing segments");
  await mapWithConcurrency(segmentKeys, 32, async (segmentKey) => {
    const segment = segments[segmentKey];
    const usedAttributes = new Set<string>();
    collectAttributeKeysFromConditions(segment.conditions, usedAttributes);
    const sourceFileInfo = getSourceFileInfo(
      context.repositorySourceRootDirectoryPath,
      context.rootDirectoryPath,
      projectConfig,
      "segment",
      segmentKey,
      { resolveAbsolutePath: context.devEditors.length > 0 },
    );
    const detail = {
      type: "segment",
      key: segmentKey,
      entity: segment,
      sourcePath: sourceFileInfo.sourcePath,
      editLinks: getEditorLinks(context.devEditors, sourceFileInfo),
      usage: {
        attributes: sortStrings(Array.from(usedAttributes)),
        messages: sortStrings(Array.from(segmentsUsedInMessages[segmentKey] || [])),
      },
      targets: sortStrings(Array.from(segmentTargets[segmentKey] || [])),
      tests: testsByEntity[`segment:${segmentKey}`] || [],
      lastModified: getLastModified(context.historyIndex, "segment", segmentKey, set || undefined),
    };

    index.entities.segment.push(
      getEntitySummary(segment, "segment", segmentKey, context.historyIndex, set || undefined, {
        targets: sortStrings(Array.from(segmentTargets[segmentKey] || [])),
        usedInMessageCount: (segmentsUsedInMessages[segmentKey] || new Set()).size,
      }),
    );
    await context.writer.write(
      path.join(outputDirectoryPath, "entities", "segment", `${encodeKey(segmentKey)}.json`),
      detail,
    );
    skippedEmptyHistoryCount += await writeHistoryPages(
      context.writer,
      path.join(outputDirectoryPath, "history", "segment", encodeKey(segmentKey)),
      getHistoryForEntity(context.historyIndex, "segment", segmentKey, set || undefined),
      { skipEmpty: true },
    );
  });
  context.progress.done(segmentsStartedAt, `(${pluralize(segmentKeys.length, "segment")})`);

  const targetsStartedAt = context.progress.step("Writing targets");
  await mapWithConcurrency(targetKeys, 32, async (targetKey) => {
    const target = targets[targetKey];
    const targetLocaleKeys = target.locales?.length ? target.locales : localeKeys;
    const formatsByLocale: Record<string, FormatPresets | undefined> = {};
    const formatRowsByLocale: Record<string, CatalogFormatRow[]> = {};

    for (const localeKey of targetLocaleKeys) {
      const datafileFormats = target.includeOnlyUsedFormats
        ? (
            await context.runtime.buildDatafile(
              projectConfig,
              datasource,
              targetKey,
              localeKey,
              "__catalog__",
            )
          ).formats
        : undefined;

      formatsByLocale[localeKey] = target.includeOnlyUsedFormats
        ? datafileFormats
        : context.runtime.resolveFormats(localeKey, locales, target);
      formatRowsByLocale[localeKey] = getFormatRows(
        context.runtime,
        localeKey,
        locales,
        target,
        formatsByLocale[localeKey],
      );
    }

    const sourceFileInfo = getSourceFileInfo(
      context.repositorySourceRootDirectoryPath,
      context.rootDirectoryPath,
      projectConfig,
      "target",
      targetKey,
      { resolveAbsolutePath: context.devEditors.length > 0 },
    );
    const detail = {
      type: "target",
      key: targetKey,
      entity: target,
      sourcePath: sourceFileInfo.sourcePath,
      editLinks: getEditorLinks(context.devEditors, sourceFileInfo),
      locales: targetLocaleKeys,
      formatsByLocale,
      formatRowsByLocale,
      messages: targetMessages[targetKey],
      tests: testsByEntity[`target:${targetKey}`] || [],
      lastModified: getLastModified(context.historyIndex, "target", targetKey, set || undefined),
    };

    index.entities.target.push(
      getEntitySummary(target, "target", targetKey, context.historyIndex, set || undefined, {
        messageCount: targetMessages[targetKey].length,
      }),
    );
    await context.writer.write(
      path.join(outputDirectoryPath, "entities", "target", `${encodeKey(targetKey)}.json`),
      detail,
    );
    skippedEmptyHistoryCount += await writeHistoryPages(
      context.writer,
      path.join(outputDirectoryPath, "history", "target", encodeKey(targetKey)),
      getHistoryForEntity(context.historyIndex, "target", targetKey, set || undefined),
      { skipEmpty: true },
    );
  });
  context.progress.done(targetsStartedAt, `(${pluralize(targetKeys.length, "target")})`);

  const indexStartedAt = context.progress.step("Writing catalog index");
  for (const type of Object.keys(index.entities) as CatalogEntityType[]) {
    index.entities[type].sort((a, b) => a.key.localeCompare(b.key));
  }

  await context.writer.write(path.join(outputDirectoryPath, "index.json"), index);
  context.progress.done(indexStartedAt);
  context.progress.done(
    setStartedAt,
    `total (${pluralize(skippedEmptyHistoryCount, "empty history", "empty histories")} skipped)`,
  );

  return index;
}

async function copyCatalogAssets(outputDirectoryPath: string) {
  let packageJsonPath: string;

  try {
    packageJsonPath = require.resolve("@messagevisor/catalog/package.json");
  } catch (_error) {
    throw new Error(
      "Unable to resolve @messagevisor/catalog. Run npm install from the repository root.",
    );
  }

  const distPath = path.join(path.dirname(packageJsonPath), "dist");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      "Catalog UI bundle not found. Run `npm run build --workspace @messagevisor/catalog` first.",
    );
  }

  await fs.promises.cp(distPath, outputDirectoryPath, { recursive: true });
}

async function createCatalogDevSession(
  rootDirectoryPath: string,
  projectConfig: any,
  options: { outDir?: string; devEditors?: CatalogDevEditor[] } = {},
): Promise<CatalogDevSession> {
  const outputDirectoryPath = options.outDir
    ? path.resolve(rootDirectoryPath, options.outDir)
    : projectConfig.catalogDirectoryPath;

  return {
    outputDirectoryPath,
    devEditors: options.devEditors || detectDevEditors(),
    historyIndex: await getGitHistoryIndex(rootDirectoryPath, projectConfig),
    links: getRepoLinks(rootDirectoryPath),
    repositoryRootDirectoryPath: getRepositoryRootDirectoryPath(rootDirectoryPath),
    repositorySourceRootDirectoryPath: getRepositorySourceRootDirectoryPath(rootDirectoryPath),
  };
}

async function readJsonFile<T>(filePath: string): Promise<T | undefined> {
  try {
    return JSON.parse(await fs.promises.readFile(filePath, "utf8")) as T;
  } catch (_error) {
    return undefined;
  }
}

function getOutputRelativeDirectory(projectConfig: any, set?: string) {
  return projectConfig.sets ? path.join("sets", set || "") : "root";
}

function normalizeSelectedSets(values: unknown): string[] {
  const rawValues = Array.isArray(values) ? values : typeof values === "undefined" ? [] : [values];
  const selectedSets = rawValues
    .flatMap((value) => (typeof value === "string" ? [value] : []))
    .map((value) => value.trim())
    .filter(Boolean);

  return Array.from(new Set(selectedSets));
}

function filterCatalogSetExecutions(
  executions: Array<{ set: string; projectConfig: any; datasource: any }>,
  selectedSets: string[] | undefined,
) {
  if (!selectedSets || selectedSets.length === 0) {
    return executions;
  }

  const selectedSet = new Set(selectedSets);
  const filtered = executions.filter((execution) => selectedSet.has(execution.set));
  const missingSets = selectedSets.filter(
    (set) => !executions.some((execution) => execution.set === set),
  );

  if (missingSets.length > 0) {
    throw new Error(`Catalog set not found: ${missingSets.join(", ")}`);
  }

  return filtered;
}

function getCatalogSetSortRank(set: string) {
  const normalizedSet = set.toLowerCase();

  if (normalizedSet.startsWith("dev")) {
    return 0;
  }

  if (normalizedSet.startsWith("prod")) {
    return 2;
  }

  return 1;
}

function sortCatalogSetKeys(setKeys: string[]) {
  return [...setKeys].sort((a, b) => {
    const rankDiff = getCatalogSetSortRank(a) - getCatalogSetSortRank(b);

    if (rankDiff !== 0) {
      return rankDiff;
    }

    return a.localeCompare(b);
  });
}

function getDataOutputDirectoryPath(session: CatalogDevSession, projectConfig: any, set?: string) {
  return path.join(
    session.outputDirectoryPath,
    "data",
    getOutputRelativeDirectory(projectConfig, set),
  );
}

function getEntityKeyFromChangedPath(
  rootDirectoryPath: string,
  projectConfig: any,
  changedPath: string,
): EntityPathInfo | undefined {
  const relativePath = path.relative(rootDirectoryPath, changedPath);

  if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return undefined;
  }

  return getEntityInfoFromRelativePath(rootDirectoryPath, projectConfig, relativePath);
}

function getChangedPathSummary(rootDirectoryPath: string, changedPaths: string[]) {
  return changedPaths
    .slice(0, 3)
    .map((changedPath) => formatCatalogPath(rootDirectoryPath, changedPath))
    .join(", ");
}

function classifyCatalogDevChanges(
  rootDirectoryPath: string,
  projectConfig: any,
  changedPaths: string[],
  options: { withTranslationSearch: boolean; withDuplicates: boolean },
): CatalogDevRebuildRequest {
  const reason = getChangedPathSummary(rootDirectoryPath, changedPaths) || "project changes";
  const infos = changedPaths.map((changedPath) =>
    getEntityKeyFromChangedPath(rootDirectoryPath, projectConfig, changedPath),
  );

  if (infos.length === 0 || infos.some((info) => !info)) {
    return { kind: "full", reason };
  }

  const sets = new Set(infos.map((info) => info?.set || ""));
  const types = new Set(infos.map((info) => info?.type));

  if (sets.size > 1) {
    return { kind: "full", reason };
  }

  const set = Array.from(sets)[0] || undefined;

  if (
    types.size === 1 &&
    types.has("message") &&
    !options.withTranslationSearch &&
    !options.withDuplicates
  ) {
    return {
      kind: "message",
      reason,
      set,
      messageKeys: sortStrings(infos.map((info) => info?.key || "").filter(Boolean)),
    };
  }

  if (
    projectConfig.sets &&
    set &&
    types.size > 0 &&
    !types.has("test") &&
    !options.withTranslationSearch &&
    !options.withDuplicates
  ) {
    return { kind: "set", reason, set };
  }

  return { kind: "full", reason };
}

async function writeCatalogManifest(
  writer: CatalogJsonWriter,
  rootDirectoryPath: string,
  projectConfig: any,
  session: CatalogDevSession,
  options: {
    browserRouter: boolean;
    withTranslationSearch: boolean;
    withDuplicates: boolean;
    setIndexes: Record<string, CatalogSetIndex>;
    executions: Array<{ set: string; projectConfig: any; datasource: any }>;
  },
) {
  const setKeys = projectConfig.sets
    ? sortCatalogSetKeys(options.executions.map((execution) => execution.set))
    : [];
  const manifest = {
    schemaVersion: CATALOG_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    router: options.browserRouter === false ? "hash" : "browser",
    sets: projectConfig.sets,
    setKeys,
    dev: { editors: session.devEditors },
    features: {
      translationSearch: options.withTranslationSearch,
      duplicates: options.withDuplicates,
    },
    links: session.links,
    paths: {
      projectHistory: "data/project/history/page-1.json",
      root: projectConfig.sets ? undefined : "data/root/index.json",
      sets: projectConfig.sets
        ? Object.fromEntries(
            options.executions.map((execution) => [
              execution.set,
              `data/sets/${encodeURIComponent(execution.set)}/index.json`,
            ]),
          )
        : undefined,
    },
    counts: Object.fromEntries(
      Object.keys(options.setIndexes).map((key) => [key, options.setIndexes[key].counts]),
    ),
  };

  await writer.write(path.join(session.outputDirectoryPath, "data", "manifest.json"), manifest);
  return manifest;
}

function getMessageRelationshipFingerprint(message: Message) {
  const attributes = new Set<string>();
  const segments = new Set<string>();

  for (const override of message.overrides || []) {
    collectAttributeKeysFromConditions(override.conditions, attributes);
    collectSegmentKeys(override.segments, segments);
  }

  return {
    attributes: sortStrings(Array.from(attributes)),
    segments: sortStrings(Array.from(segments)),
  };
}

function sameStringList(left: string[] = [], right: string[] = []) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function summarizeMessage(
  message: Message,
  messageKey: string,
  historyIndex: CatalogHistoryIndex,
  set: string | undefined,
  targets: string[],
) {
  const directLocales = Object.keys(message.translations || {});
  const overrideLocalesSet = new Set<string>();

  for (const override of message.overrides || []) {
    for (const localeKey of Object.keys(override.translations || {})) {
      overrideLocalesSet.add(localeKey);
    }
  }

  const overrideLocales = sortStrings(Array.from(overrideLocalesSet));

  return getEntitySummary(message, "message", messageKey, historyIndex, set, {
    targets,
    ...((message.overrides || []).length > 0
      ? { overrideCount: (message.overrides || []).length }
      : {}),
    ...(directLocales.length > 0 ? { locales: sortStrings(directLocales) } : {}),
    ...(overrideLocales.length > 0 ? { overrideLocales } : {}),
  });
}

async function tryRebuildCatalogMessage(
  runtime: CatalogRuntime,
  rootDirectoryPath: string,
  rootProjectConfig: any,
  projectConfig: any,
  datasource: any,
  session: CatalogDevSession,
  request: CatalogDevRebuildRequest,
) {
  if (request.kind !== "message" || !request.messageKeys || request.messageKeys.length === 0) {
    return false;
  }

  const dataDirectoryPath = getDataOutputDirectoryPath(session, rootProjectConfig, request.set);
  const indexPath = path.join(dataDirectoryPath, "index.json");
  const index = await readJsonFile<CatalogSetIndex>(indexPath);

  if (!index) {
    return false;
  }

  const [localeKeys, messageKeys, targetKeys] = (await Promise.all([
    datasource.listLocales(),
    datasource.listMessages(),
    datasource.listTargets(),
  ])) as [string[], string[], string[]];
  const messageKeySet = new Set(messageKeys);

  if (request.messageKeys.some((messageKey) => !messageKeySet.has(messageKey))) {
    return false;
  }

  const [locales, targets] = await Promise.all([
    readAll<Locale>(localeKeys, (key) => datasource.readLocale(key)),
    readAll<Target>(targetKeys, (key) => datasource.readTarget(key)),
  ]);
  const localeDirections = getLocaleDirections(locales);
  const targetMessages = Object.fromEntries(
    targetKeys.map((targetKey) => [
      targetKey,
      getTargetMessageKeys(runtime, targets[targetKey], messageKeys),
    ]),
  ) as Record<string, string[]>;
  const writer = new CatalogJsonWriter();

  for (const messageKey of request.messageKeys) {
    const oldDetailPath = path.join(
      dataDirectoryPath,
      "entities",
      "message",
      `${encodeKey(messageKey)}.json`,
    );
    const oldDetail = await readJsonFile<any>(oldDetailPath);

    if (!oldDetail) {
      return false;
    }

    const message = await datasource.readMessage(messageKey);
    const messageTargets = sortStrings(
      targetKeys.filter((targetKey) => targetMessages[targetKey].includes(messageKey)),
    );

    if (!sameStringList(sortStrings(oldDetail.targets || []), messageTargets)) {
      return false;
    }

    const oldRelationshipFingerprint = getMessageRelationshipFingerprint(oldDetail.entity || {});
    const nextRelationshipFingerprint = getMessageRelationshipFingerprint(message);

    if (
      !sameStringList(
        oldRelationshipFingerprint.attributes,
        nextRelationshipFingerprint.attributes,
      ) ||
      !sameStringList(oldRelationshipFingerprint.segments, nextRelationshipFingerprint.segments)
    ) {
      return false;
    }

    const examples = await runtime.resolveExamples(projectConfig, datasource, {
      set: request.set,
      message: messageKey,
      onlyMessages: true,
    });
    const overrides = (message.overrides || []).map((override: Override) => {
      const attributes = new Set<string>();
      const overrideSegments = new Set<string>();
      collectAttributeKeysFromConditions(override.conditions, attributes);
      collectSegmentKeys(override.segments, overrideSegments);

      return {
        ...override,
        usedAttributes: sortStrings(Array.from(attributes)),
        usedSegments: sortStrings(Array.from(overrideSegments)),
      };
    });
    const sourceFileInfo = getSourceFileInfo(
      session.repositorySourceRootDirectoryPath,
      rootDirectoryPath,
      projectConfig,
      "message",
      messageKey,
      { resolveAbsolutePath: session.devEditors.length > 0 },
    );
    const detail = {
      type: "message",
      key: messageKey,
      entity: { ...message, overrides },
      sourcePath: sourceFileInfo.sourcePath,
      editLinks: getEditorLinks(session.devEditors, sourceFileInfo),
      targets: messageTargets,
      localeKeys,
      localeDirections,
      translations: localeKeys.map((localeKey) =>
        resolveTranslationRow(message.translations, localeKey, locales),
      ),
      evaluatedExamples: examples.messages,
      overrideTranslations: overrides.map((override) => ({
        key: override.key,
        rows: localeKeys.map((localeKey) =>
          resolveTranslationRow(override.translations, localeKey, locales),
        ),
      })),
      lastModified: getLastModified(session.historyIndex, "message", messageKey, request.set),
    };

    await writer.write(oldDetailPath, detail);

    await writeHistoryPages(
      writer,
      path.join(dataDirectoryPath, "history", "message", encodeKey(messageKey)),
      getHistoryForEntity(session.historyIndex, "message", messageKey, request.set),
      { skipEmpty: true },
    );

    const nextSummary = summarizeMessage(
      message,
      messageKey,
      session.historyIndex,
      request.set,
      messageTargets,
    );
    const existingSummaryIndex = index.entities.message.findIndex(
      (entry) => entry.key === messageKey,
    );

    if (existingSummaryIndex === -1) {
      index.entities.message.push(nextSummary);
    } else {
      index.entities.message[existingSummaryIndex] = nextSummary;
    }
  }

  index.entities.message.sort((left, right) => left.key.localeCompare(right.key));
  index.counts.message = messageKeys.length;
  await writer.write(indexPath, index);

  return true;
}

async function rebuildCatalogSetForDev(
  runtime: CatalogRuntime,
  rootDirectoryPath: string,
  projectConfig: any,
  datasource: any,
  session: CatalogDevSession,
  options: {
    set?: string;
    selectedSets?: string[];
    browserRouter: boolean;
    withTranslationSearch: boolean;
    withDuplicates: boolean;
  },
) {
  const writer = new CatalogJsonWriter();
  const progress = new CatalogProgressReporter(rootDirectoryPath, session.outputDirectoryPath);
  const executions = filterCatalogSetExecutions(
    await runtime.getProjectSetExecutions(projectConfig, datasource),
    options.selectedSets,
  );
  const setIndexes: Record<string, CatalogSetIndex> = {};
  const existingIndexes = await Promise.all(
    executions.map(async (execution) => {
      const indexPath = path.join(
        session.outputDirectoryPath,
        "data",
        getOutputRelativeDirectory(projectConfig, execution.set),
        "index.json",
      );
      return [execution.set || "root", await readJsonFile<CatalogSetIndex>(indexPath)] as const;
    }),
  );

  for (const [key, index] of existingIndexes) {
    if (index) {
      setIndexes[key] = index;
    }
  }

  const execution = executions.find((item) => (item.set || undefined) === options.set);

  if (!execution) {
    return false;
  }

  const outputRelativeDirectory = getOutputRelativeDirectory(projectConfig, execution.set);
  await fs.promises.rm(path.join(session.outputDirectoryPath, "data", outputRelativeDirectory), {
    recursive: true,
    force: true,
  });

  const context: CatalogBuildContext = {
    rootDirectoryPath,
    repositoryRootDirectoryPath: session.repositoryRootDirectoryPath,
    repositorySourceRootDirectoryPath: session.repositorySourceRootDirectoryPath,
    outputDirectoryPath: session.outputDirectoryPath,
    dataDirectoryPath: path.join(session.outputDirectoryPath, "data"),
    historyIndex: session.historyIndex,
    runtime,
    devEditors: session.devEditors,
    duplicateResultsBySet: {},
    withTranslationSearch: options.withTranslationSearch,
    withDuplicates: options.withDuplicates,
    progress,
    writer,
  };

  setIndexes[execution.set || "root"] = await buildSetCatalog(
    context,
    execution.set,
    execution.projectConfig,
    execution.datasource,
    outputRelativeDirectory,
  );

  await writeCatalogManifest(writer, rootDirectoryPath, projectConfig, session, {
    browserRouter: options.browserRouter,
    withTranslationSearch: options.withTranslationSearch,
    withDuplicates: options.withDuplicates,
    setIndexes,
    executions,
  });

  return true;
}

export async function exportCatalog(
  runtime: CatalogRuntime,
  rootDirectoryPath: string,
  projectConfig: any,
  datasource: any,
  options: CatalogExportOptions = {},
) {
  const outputDirectoryPath = options.outDir
    ? path.resolve(rootDirectoryPath, options.outDir)
    : projectConfig.catalogDirectoryPath;
  const dataDirectoryPath = path.join(outputDirectoryPath, "data");
  const withTranslationSearch = options.withTranslationSearch === true;
  const withDuplicates = options.withDuplicates === true;
  const progress = new CatalogProgressReporter(rootDirectoryPath, outputDirectoryPath);
  const writer = new CatalogJsonWriter();

  progress.start({
    browserRouter: options.browserRouter !== false,
    sets: projectConfig.sets === true,
    features: [
      ...(withTranslationSearch ? ["translation search"] : []),
      ...(withDuplicates ? ["duplicates"] : []),
    ],
  });

  let stepStartedAt = progress.step("Preparing output directory");
  if (options.preserveAssets) {
    await fs.promises.rm(dataDirectoryPath, { recursive: true, force: true });
  } else {
    await fs.promises.rm(outputDirectoryPath, { recursive: true, force: true });
  }
  await fs.promises.mkdir(dataDirectoryPath, { recursive: true });
  progress.done(stepStartedAt);

  if (options.copyAssets !== false) {
    stepStartedAt = progress.step("Copying Catalog UI assets");
    await copyCatalogAssets(outputDirectoryPath);
    progress.done(stepStartedAt);
  }

  const devEditors = options.dev
    ? options.devSession?.devEditors || options.devEditors || detectDevEditors()
    : [];
  stepStartedAt = progress.step("Reading Git history");
  const historyIndex =
    options.devSession?.historyIndex ||
    (await getGitHistoryIndex(rootDirectoryPath, projectConfig));
  progress.done(stepStartedAt, `(${pluralize(historyIndex.entries.length, "commit")})`);

  stepStartedAt = progress.step("Resolving repository links");
  const links = options.devSession?.links || getRepoLinks(rootDirectoryPath);
  progress.done(stepStartedAt);

  let duplicateResultsBySet: Record<string, CatalogDuplicateTranslationsSetResult> = {};
  if (withDuplicates) {
    stepStartedAt = progress.step("Scanning duplicate translations");
    duplicateResultsBySet = Object.fromEntries(
      (await runtime.findDuplicateTranslations(projectConfig, datasource)).results
        .filter(
          (result) =>
            !projectConfig.sets ||
            !options.sets?.length ||
            (result.set !== null && options.sets.includes(result.set)),
        )
        .map((result) => [getDuplicateSetKey(result.set), result]),
    );
    progress.done(
      stepStartedAt,
      `(${pluralize(
        Object.values(duplicateResultsBySet).reduce(
          (total, result) =>
            total +
            result.locales.reduce(
              (localeTotal, localeResult) => localeTotal + localeResult.duplicateValues.length,
              0,
            ),
          0,
        ),
        "duplicate value",
      )})`,
    );
  }

  const context: CatalogBuildContext = {
    rootDirectoryPath,
    repositoryRootDirectoryPath:
      options.devSession?.repositoryRootDirectoryPath ||
      getRepositoryRootDirectoryPath(rootDirectoryPath),
    repositorySourceRootDirectoryPath:
      options.devSession?.repositorySourceRootDirectoryPath ||
      getRepositorySourceRootDirectoryPath(rootDirectoryPath),
    outputDirectoryPath,
    dataDirectoryPath,
    historyIndex,
    runtime,
    devEditors,
    duplicateResultsBySet,
    withTranslationSearch,
    withDuplicates,
    progress,
    writer,
  };
  stepStartedAt = progress.step("Discovering project sets");
  const executions = filterCatalogSetExecutions(
    await runtime.getProjectSetExecutions(projectConfig, datasource),
    projectConfig.sets ? options.sets : undefined,
  );
  progress.done(
    stepStartedAt,
    projectConfig.sets
      ? `(${executions.map((execution) => execution.set).join(", ") || "none"})`
      : "(root)",
  );
  const setIndexes: Record<string, CatalogSetIndex> = {};

  stepStartedAt = progress.step("Writing project history");
  await writeHistoryPages(
    writer,
    path.join(dataDirectoryPath, "project", "history"),
    historyIndex.entries,
  );
  progress.done(stepStartedAt, `(${pluralize(historyIndex.entries.length, "entry", "entries")})`);

  for (const execution of executions) {
    const outputRelativeDirectory = projectConfig.sets ? path.join("sets", execution.set) : "root";
    setIndexes[execution.set || "root"] = await buildSetCatalog(
      context,
      execution.set,
      execution.projectConfig,
      execution.datasource,
      outputRelativeDirectory,
    );
  }

  stepStartedAt = progress.step("Writing manifest");
  const setKeys = projectConfig.sets
    ? sortCatalogSetKeys(executions.map((execution) => execution.set))
    : [];
  const manifest = {
    schemaVersion: CATALOG_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    router: options.browserRouter === false ? "hash" : "browser",
    sets: projectConfig.sets,
    setKeys,
    dev: options.dev ? { editors: devEditors } : undefined,
    features: {
      translationSearch: withTranslationSearch,
      duplicates: withDuplicates,
    },
    links,
    paths: {
      projectHistory: "data/project/history/page-1.json",
      root: projectConfig.sets ? undefined : "data/root/index.json",
      sets: projectConfig.sets
        ? Object.fromEntries(
            executions.map((execution) => [
              execution.set,
              `data/sets/${encodeURIComponent(execution.set)}/index.json`,
            ]),
          )
        : undefined,
    },
    counts: Object.fromEntries(Object.keys(setIndexes).map((key) => [key, setIndexes[key].counts])),
  };

  await writer.write(path.join(dataDirectoryPath, "manifest.json"), manifest);
  progress.done(stepStartedAt);

  progress.complete();

  return {
    outputDirectoryPath,
    manifest,
  };
}

function getContentType(filePath: string) {
  const extension = path.extname(filePath);

  switch (extension) {
    case ".js":
      return "text/javascript";
    case ".css":
      return "text/css";
    case ".json":
      return "application/json";
    case ".png":
      return "image/png";
    case ".svg":
      return "image/svg+xml";
    case ".ico":
      return "image/x-icon";
    default:
      return "text/html";
  }
}

function getCatalogLiveReloadClientScript() {
  return [
    "<script>",
    "(() => {",
    '  const source = new EventSource("/__messagevisor_catalog_reload");',
    '  source.addEventListener("reload", () => window.location.reload());',
    "  source.onerror = () => {",
    "    source.close();",
    "    setTimeout(() => window.location.reload(), 1000);",
    "  };",
    "})();",
    "</script>",
  ].join("");
}

function injectCatalogLiveReloadClient(html: string) {
  const script = getCatalogLiveReloadClientScript();

  if (html.includes("</body>")) {
    return html.replace("</body>", `${script}</body>`);
  }

  return `${html}${script}`;
}

function getCatalogInputWatchPaths(rootDirectoryPath: string, projectConfig: any) {
  const paths = [path.join(rootDirectoryPath, "messagevisor.config.js")];

  if (projectConfig.sets) {
    paths.push(projectConfig.setsDirectoryPath);
    return paths;
  }

  paths.push(
    projectConfig.localesDirectoryPath,
    projectConfig.messagesDirectoryPath,
    projectConfig.attributesDirectoryPath,
    projectConfig.segmentsDirectoryPath,
    projectConfig.targetsDirectoryPath,
    projectConfig.testsDirectoryPath,
  );

  return paths.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
}

function createCatalogInputWatcher(
  rootDirectoryPath: string,
  projectConfig: any,
  ignoredDirectoryPaths: string[],
  onChange: (changedPaths: string[]) => void,
) {
  const watchPaths = getCatalogInputWatchPaths(rootDirectoryPath, projectConfig);

  function shouldIgnore(targetPath: string) {
    const resolvedTargetPath = path.resolve(targetPath);

    return ignoredDirectoryPaths.some((ignoredDirectoryPath) => {
      const resolvedIgnoredPath = path.resolve(ignoredDirectoryPath);

      return (
        resolvedTargetPath === resolvedIgnoredPath ||
        resolvedTargetPath.startsWith(`${resolvedIgnoredPath}${path.sep}`)
      );
    });
  }

  function shouldWatch(targetPath: string) {
    const resolvedTargetPath = path.resolve(targetPath);

    if (shouldIgnore(resolvedTargetPath)) {
      return false;
    }

    return watchPaths.some((watchPath) => {
      const resolvedWatchPath = path.resolve(watchPath);

      return (
        resolvedTargetPath === resolvedWatchPath ||
        resolvedTargetPath.startsWith(`${resolvedWatchPath}${path.sep}`)
      );
    });
  }

  function collectSnapshotEntries(directoryPath: string, snapshotEntries: Map<string, string>) {
    if (shouldIgnore(directoryPath)) {
      return;
    }

    let entries: fs.Dirent[] = [];

    try {
      entries = fs.readdirSync(directoryPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const entryPath = path.join(directoryPath, entry.name);

      if (shouldIgnore(entryPath)) {
        continue;
      }

      if (entry.isDirectory()) {
        collectSnapshotEntries(entryPath, snapshotEntries);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      try {
        const stat = fs.statSync(entryPath);
        snapshotEntries.set(entryPath, `${stat.size}:${stat.mtimeMs}`);
      } catch {
        // Ignore transient editor save races.
      }
    }
  }

  function createSnapshot() {
    const snapshotEntries = new Map<string, string>();

    for (const watchPath of watchPaths) {
      if (!fs.existsSync(watchPath)) {
        continue;
      }

      const stat = fs.statSync(watchPath);

      if (stat.isFile()) {
        snapshotEntries.set(watchPath, `${stat.size}:${stat.mtimeMs}`);
        continue;
      }

      collectSnapshotEntries(watchPath, snapshotEntries);
    }

    return snapshotEntries;
  }

  function getSnapshotChanges(previous: Map<string, string>, next: Map<string, string>) {
    const changedPaths = new Set<string>();

    for (const [filePath, signature] of Array.from(next.entries())) {
      if (previous.get(filePath) !== signature) {
        changedPaths.add(filePath);
      }
    }

    for (const filePath of Array.from(previous.keys())) {
      if (!next.has(filePath)) {
        changedPaths.add(filePath);
      }
    }

    return Array.from(changedPaths);
  }

  function createPollingWatcher() {
    let previousSnapshot = createSnapshot();
    const interval = setInterval(() => {
      const nextSnapshot = createSnapshot();
      const changedPaths = getSnapshotChanges(previousSnapshot, nextSnapshot).filter(shouldWatch);

      previousSnapshot = nextSnapshot;

      if (changedPaths.length === 0) {
        return;
      }

      onChange(changedPaths);
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }

  const watchers: fs.FSWatcher[] = [];
  let nativeWatcherFailed = false;

  for (const watchPath of watchPaths) {
    if (!fs.existsSync(watchPath)) {
      continue;
    }

    try {
      const stat = fs.statSync(watchPath);
      const directoryPath = stat.isDirectory() ? watchPath : path.dirname(watchPath);
      const watcher = fs.watch(
        directoryPath,
        { recursive: stat.isDirectory() },
        (_eventType, filename) => {
          const changedPath = filename
            ? path.resolve(directoryPath, filename.toString())
            : directoryPath;

          if (shouldWatch(changedPath)) {
            onChange([changedPath]);
          }
        },
      );

      watchers.push(watcher);
    } catch (_error) {
      nativeWatcherFailed = true;
      break;
    }
  }

  if (nativeWatcherFailed || watchers.length === 0) {
    for (const watcher of watchers) {
      watcher.close();
    }

    return createPollingWatcher();
  }

  return () => {
    for (const watcher of watchers) {
      watcher.close();
    }
  };
}

export async function serveCatalog(
  runtime: CatalogRuntime,
  rootDirectoryPath: string,
  projectConfig: any,
  datasource: any,
  options: CatalogServeOptions = {},
): Promise<CatalogServerHandle> {
  const outputDirectoryPath = options.outDir
    ? path.resolve(rootDirectoryPath, options.outDir)
    : projectConfig.catalogDirectoryPath;

  if (!fs.existsSync(outputDirectoryPath)) {
    await exportCatalog(runtime, rootDirectoryPath, projectConfig, datasource, {
      outDir: outputDirectoryPath,
      browserRouter: options.browserRouter,
      sets: options.sets,
    });
  }

  const port = Number(options.port || 3000);
  const liveReloadClients = new Set<http.ServerResponse>();

  function triggerReload() {
    liveReloadClients.forEach((client) => {
      client.write("event: reload\n");
      client.write("data: reload\n\n");
    });
  }

  const server = http.createServer((request, response) => {
    const requestedUrl = decodeURIComponent((request.url || "/").split("?")[0]);

    if (options.liveReload && requestedUrl === "/__messagevisor_catalog_reload") {
      response.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      });
      response.write("\n");
      liveReloadClients.add(response);

      request.on("close", () => {
        liveReloadClients.delete(response);
      });

      return;
    }

    const requestedPath = requestedUrl === "/" ? "/index.html" : requestedUrl;
    const filePath = path.join(outputDirectoryPath, requestedPath);
    const safeFilePath = filePath.startsWith(outputDirectoryPath)
      ? filePath
      : path.join(outputDirectoryPath, "index.html");

    fs.readFile(safeFilePath, (error, content) => {
      if (!error) {
        if (options.liveReload && path.basename(safeFilePath) === "index.html") {
          const html = injectCatalogLiveReloadClient(content.toString("utf8"));
          response.writeHead(200, { "Content-Type": "text/html" });
          response.end(html);
          return;
        }

        response.writeHead(200, { "Content-Type": getContentType(safeFilePath) });
        response.end(content);
        return;
      }

      if (
        requestedPath.startsWith("/assets/") ||
        requestedPath.startsWith("/data/") ||
        requestedPath === "/favicon.ico"
      ) {
        response.writeHead(404, { "Content-Type": "text/plain" });
        response.end("404 Not Found");
        return;
      }

      fs.readFile(path.join(outputDirectoryPath, "index.html"), (indexError, indexContent) => {
        if (indexError) {
          response.writeHead(500, { "Content-Type": "text/plain" });
          response.end("Catalog index.html not found.");
          return;
        }

        if (options.liveReload) {
          response.writeHead(200, { "Content-Type": "text/html" });
          response.end(injectCatalogLiveReloadClient(indexContent.toString("utf8")));
          return;
        }

        response.writeHead(200, { "Content-Type": "text/html" });
        response.end(indexContent);
      });
    });
  });

  server.on("error", (error) => {
    console.error(`Unable to serve catalog on http://127.0.0.1:${port}/`);
    console.error(error);
    process.exitCode = 1;
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(`Catalog running at http://127.0.0.1:${port}/`);
  });

  return {
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      }),
    triggerReload,
  };
}

export function createCatalogApi(runtime: CatalogRuntime) {
  return {
    exportCatalog: (
      rootDirectoryPath: string,
      projectConfig: any,
      datasource: any,
      options: CatalogExportOptions = {},
    ) => exportCatalog(runtime, rootDirectoryPath, projectConfig, datasource, options),
    serveCatalog: (
      rootDirectoryPath: string,
      projectConfig: any,
      datasource: any,
      options: CatalogServeOptions = {},
    ) => serveCatalog(runtime, rootDirectoryPath, projectConfig, datasource, options),
  };
}

function isWithTranslationSearchEnabled(parsed: CatalogPluginParsedOptions) {
  return parsed.withTranslationSearch === true || parsed["with-translation-search"] === true;
}

function isWithDuplicatesEnabled(parsed: CatalogPluginParsedOptions) {
  return parsed.withDuplicates === true || parsed["with-duplicates"] === true;
}

export const __catalogDevInternals = {
  classifyCatalogDevChanges,
  getCatalogInputWatchPaths,
};

export function createCatalogPlugin(
  runtime: CatalogRuntime,
  api: ReturnType<typeof createCatalogApi> = createCatalogApi(runtime),
): CatalogPlugin {
  return {
    command: "catalog [subcommand]",
    handler: async ({ rootDirectoryPath, projectConfig, datasource, parsed }) => {
      const allowedSubcommands = ["export", "serve"];
      const browserRouter = !(parsed.hashRouter || parsed["hash-router"]);
      const withTranslationSearch = isWithTranslationSearchEnabled(parsed);
      const withDuplicates = isWithDuplicatesEnabled(parsed);
      const selectedSets = normalizeSelectedSets(parsed.set);

      if (!parsed.subcommand) {
        const outputDirectoryPath = parsed.outDir
          ? path.resolve(rootDirectoryPath, parsed.outDir)
          : projectConfig.catalogDirectoryPath;
        const devSession = await createCatalogDevSession(rootDirectoryPath, projectConfig, {
          outDir: parsed.outDir,
        });
        await api.exportCatalog(rootDirectoryPath, projectConfig, datasource, {
          outDir: parsed.outDir,
          copyAssets: !parsed.noAssets,
          browserRouter,
          dev: true,
          devSession,
          withTranslationSearch,
          withDuplicates,
          sets: selectedSets,
        });
        const server = await api.serveCatalog(rootDirectoryPath, projectConfig, datasource, {
          outDir: parsed.outDir,
          port: parsed.port || parsed.p,
          browserRouter,
          liveReload: true,
          sets: selectedSets,
        });

        const ignoredDirectoryPaths = [
          path.join(rootDirectoryPath, ".git"),
          path.join(rootDirectoryPath, "node_modules"),
          path.join(rootDirectoryPath, ".messagevisor"),
          path.join(rootDirectoryPath, "datafiles"),
          path.join(rootDirectoryPath, "catalog"),
          path.join(rootDirectoryPath, "exports"),
          path.join(rootDirectoryPath, "imports"),
          outputDirectoryPath,
        ];
        let exportInFlight = false;
        let queuedChanges: string[] = [];
        let pendingChanges: string[] = [];
        let debounceTimer: ReturnType<typeof setTimeout> | null = null;

        const runRebuildAndReload = async (changedPaths: string[]) => {
          if (exportInFlight) {
            queuedChanges.push(...changedPaths);
            return;
          }

          exportInFlight = true;

          try {
            const request = classifyCatalogDevChanges(
              rootDirectoryPath,
              projectConfig,
              changedPaths,
              {
                withTranslationSearch,
                withDuplicates,
              },
            );

            if (request.set && selectedSets.length > 0 && !selectedSets.includes(request.set)) {
              return;
            }

            console.log(`\n[catalog] Rebuilding (${request.kind}) because ${request.reason}`);

            let handled = false;

            if (request.kind === "message") {
              const [execution] = await runtime.getProjectSetExecutions(
                projectConfig,
                datasource,
                request.set,
              );
              handled = await tryRebuildCatalogMessage(
                runtime,
                rootDirectoryPath,
                projectConfig,
                execution.projectConfig,
                execution.datasource,
                devSession,
                request,
              );
            }

            if (!handled && request.kind === "set" && request.set) {
              handled = await rebuildCatalogSetForDev(
                runtime,
                rootDirectoryPath,
                projectConfig,
                datasource,
                devSession,
                {
                  set: request.set,
                  selectedSets,
                  browserRouter,
                  withTranslationSearch,
                  withDuplicates,
                },
              );
            }

            if (!handled) {
              await api.exportCatalog(rootDirectoryPath, projectConfig, datasource, {
                outDir: parsed.outDir,
                copyAssets: false,
                preserveAssets: true,
                browserRouter,
                dev: true,
                devSession,
                withTranslationSearch,
                withDuplicates,
                sets: selectedSets,
              });
            }

            server.triggerReload();
          } catch (error) {
            console.error("[catalog] Export failed during watch mode");
            console.error(error);
          } finally {
            exportInFlight = false;

            if (queuedChanges.length > 0) {
              const nextChanges = queuedChanges;
              queuedChanges = [];
              void runRebuildAndReload(nextChanges);
            }
          }
        };

        const stopWatchingProject = createCatalogInputWatcher(
          rootDirectoryPath,
          projectConfig,
          ignoredDirectoryPaths,
          (changedPaths) => {
            pendingChanges.push(...changedPaths);

            if (debounceTimer) {
              clearTimeout(debounceTimer);
            }
            debounceTimer = setTimeout(() => {
              const nextChanges = Array.from(new Set(pendingChanges));
              pendingChanges = [];
              debounceTimer = null;
              void runRebuildAndReload(nextChanges);
            }, 250);
          },
        );

        process.on("exit", stopWatchingProject);
        return;
      }

      if (allowedSubcommands.indexOf(parsed.subcommand) === -1) {
        console.log("Please specify a subcommand: `export` or `serve`");
        return false;
      }

      if (parsed.subcommand === "export") {
        await api.exportCatalog(rootDirectoryPath, projectConfig, datasource, {
          outDir: parsed.outDir,
          copyAssets: !parsed.noAssets,
          browserRouter,
          withTranslationSearch,
          withDuplicates,
          sets: selectedSets,
        });
      }

      if (parsed.subcommand === "serve") {
        await api.serveCatalog(rootDirectoryPath, projectConfig, datasource, {
          outDir: parsed.outDir,
          port: parsed.port || parsed.p,
          browserRouter,
          sets: selectedSets,
        });
      }
    },
    examples: [
      {
        command: "catalog",
        description: "generate and serve the static catalog locally",
      },
      {
        command: "catalog export",
        description: "generate static catalog with project data",
      },
      {
        command: "catalog serve",
        description: "serve the generated catalog locally",
      },
    ],
  };
}
