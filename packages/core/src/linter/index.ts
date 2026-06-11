import * as fs from "fs";
import * as path from "path";

import type { Attribute, Locale, Message } from "@messagevisor/types";
import type { ZodError, ZodTypeAny } from "zod";

import type { ProjectConfig } from "../config";
import type { Datasource } from "../datasource";
import { getAttributeZodSchema } from "./attributeSchema";
import { checkLocaleCircularDependency } from "./checkLocaleCircularDependency";
import { getConditionsZodSchema } from "./conditionSchema";
import { lintMessageIcuFormatStyles } from "./icuStyleLint";
import { getLocaleZodSchema } from "./localeSchema";
import { getMessageZodSchema } from "./messageSchema";
import { getLintIssuesFromZodError } from "./printError";
import { getTargetZodSchema } from "./targetSchema";
import { getSegmentZodSchema } from "./segmentSchema";
import { getTestZodSchema } from "./testSchema";
import {
  assertProjectSetJsonSelection,
  getProjectSetExecutions,
  getProjectSetRelativeFilePath,
} from "../sets";
import { formatProjectPath, getProjectRootDirectoryPath } from "../path";
import { CLI_FORMAT_BOLD, CLI_FORMAT_GREEN, CLI_FORMAT_RED, colorize } from "../tester/cliFormat";
import { prettyDuration } from "../tester/prettyDuration";

export type LintEntityType =
  | "locale"
  | "attribute"
  | "segment"
  | "message"
  | "target"
  | "test"
  | "project";

export interface LintProjectOptions {
  keyPattern?: string;
  entityType?: string;
  set?: string;
  json?: boolean;
  pretty?: boolean;
}

export interface LintError {
  level: "error";
  filePath: string;
  entityType: LintEntityType;
  entityKey: string;
  message: string;
  path: (string | number)[];
  code?: string;
  value?: unknown;
}

export interface LintResult {
  hasError: boolean;
  errors: LintError[];
  duration: number;
}

const ENTITY_NAME_REGEX_ERROR = "Names must be alphanumeric and can contain _, -, /, and .";

function isValidEntityKey(projectConfig: ProjectConfig, key: string) {
  return /^[a-zA-Z0-9_\-/]+$/.test(key.split(projectConfig.namespaceCharacter).join(""));
}

function getParserExtension(projectConfig: ProjectConfig) {
  return (projectConfig.parser as any).extension || "yml";
}

function getFullPathFromKey(projectConfig: ProjectConfig, entityType: LintEntityType, key: string) {
  const fileName = `${key.split(projectConfig.namespaceCharacter).join(path.sep)}.${getParserExtension(projectConfig)}`;

  if (entityType === "locale") {
    return path.join(projectConfig.localesDirectoryPath, fileName);
  }

  if (entityType === "attribute") {
    return path.join(projectConfig.attributesDirectoryPath, fileName);
  }

  if (entityType === "segment") {
    return path.join(projectConfig.segmentsDirectoryPath, fileName);
  }

  if (entityType === "message") {
    return path.join(projectConfig.messagesDirectoryPath, fileName);
  }

  if (entityType === "target") {
    return path.join(projectConfig.targetsDirectoryPath, fileName);
  }

  if (entityType === "test") {
    const specFileName = `${key
      .split(projectConfig.namespaceCharacter)
      .join(path.sep)}.spec.${getParserExtension(projectConfig)}`;
    const specFilePath = path.join(projectConfig.testsDirectoryPath, specFileName);

    return fs.existsSync(specFilePath)
      ? specFilePath
      : path.join(projectConfig.testsDirectoryPath, fileName);
  }

  return path.join(getProjectRootDirectoryPath(projectConfig), "messagevisor.config.js");
}

async function readAll<T>(
  keys: string[],
  read: (key: string) => Promise<T>,
): Promise<Record<string, T>> {
  const entries: [string, T][] = [];

  for (const key of keys) {
    try {
      entries.push([key, await read(key)]);
    } catch {
      // Parse/read errors are reported during entity validation.
    }
  }

  return Object.fromEntries(entries);
}

export async function lintProject(
  projectConfig: ProjectConfig,
  datasource: Datasource,
  options: LintProjectOptions = {},
): Promise<LintResult> {
  const startTime = Date.now();
  const errors: LintError[] = [];
  const keyPattern = options.keyPattern ? new RegExp(options.keyPattern) : null;

  function shouldLintKey(key: string) {
    return !keyPattern || keyPattern.test(key);
  }

  function recordError(error: Omit<LintError, "level">) {
    errors.push({ level: "error", ...error });
  }

  function reportZodError(
    entityType: LintEntityType,
    key: string,
    fullPath: string,
    error: ZodError,
  ) {
    for (const issue of getLintIssuesFromZodError(error)) {
      recordError({
        filePath: formatProjectPath(projectConfig, fullPath),
        entityType,
        entityKey: key,
        message: issue.message,
        path: issue.path,
        code: issue.code,
        value: issue.value,
      });
    }
  }

  async function lintEntity(
    entityType: Exclude<LintEntityType, "project">,
    key: string,
    schema: ZodTypeAny,
    read: (key: string) => Promise<unknown>,
  ) {
    const fullPath = getFullPathFromKey(projectConfig, entityType, key);

    if (!isValidEntityKey(projectConfig, key)) {
      recordError({
        filePath: formatProjectPath(projectConfig, fullPath),
        entityType,
        entityKey: key,
        message: `Invalid name: "${key}". ${ENTITY_NAME_REGEX_ERROR}`,
        path: [],
        code: "invalid_name",
      });
    }

    try {
      const parsed = await read(key);
      const result = schema.safeParse(parsed);

      if (!result.success) {
        reportZodError(entityType, key, fullPath, result.error);
      }
    } catch (error) {
      recordError({
        filePath: formatProjectPath(projectConfig, fullPath),
        entityType,
        entityKey: key,
        message: error instanceof Error ? error.message : String(error),
        path: [],
        code: error instanceof Error ? error.name : "error",
      });
    }
  }

  const [localeKeys, attributeKeys, segmentKeys, messageKeys, targetKeys, testKeys] =
    await Promise.all([
      datasource.listLocales(),
      datasource.listAttributes(),
      datasource.listSegments(),
      datasource.listMessages(),
      datasource.listTargets(),
      datasource.listTests(),
    ]);

  if (localeKeys.length === 0) {
    recordError({
      filePath: "messagevisor.config.js",
      entityType: "project",
      entityKey: "messagevisor.config.js",
      message: "At least one locale is required",
      path: ["locales"],
      code: "missing_locale",
    });
  }

  const localesByKey = await readAll<Locale>(localeKeys, (key) => datasource.readLocale(key));
  const attributesByKey = await readAll<Attribute>(attributeKeys, (key) =>
    datasource.readAttribute(key),
  );
  const messagesByKey = await readAll<Message>(messageKeys, (key) => datasource.readMessage(key));

  const localeZodSchema = getLocaleZodSchema(localeKeys, messageKeys);
  const attributeZodSchema = getAttributeZodSchema();
  const conditionsZodSchema = getConditionsZodSchema(attributesByKey);
  const segmentZodSchema = getSegmentZodSchema(conditionsZodSchema);
  const messageZodSchema = getMessageZodSchema(localeKeys, segmentKeys, attributesByKey, {
    namespaceCharacter: projectConfig.namespaceCharacter,
    exportOverrideKeySeparator: projectConfig.exportOverrideKeySeparator,
  });
  const targetZodSchema = getTargetZodSchema(localeKeys);
  const testZodSchema = getTestZodSchema(messageKeys, segmentKeys, localeKeys, targetKeys);

  if (!options.entityType || options.entityType === "locale") {
    for (const key of localeKeys.filter(shouldLintKey)) {
      await lintEntity("locale", key, localeZodSchema, (entityKey) =>
        datasource.readLocale(entityKey),
      );
    }
  }

  for (const field of [
    "inheritFormatsFrom",
    "inheritTranslationsFrom",
    "mergeExamplesFrom",
  ] as const) {
    for (const circularDependency of checkLocaleCircularDependency(localesByKey, field)) {
      const key = circularDependency.cycle[0];
      const fullPath = getFullPathFromKey(projectConfig, "locale", key);

      recordError({
        filePath: formatProjectPath(projectConfig, fullPath),
        entityType: "locale",
        entityKey: key,
        message: `Circular locale dependency detected for ${field}: ${circularDependency.cycle.join(" -> ")}`,
        path: [field],
        code: "circular_locale_dependency",
      });
    }
  }

  if (!options.entityType || options.entityType === "attribute") {
    for (const key of attributeKeys.filter(shouldLintKey)) {
      await lintEntity("attribute", key, attributeZodSchema, (entityKey) =>
        datasource.readAttribute(entityKey),
      );
    }
  }

  if (!options.entityType || options.entityType === "segment") {
    for (const key of segmentKeys.filter(shouldLintKey)) {
      await lintEntity("segment", key, segmentZodSchema, (entityKey) =>
        datasource.readSegment(entityKey),
      );
    }
  }

  if (!options.entityType || options.entityType === "message") {
    for (const key of messageKeys.filter(shouldLintKey)) {
      await lintEntity("message", key, messageZodSchema, (entityKey) =>
        datasource.readMessage(entityKey),
      );
    }

    errors.push(
      ...lintMessageIcuFormatStyles(
        Object.fromEntries(Object.entries(messagesByKey).filter(([key]) => shouldLintKey(key))),
        localesByKey,
        (key) =>
          formatProjectPath(projectConfig, getFullPathFromKey(projectConfig, "message", key)),
        { icuSkeleton: projectConfig.icuSkeleton },
      ),
    );
  }

  if (!options.entityType || options.entityType === "target") {
    for (const key of targetKeys.filter(shouldLintKey)) {
      await lintEntity("target", key, targetZodSchema, (entityKey) =>
        datasource.readTarget(entityKey),
      );
    }
  }

  if (!options.entityType || options.entityType === "test") {
    for (const key of testKeys.filter(shouldLintKey)) {
      await lintEntity("test", key, testZodSchema, (entityKey) => datasource.readTest(entityKey));
    }
  }

  return {
    hasError: errors.length > 0,
    errors,
    duration: Date.now() - startTime,
  };
}

function formatPath(errorPath: (string | number)[]) {
  return errorPath.reduce<string>((pathSegments, entry) => {
    if (typeof entry === "number") {
      return `${pathSegments}[${entry}]`;
    }

    return pathSegments ? `${pathSegments}.${entry}` : entry;
  }, "");
}

function getLintOptionsLabel(parsed: any) {
  const labels = [];

  if (parsed.set) {
    labels.push(`set: ${parsed.set}`);
  }

  if (parsed.entityType) {
    labels.push(`entity: ${parsed.entityType}`);
  }

  if (parsed.keyPattern) {
    labels.push(`keyPattern: ${parsed.keyPattern}`);
  }

  return labels.length > 0 ? labels.join(", ") : "all definitions";
}

async function lintProjectSets(
  projectConfig: ProjectConfig,
  datasource: Datasource,
  options: LintProjectOptions = {},
): Promise<LintResult> {
  const startTime = Date.now();
  const errors: LintError[] = [];
  const setExecutions = await getProjectSetExecutions(projectConfig, datasource, options.set);

  for (const execution of setExecutions) {
    const result = await lintProject(execution.projectConfig, execution.datasource, options);

    errors.push(
      ...result.errors.map((error) => ({
        ...error,
        filePath: projectConfig.sets
          ? getProjectSetRelativeFilePath(projectConfig, execution.set, error.filePath)
          : error.filePath,
        entityKey: projectConfig.sets ? `${execution.set}/${error.entityKey}` : error.entityKey,
      })),
    );
  }

  return {
    hasError: errors.length > 0,
    errors,
    duration: Date.now() - startTime,
  };
}

function groupLintErrors(errors: LintError[]) {
  const groups: Array<{ label: string; filePath: string; errors: LintError[] }> = [];
  const groupIndexes = new Map<string, number>();

  for (const error of errors) {
    const label = `${error.entityType} "${error.entityKey}"`;
    const groupKey = `${label}:${error.filePath}`;
    let groupIndex = groupIndexes.get(groupKey);

    if (typeof groupIndex === "undefined") {
      groupIndex = groups.length;
      groupIndexes.set(groupKey, groupIndex);
      groups.push({ label, filePath: error.filePath, errors: [] });
    }

    groups[groupIndex].errors.push(error);
  }

  return groups;
}

function printLintResult(result: LintResult, parsed: any) {
  console.log("");
  console.log(CLI_FORMAT_BOLD, "Linting Messagevisor definitions");
  console.log(`  ${colorize("Target", 36)}: ${getLintOptionsLabel(parsed)}`);
  console.log("");

  if (!result.hasError) {
    console.log(CLI_FORMAT_GREEN, "✔ No lint errors found");
    console.log(CLI_FORMAT_BOLD, `Time:  ${prettyDuration(result.duration)}`);
    return;
  }

  console.log(CLI_FORMAT_RED, `✘ ${result.errors.length} lint error(s) found`);
  console.log("");

  for (const group of groupLintErrors(result.errors)) {
    console.log(CLI_FORMAT_BOLD, group.label);
    console.log(`  ${colorize(group.filePath, 36)}`);

    for (const error of group.errors) {
      const errorPath = formatPath(error.path);
      const code = error.code ? colorize(error.code, 33) : colorize("lint_error", 33);
      const pathSuffix = errorPath ? ` ${colorize(errorPath, 2)}` : "";

      console.error(`  ${colorize("✘", 31)} [${code}]${pathSuffix}`);
      console.error(`    ${error.message}`);
    }

    console.log("");
  }

  console.log(CLI_FORMAT_RED, `Errors: ${result.errors.length} failed`);
  console.log(CLI_FORMAT_BOLD, `Time:   ${prettyDuration(result.duration)}`);
}

export const lintPlugin = {
  command: "lint",
  handler: async ({ projectConfig, datasource, parsed }: any) => {
    assertProjectSetJsonSelection(projectConfig, parsed.set, parsed.json);

    const result = await lintProjectSets(projectConfig, datasource, {
      set: parsed.set,
      entityType: parsed.entityType,
      keyPattern: parsed.keyPattern,
      json: parsed.json,
      pretty: parsed.pretty,
    });

    if (parsed.json) {
      console.log(
        parsed.pretty ? JSON.stringify(result.errors, null, 2) : JSON.stringify(result.errors),
      );
    } else {
      printLintResult(result, parsed);
    }

    return !result.hasError;
  },
  examples: [
    { command: "lint", description: "lint Messagevisor project definitions" },
    { command: "lint --json --pretty", description: "print lint results as JSON" },
  ],
};
