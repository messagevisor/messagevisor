import * as fs from "fs";
import * as path from "path";

import type { FormatPresets, GroupSegment, Locale, Target } from "@messagevisor/types";
import type { ZodError, ZodTypeAny } from "zod";

import type { ProjectConfig } from "../config";
import type { Datasource } from "../datasource";
import { assertValidEntityKey } from "../datasource/entityKey";
import { getAttributeZodSchema } from "./attributeSchema";
import { checkLocaleCircularDependency } from "./checkLocaleCircularDependency";
import { contextValueMatchesAttribute, getConditionsZodSchema } from "./conditionSchema";
import { lintMessageIcuFormatStyles } from "./icuStyleLint";
import { lintTranslationContracts } from "./translationContractLint";
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
import { matchesPattern, normalizePatterns } from "../targeting";
import { parseRegexOption } from "../cli/validation";
import { loadProjectSnapshot } from "../snapshot";

function collectGroupSegmentKeys(
  value: GroupSegment | GroupSegment[] | "*" | undefined,
  result = new Set<string>(),
) {
  if (!value || value === "*") return result;
  if (Array.isArray(value)) {
    value.forEach((entry) => collectGroupSegmentKeys(entry, result));
    return result;
  }
  if (typeof value === "string") {
    result.add(value);
    return result;
  }
  if ("and" in value) collectGroupSegmentKeys(value.and, result);
  else if ("or" in value) collectGroupSegmentKeys(value.or, result);
  else collectGroupSegmentKeys(value.not, result);
  return result;
}

function collectFormatKeys(locales: Record<string, Locale>, target: Target) {
  const keys = new Set<string>();
  const add = (formats?: FormatPresets) => {
    for (const [type, presets] of Object.entries(formats || {})) {
      for (const preset of Object.keys(presets || {})) keys.add(`${type}.${preset}`);
    }
  };
  Object.values(locales).forEach((locale) => add(locale.formats));
  Object.values(target.formats || {}).forEach(add);
  return keys;
}

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

const ENTITY_NAME_REGEX_ERROR =
  "Names must use non-empty namespace segments containing only letters, numbers, _, and -.";

function isValidEntityKey(projectConfig: ProjectConfig, key: string) {
  try {
    assertValidEntityKey(projectConfig, key);
    return true;
  } catch {
    return false;
  }
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

type LintableEntityType = Exclude<LintEntityType, "project">;

const ALL_LINTABLE_ENTITY_TYPES: LintableEntityType[] = [
  "locale",
  "attribute",
  "segment",
  "message",
  "target",
  "test",
];

function getLintEntityTypes(entityType?: string) {
  if (!entityType) {
    return new Set<LintableEntityType>(ALL_LINTABLE_ENTITY_TYPES);
  }

  switch (entityType) {
    case "locale":
      return new Set<LintableEntityType>(["locale", "message"]);
    case "attribute":
      return new Set<LintableEntityType>(["locale", "attribute"]);
    case "segment":
      return new Set<LintableEntityType>(["locale", "attribute", "segment"]);
    case "message":
      return new Set<LintableEntityType>(["locale", "attribute", "segment", "message"]);
    case "target":
      return new Set<LintableEntityType>(["locale", "attribute", "message", "target"]);
    case "test":
      return new Set<LintableEntityType>(["locale", "message", "segment", "target", "test"]);
    case "project":
      return new Set<LintableEntityType>(["locale"]);
    default:
      return new Set<LintableEntityType>(ALL_LINTABLE_ENTITY_TYPES);
  }
}

function getLintEntityTypesToRead(entityType?: string) {
  if (!entityType) {
    return new Set<LintableEntityType>(ALL_LINTABLE_ENTITY_TYPES);
  }

  switch (entityType) {
    case "locale":
      return new Set<LintableEntityType>(["locale"]);
    case "attribute":
      return new Set<LintableEntityType>(["attribute"]);
    case "segment":
      return new Set<LintableEntityType>(["attribute", "segment"]);
    case "message":
      return new Set<LintableEntityType>(["locale", "attribute", "segment", "message"]);
    case "target":
      return new Set<LintableEntityType>(["locale", "attribute", "target"]);
    case "test":
      return new Set<LintableEntityType>(["message", "segment", "test"]);
    case "project":
      return new Set<LintableEntityType>(["locale"]);
    default:
      return new Set<LintableEntityType>(ALL_LINTABLE_ENTITY_TYPES);
  }
}

export async function lintProject(
  projectConfig: ProjectConfig,
  datasource: Datasource,
  options: LintProjectOptions = {},
): Promise<LintResult> {
  const startTime = Date.now();
  const errors: LintError[] = [];
  const keyPattern = options.keyPattern
    ? parseRegexOption("--keyPattern", options.keyPattern)
    : null;

  function shouldLintKey(key: string) {
    return !keyPattern || keyPattern.test(key);
  }

  const entityTypesToLoad = getLintEntityTypes(options.entityType);
  const entityTypesToRead = getLintEntityTypesToRead(options.entityType);
  const shouldRead = (entityType: LintableEntityType) => entityTypesToRead.has(entityType);

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
    loadedValue?: unknown,
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
      const parsed = typeof loadedValue === "undefined" ? await read(key) : loadedValue;
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

  const snapshot = await loadProjectSnapshot(datasource, {
    entityTypes: Array.from(entityTypesToRead),
    keyOnlyEntityTypes: Array.from(entityTypesToLoad),
    ignoreReadErrors: true,
  });
  const { keys } = snapshot;
  const localeKeys = keys.locale;
  const attributeKeys = keys.attribute;
  const segmentKeys = keys.segment;
  const messageKeys = keys.message;
  const targetKeys = keys.target;
  const testKeys = keys.test;

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

  const localesByKey = shouldRead("locale") ? snapshot.locales : {};
  const attributesByKey = shouldRead("attribute") ? snapshot.attributes : {};
  const messagesByKey = shouldRead("message") ? snapshot.messages : {};
  const segmentsByKey = shouldRead("segment") ? snapshot.segments : {};
  const targetsByKey = shouldRead("target") ? snapshot.targets : {};
  const testsByKey = shouldRead("test") ? snapshot.tests : {};

  if (projectConfig.sourceLocale && !localeKeys.includes(projectConfig.sourceLocale)) {
    recordError({
      filePath: "messagevisor.config.js",
      entityType: "project",
      entityKey: "messagevisor.config.js",
      message: `Unknown sourceLocale "${projectConfig.sourceLocale}".`,
      path: ["sourceLocale"],
      code: "unknown_source_locale",
    });
  }

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
      await lintEntity(
        "locale",
        key,
        localeZodSchema,
        (entityKey) => datasource.readLocale(entityKey),
        localesByKey[key],
      );
    }
  }

  if (!options.entityType || options.entityType === "locale" || options.entityType === "project") {
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
  }

  if (!options.entityType || options.entityType === "attribute") {
    for (const key of attributeKeys.filter(shouldLintKey)) {
      await lintEntity(
        "attribute",
        key,
        attributeZodSchema,
        (entityKey) => datasource.readAttribute(entityKey),
        attributesByKey[key],
      );
    }
  }

  if (!options.entityType || options.entityType === "segment") {
    for (const key of segmentKeys.filter(shouldLintKey)) {
      await lintEntity(
        "segment",
        key,
        segmentZodSchema,
        (entityKey) => datasource.readSegment(entityKey),
        segmentsByKey[key],
      );
    }
  }

  if (!options.entityType || options.entityType === "message") {
    for (const key of messageKeys.filter(shouldLintKey)) {
      await lintEntity(
        "message",
        key,
        messageZodSchema,
        (entityKey) => datasource.readMessage(entityKey),
        messagesByKey[key],
      );
    }

    for (const [messageKey, message] of Object.entries(messagesByKey)) {
      if (!shouldLintKey(messageKey) || message.archived) continue;
      (message.overrides || []).forEach((override, overrideIndex) => {
        for (const segmentKey of Array.from(collectGroupSegmentKeys(override.segments))) {
          if (!segmentsByKey[segmentKey]?.archived) continue;
          recordError({
            filePath: formatProjectPath(
              projectConfig,
              getFullPathFromKey(projectConfig, "message", messageKey),
            ),
            entityType: "message",
            entityKey: messageKey,
            message: `Active override references archived segment "${segmentKey}".`,
            path: ["overrides", overrideIndex, "segments"],
            code: "archived_segment_reference",
          });
        }
      });
    }

    if (projectConfig.lintIcu !== false) {
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

    if (projectConfig.sourceLocale && localeKeys.includes(projectConfig.sourceLocale)) {
      errors.push(
        ...lintTranslationContracts(
          Object.fromEntries(Object.entries(messagesByKey).filter(([key]) => shouldLintKey(key))),
          projectConfig.sourceLocale,
          (key) =>
            formatProjectPath(projectConfig, getFullPathFromKey(projectConfig, "message", key)),
          { checkMessageContract: projectConfig.lintIcu !== false },
        ),
      );
    }
  }

  if (!options.entityType || options.entityType === "target") {
    for (const key of targetKeys.filter(shouldLintKey)) {
      await lintEntity(
        "target",
        key,
        targetZodSchema,
        (entityKey) => datasource.readTarget(entityKey),
        targetsByKey[key],
      );
    }

    for (const [targetKey, target] of Object.entries(targetsByKey)) {
      if (!shouldLintKey(targetKey)) continue;
      const targetPath = formatProjectPath(
        projectConfig,
        getFullPathFromKey(projectConfig, "target", targetKey),
      );

      for (const [field, patterns] of [
        ["includeMessages", target.includeMessages],
        ["excludeMessages", target.excludeMessages],
      ] as const) {
        for (const pattern of normalizePatterns(patterns)) {
          if (messageKeys.length === 0) continue;
          if (messageKeys.some((key) => matchesPattern(key, pattern))) continue;
          recordError({
            filePath: targetPath,
            entityType: "target",
            entityKey: targetKey,
            message: `${field} pattern "${pattern}" does not match any message.`,
            path: [field],
            code: "unmatched_target_pattern",
            value: pattern,
          });
        }
      }

      const formatKeys = collectFormatKeys(localesByKey, target);
      for (const [field, filters] of [
        ["includeFormats", target.includeFormats],
        ["excludeFormats", target.excludeFormats],
      ] as const) {
        for (const [type, patterns] of Object.entries(filters || {})) {
          const availableTypeKeys = Array.from(formatKeys).filter((key) =>
            key.startsWith(`${type}.`),
          );
          for (const pattern of normalizePatterns(patterns)) {
            if (availableTypeKeys.length === 0) continue;
            if (
              availableTypeKeys.some(
                (key) =>
                  key.startsWith(`${type}.`) && matchesPattern(key.slice(type.length + 1), pattern),
              )
            ) {
              continue;
            }
            recordError({
              filePath: targetPath,
              entityType: "target",
              entityKey: targetKey,
              message: `${field}.${type} pattern "${pattern}" does not match any format preset.`,
              path: [field, type],
              code: "unmatched_target_format_pattern",
              value: pattern,
            });
          }
        }
      }

      for (const [attributeKey, value] of Object.entries(target.context || {})) {
        const attribute = attributesByKey[attributeKey];
        if (!attribute) {
          recordError({
            filePath: targetPath,
            entityType: "target",
            entityKey: targetKey,
            message: `Target context references unknown attribute "${attributeKey}".`,
            path: ["context", attributeKey],
            code: "unknown_target_context_attribute",
          });
        } else if (!contextValueMatchesAttribute(attribute, value)) {
          recordError({
            filePath: targetPath,
            entityType: "target",
            entityKey: targetKey,
            message: `Target context value for "${attributeKey}" does not match its attribute schema.`,
            path: ["context", attributeKey],
            code: "invalid_target_context_value",
            value,
          });
        }
      }
    }
  }

  if (!options.entityType || options.entityType === "test") {
    for (const key of testKeys.filter(shouldLintKey)) {
      await lintEntity(
        "test",
        key,
        testZodSchema,
        (entityKey) => datasource.readTest(entityKey),
        testsByKey[key],
      );
    }

    for (const [testKey, test] of Object.entries(testsByKey)) {
      if (!shouldLintKey(testKey)) continue;
      const testPath = formatProjectPath(
        projectConfig,
        getFullPathFromKey(projectConfig, "test", testKey),
      );
      if ("message" in test && messagesByKey[test.message]?.archived) {
        recordError({
          filePath: testPath,
          entityType: "test",
          entityKey: testKey,
          message: `Test references archived message "${test.message}".`,
          path: ["message"],
          code: "archived_message_reference",
        });
      }
      if ("segment" in test && segmentsByKey[test.segment]?.archived) {
        recordError({
          filePath: testPath,
          entityType: "test",
          entityKey: testKey,
          message: `Test references archived segment "${test.segment}".`,
          path: ["segment"],
          code: "archived_segment_reference",
        });
      }
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
