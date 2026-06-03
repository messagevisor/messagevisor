/* eslint-disable @typescript-eslint/no-unused-vars */
import * as childProcess from "child_process";
import * as fs from "fs";
import * as http from "http";
import * as path from "path";

import type {
  Attribute,
  Condition,
  FormatPresets,
  GroupSegment,
  Locale,
  Message,
  Override,
  Target,
  Segment,
} from "@messagevisor/types";

import { attachFormatExamplePreviews } from "./formatExamplePreview";

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
  messageCount?: number;
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
}

export interface CatalogServeOptions {
  outDir?: string;
  port?: number | string;
  browserRouter?: boolean;
  liveReload?: boolean;
}

export interface CatalogServerHandle {
  close: () => Promise<void>;
  triggerReload: () => void;
}

interface CatalogBuildContext {
  rootDirectoryPath: string;
  repositoryRootDirectoryPath: string;
  outputDirectoryPath: string;
  dataDirectoryPath: string;
  historyIndex: CatalogHistoryIndex;
  runtime: CatalogRuntime;
  devEditors: CatalogDevEditor[];
  duplicateResultsBySet: Record<string, CatalogDuplicateTranslationsSetResult>;
  withTranslationSearch: boolean;
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

function matchesPattern(key: string, patterns?: string[]) {
  if (!patterns || patterns.length === 0) {
    return false;
  }

  return patterns.some((pattern) => {
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    return new RegExp(`^${escaped}$`).test(key);
  });
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

function getTargetMessageKeys(target: Target, messageKeys: string[]) {
  const includeMessages = target.includeMessages?.length ? target.includeMessages : ["*"];
  const excludeMessages = target.excludeMessages || [];

  return messageKeys
    .filter(
      (messageKey) =>
        matchesPattern(messageKey, includeMessages) && !matchesPattern(messageKey, excludeMessages),
    )
    .sort();
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
  const pathSegments = formatPath.split(".");

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

function getFormatRows(
  runtime: CatalogRuntime,
  localeKey: string,
  locales: Record<string, Locale>,
  target?: Target,
): CatalogFormatRow[] {
  const computedFormats = runtime.resolveFormats(localeKey, locales, target) || {};

  const rows = flattenObjectRows(computedFormats).map((row) => {
    if (
      target &&
      typeof getPathValue(target.formats?.[localeKey], row.path.split(".")) !== "undefined"
    ) {
      return { ...row, source: "target" as const, from: "target" };
    }

    return {
      ...row,
      ...getLocaleFormatSource(localeKey, locales, row.path),
    };
  });

  return attachFormatExamplePreviews(localeKey, computedFormats, rows);
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

async function writeJson(filePath: string, content: unknown) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, JSON.stringify(content, null, 2));
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
      addHistoryIndexEntry(index.byEntity, entityKey, entry);

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

async function writeHistoryPages(directoryPath: string, history: CatalogHistoryEntry[]) {
  const pages = chunkHistory(history);

  for (let index = 0; index < pages.length; index++) {
    await writeJson(path.join(directoryPath, `page-${index + 1}.json`), {
      page: index + 1,
      pageSize: CATALOG_HISTORY_PAGE_SIZE,
      totalPages: pages.length,
      entries: pages[index],
    });
  }
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
  repositoryRootDirectoryPath: string,
  rootDirectoryPath: string,
  projectConfig: any,
  type: CatalogEntityType,
  key: string,
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
  const absolutePath = getRealPath(filePath);

  return {
    sourcePath: toPosixPath(path.relative(repositoryRootDirectoryPath, absolutePath)),
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
  const [localeKeys, messageKeys, attributeKeys, segmentKeys, targetKeys] = await Promise.all([
    datasource.listLocales(),
    datasource.listMessages(),
    datasource.listAttributes(),
    datasource.listSegments(),
    datasource.listTargets(),
  ]);
  const [locales, messages, attributes, segments, targets] = await Promise.all([
    readAll<Locale>(localeKeys, (key) => datasource.readLocale(key)),
    readAll<Message>(messageKeys, (key) => datasource.readMessage(key)),
    readAll<Attribute>(attributeKeys, (key) => datasource.readAttribute(key)),
    readAll<Segment>(segmentKeys, (key) => datasource.readSegment(key)),
    readAll<Target>(targetKeys, (key) => datasource.readTarget(key)),
  ]);
  const messageTargets: Record<string, string[]> = {};
  const targetMessages: Record<string, string[]> = {};
  const localeTargets: Record<string, Set<string>> = {};
  const attributeTargets: Record<string, Set<string>> = {};
  const segmentTargets: Record<string, Set<string>> = {};
  const attributesUsedInSegments: Record<string, Set<string>> = {};
  const attributesUsedInMessages: Record<string, Set<string>> = {};
  const segmentsUsedInMessages: Record<string, Set<string>> = {};

  for (const targetKey of targetKeys) {
    targetMessages[targetKey] = getTargetMessageKeys(targets[targetKey], messageKeys);
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

  await writeHistoryPages(path.join(outputDirectoryPath, "history"), history);

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

  for (const localeKey of localeKeys) {
    const locale = locales[localeKey];
    const sourceFileInfo = getSourceFileInfo(
      context.repositoryRootDirectoryPath,
      context.rootDirectoryPath,
      projectConfig,
      "locale",
      localeKey,
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
      lastModified: getLastModified(context.historyIndex, "locale", localeKey, set || undefined),
    };

    index.entities.locale.push(
      getEntitySummary(locale, "locale", localeKey, context.historyIndex, set || undefined, {
        targets: sortStrings(Array.from(localeTargets[localeKey] || [])),
      }),
    );
    await writeJson(
      path.join(outputDirectoryPath, "entities", "locale", `${encodeKey(localeKey)}.json`),
      detail,
    );
    await writeJson(
      path.join(outputDirectoryPath, "duplicates", "locales", `${encodeKey(localeKey)}.json`),
      toLocaleDuplicatesFile(localeKey, duplicatesByLocale),
    );
    await writeHistoryPages(
      path.join(outputDirectoryPath, "history", "locale", encodeKey(localeKey)),
      getHistoryForEntity(context.historyIndex, "locale", localeKey, set || undefined),
    );
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

  for (const messageKey of messageKeys) {
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
      context.repositoryRootDirectoryPath,
      context.rootDirectoryPath,
      projectConfig,
      "message",
      messageKey,
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

    if (context.withTranslationSearch) {
      // Build translation shards (direct + inherited + override, all locales combined)
      for (const localeKey of localeKeys) {
        const row = resolveTranslationRow(message.translations, localeKey, locales);
        if (row.source !== "missing" && row.value) {
          addToTranslationShard(messageKey, row.value);
        }
        for (const override of overrides) {
          const overrideRow = resolveTranslationRow(override.translations, localeKey, locales);
          if (overrideRow.source !== "missing" && overrideRow.value) {
            addToTranslationShard(messageKey, overrideRow.value);
          }
        }
      }
    }

    index.entities.message.push(
      getEntitySummary(message, "message", messageKey, context.historyIndex, set || undefined, {
        targets: sortStrings(messageTargets[messageKey] || []),
        ...(directLocales.length > 0 ? { locales: sortStrings(directLocales) } : {}),
        ...(overrideLocalesList.length > 0 ? { overrideLocales: overrideLocalesList } : {}),
      }),
    );
    await writeJson(
      path.join(outputDirectoryPath, "entities", "message", `${encodeKey(messageKey)}.json`),
      detail,
    );
    await writeHistoryPages(
      path.join(outputDirectoryPath, "history", "message", encodeKey(messageKey)),
      getHistoryForEntity(context.historyIndex, "message", messageKey, set || undefined),
    );
  }

  if (context.withTranslationSearch) {
    for (const [prefix, messageMap] of Object.entries(translationShards)) {
      const shardData: Record<string, string[]> = {};
      for (const [msgKey, valueSet] of Object.entries(messageMap)) {
        shardData[msgKey] = Array.from(valueSet);
      }
      await writeJson(path.join(outputDirectoryPath, "translations", `${prefix}.json`), shardData);
    }
  }

  for (const attributeKey of attributeKeys) {
    const attribute = attributes[attributeKey];
    const sourceFileInfo = getSourceFileInfo(
      context.repositoryRootDirectoryPath,
      context.rootDirectoryPath,
      projectConfig,
      "attribute",
      attributeKey,
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
        },
      ),
    );
    await writeJson(
      path.join(outputDirectoryPath, "entities", "attribute", `${encodeKey(attributeKey)}.json`),
      detail,
    );
    await writeHistoryPages(
      path.join(outputDirectoryPath, "history", "attribute", encodeKey(attributeKey)),
      getHistoryForEntity(context.historyIndex, "attribute", attributeKey, set || undefined),
    );
  }

  for (const segmentKey of segmentKeys) {
    const segment = segments[segmentKey];
    const usedAttributes = new Set<string>();
    collectAttributeKeysFromConditions(segment.conditions, usedAttributes);
    const sourceFileInfo = getSourceFileInfo(
      context.repositoryRootDirectoryPath,
      context.rootDirectoryPath,
      projectConfig,
      "segment",
      segmentKey,
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
      lastModified: getLastModified(context.historyIndex, "segment", segmentKey, set || undefined),
    };

    index.entities.segment.push(
      getEntitySummary(segment, "segment", segmentKey, context.historyIndex, set || undefined, {
        targets: sortStrings(Array.from(segmentTargets[segmentKey] || [])),
      }),
    );
    await writeJson(
      path.join(outputDirectoryPath, "entities", "segment", `${encodeKey(segmentKey)}.json`),
      detail,
    );
    await writeHistoryPages(
      path.join(outputDirectoryPath, "history", "segment", encodeKey(segmentKey)),
      getHistoryForEntity(context.historyIndex, "segment", segmentKey, set || undefined),
    );
  }

  for (const targetKey of targetKeys) {
    const target = targets[targetKey];
    const targetLocaleKeys = target.locales?.length ? target.locales : localeKeys;
    const formatsByLocale: Record<string, FormatPresets | undefined> = {};
    const formatRowsByLocale: Record<string, CatalogFormatRow[]> = {};

    for (const localeKey of targetLocaleKeys) {
      formatsByLocale[localeKey] = context.runtime.resolveFormats(localeKey, locales, target);
      formatRowsByLocale[localeKey] = getFormatRows(context.runtime, localeKey, locales, target);
    }

    const sourceFileInfo = getSourceFileInfo(
      context.repositoryRootDirectoryPath,
      context.rootDirectoryPath,
      projectConfig,
      "target",
      targetKey,
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
      lastModified: getLastModified(context.historyIndex, "target", targetKey, set || undefined),
    };

    index.entities.target.push(
      getEntitySummary(target, "target", targetKey, context.historyIndex, set || undefined, {
        messageCount: targetMessages[targetKey].length,
      }),
    );
    await writeJson(
      path.join(outputDirectoryPath, "entities", "target", `${encodeKey(targetKey)}.json`),
      detail,
    );
    await writeHistoryPages(
      path.join(outputDirectoryPath, "history", "target", encodeKey(targetKey)),
      getHistoryForEntity(context.historyIndex, "target", targetKey, set || undefined),
    );
  }

  for (const type of Object.keys(index.entities) as CatalogEntityType[]) {
    index.entities[type].sort((a, b) => a.key.localeCompare(b.key));
  }

  await writeJson(path.join(outputDirectoryPath, "index.json"), index);

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

  await fs.promises.rm(outputDirectoryPath, { recursive: true, force: true });
  await fs.promises.mkdir(dataDirectoryPath, { recursive: true });

  if (options.copyAssets !== false) {
    await copyCatalogAssets(outputDirectoryPath);
  }

  const devEditors = options.dev ? options.devEditors || detectDevEditors() : [];
  const historyIndex = await getGitHistoryIndex(rootDirectoryPath, projectConfig);
  const duplicateTranslations = await runtime.findDuplicateTranslations(projectConfig, datasource);
  const duplicateResultsBySet = Object.fromEntries(
    duplicateTranslations.results.map((result) => [getDuplicateSetKey(result.set), result]),
  );
  const context: CatalogBuildContext = {
    rootDirectoryPath,
    repositoryRootDirectoryPath: getRepositoryRootDirectoryPath(rootDirectoryPath),
    outputDirectoryPath,
    dataDirectoryPath,
    historyIndex,
    runtime,
    devEditors,
    duplicateResultsBySet,
    withTranslationSearch,
  };
  const executions = await runtime.getProjectSetExecutions(projectConfig, datasource);
  const setIndexes: Record<string, CatalogSetIndex> = {};

  await writeHistoryPages(path.join(dataDirectoryPath, "project", "history"), historyIndex.entries);

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

  const manifest = {
    schemaVersion: CATALOG_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    router: options.browserRouter === false ? "hash" : "browser",
    sets: projectConfig.sets,
    setKeys: projectConfig.sets ? executions.map((execution) => execution.set) : [],
    dev: options.dev ? { editors: devEditors } : undefined,
    features: {
      translationSearch: withTranslationSearch,
    },
    links: getRepoLinks(rootDirectoryPath),
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

  await writeJson(path.join(dataDirectoryPath, "manifest.json"), manifest);

  console.log(`Catalog exported to ${outputDirectoryPath}`);

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

function createProjectWatcher(
  rootDirectoryPath: string,
  ignoredDirectoryPaths: string[],
  onChange: (changedPath: string) => void,
) {
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

  function collectSnapshotEntries(directoryPath: string, snapshotEntries: string[]) {
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
        const relativePath = path.relative(rootDirectoryPath, entryPath);
        snapshotEntries.push(`${relativePath}:${stat.size}:${stat.mtimeMs}`);
      } catch {
        // Ignore transient editor save races.
      }
    }
  }

  function createSnapshot() {
    const snapshotEntries: string[] = [];
    collectSnapshotEntries(rootDirectoryPath, snapshotEntries);
    snapshotEntries.sort();
    return snapshotEntries.join("|");
  }

  let previousSnapshot = createSnapshot();
  const interval = setInterval(() => {
    const nextSnapshot = createSnapshot();

    if (nextSnapshot === previousSnapshot) {
      return;
    }

    previousSnapshot = nextSnapshot;
    onChange(rootDirectoryPath);
  }, 250);

  return () => {
    clearInterval(interval);
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

      if (!parsed.subcommand) {
        await api.exportCatalog(rootDirectoryPath, projectConfig, datasource, {
          outDir: parsed.outDir,
          copyAssets: !parsed.noAssets,
          browserRouter,
          dev: true,
          withTranslationSearch,
        });
        const server = await api.serveCatalog(rootDirectoryPath, projectConfig, datasource, {
          outDir: parsed.outDir,
          port: parsed.port || parsed.p,
          browserRouter,
          liveReload: true,
        });

        const outputDirectoryPath = parsed.outDir
          ? path.resolve(rootDirectoryPath, parsed.outDir)
          : projectConfig.catalogDirectoryPath;
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
        let exportQueued = false;
        let queuedReason: string | null = null;
        let debounceTimer: ReturnType<typeof setTimeout> | null = null;

        const runExportAndReload = async (reason: string) => {
          if (exportInFlight) {
            exportQueued = true;
            queuedReason = queuedReason || reason;
            return;
          }

          exportInFlight = true;
          console.log(`\n[catalog] Re-exporting because ${reason}`);

          try {
            await api.exportCatalog(rootDirectoryPath, projectConfig, datasource, {
              outDir: parsed.outDir,
              copyAssets: !parsed.noAssets,
              browserRouter,
              dev: true,
              withTranslationSearch,
            });
            server.triggerReload();
          } catch (error) {
            console.error("[catalog] Export failed during watch mode");
            console.error(error);
          } finally {
            exportInFlight = false;

            if (exportQueued) {
              const nextReason = queuedReason || "more project changes";
              exportQueued = false;
              queuedReason = null;
              void runExportAndReload(nextReason);
            }
          }
        };

        const stopWatchingProject = createProjectWatcher(
          rootDirectoryPath,
          ignoredDirectoryPaths,
          (changedPath) => {
            const reason = `project change in ${path.relative(rootDirectoryPath, changedPath) || "."}`;

            if (debounceTimer) {
              clearTimeout(debounceTimer);
            }
            debounceTimer = setTimeout(() => {
              debounceTimer = null;
              void runExportAndReload(reason);
            }, 150);
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
        });
      }

      if (parsed.subcommand === "serve") {
        await api.serveCatalog(rootDirectoryPath, projectConfig, datasource, {
          outDir: parsed.outDir,
          port: parsed.port || parsed.p,
          browserRouter,
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
