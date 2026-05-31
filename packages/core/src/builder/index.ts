/* eslint-disable @typescript-eslint/no-unused-vars */
import * as crypto from "crypto";
import * as path from "path";

import type {
  DatafileContent,
  Condition,
  Context,
  FormatPresets,
  GroupSegment,
  Locale,
  Message,
  MessageOverride,
  Target,
  Segment,
  SegmentKey,
} from "@messagevisor/types";

import { SCHEMA_VERSION, ProjectConfig, formatDatafilePath } from "../config";
import { Datasource } from "../datasource";
import { evaluateCondition } from "../evaluate";
import { assertProjectSetJsonSelection, getProjectSetExecutions } from "../sets";
import { CLI_FORMAT_BOLD, CLI_FORMAT_GREEN } from "../tester/cliFormat";
import { prettyDuration } from "../tester/prettyDuration";

interface TargetDatafileOptions {
  stringify: boolean;
  pretty: boolean;
  revisionFromHash: boolean;
}

export interface BuildProjectOptions {
  target?: string;
  locale?: string;
  revision?: string;
  noStateFiles?: boolean;
  json?: boolean;
  pretty?: boolean;
  showSize?: boolean;
  onProgress?: (event: BuildProgressEvent) => void;
}

export interface BuildProjectSetsOptions extends BuildProjectOptions {
  set?: string;
  onProjectSetsProgress?: (event: BuildProjectSetsProgressEvent) => void;
}

export type BuildProgressEvent =
  | { type: "start"; previousRevision: string; revision: string; targets: string[] }
  | { type: "targetStart"; target: string; locales: string[] }
  | {
      type: "localeBuilt";
      target: string;
      locale: string;
      datafile: DatafileContent;
      filePath?: string;
      sizeInBytes?: number;
    }
  | { type: "complete"; datafiles: DatafileContent[]; duration: number; revision: string };

export type BuildProjectSetsProgressEvent =
  | { type: "setsStart"; previousRevision: string; revision: string; sets: string[] }
  | { type: "setStart"; set: string }
  | ({ set: string } & BuildProgressEvent)
  | {
      type: "setsComplete";
      duration: number;
      revision: string;
      sets: string[];
      datafiles: DatafileContent[];
    };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepMerge<T>(parent?: T, child?: T): T | undefined {
  if (typeof parent === "undefined") {
    return child;
  }

  if (typeof child === "undefined") {
    return parent;
  }

  if (!isPlainObject(parent) || !isPlainObject(child)) {
    return child;
  }

  const result: Record<string, unknown> = { ...parent };

  for (const key of Object.keys(child)) {
    result[key] = deepMerge(result[key], child[key]);
  }

  return result as T;
}

export function mergeFormats(
  parent?: FormatPresets,
  child?: FormatPresets,
): FormatPresets | undefined {
  return deepMerge(parent, child);
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

function isAvailable<T extends { archived?: boolean }>(entity: T) {
  return !entity.archived;
}

async function readAll<T>(
  keys: string[],
  read: (key: string) => Promise<T>,
): Promise<Record<string, T>> {
  const entries = await Promise.all(keys.map(async (key) => [key, await read(key)] as const));
  return Object.fromEntries(entries);
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

export function resolveFormats(
  localeKey: string,
  locales: Record<string, Locale>,
  target?: Target,
): FormatPresets | undefined {
  const chain = resolveLocaleChain(localeKey, locales, "inheritFormatsFrom");
  let formats: FormatPresets | undefined;

  for (const key of chain) {
    formats = mergeFormats(formats, locales[key]?.formats);
  }

  return mergeFormats(formats, target?.formats?.[localeKey]);
}

function resolveLocaleValue<T>(
  values: Record<string, T> | undefined,
  localeKey: string,
  locales: Record<string, Locale>,
) {
  const chain = resolveLocaleChain(localeKey, locales, "inheritTranslationsFrom");
  const candidates = chain.reverse();

  for (const candidate of candidates) {
    if (values && typeof values[candidate] !== "undefined") {
      return values[candidate];
    }
  }
}

function collectSegmentKeys(
  segments: GroupSegment | GroupSegment[] | "*" | undefined,
  result: Set<SegmentKey>,
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
    return;
  }

  if ("or" in segments) {
    collectSegmentKeys(segments.or, result);
    return;
  }

  if ("not" in segments) {
    collectSegmentKeys(segments.not, result);
  }
}

function collectConditionSegmentKeys(
  conditions: Condition | Condition[] | "*" | undefined,
  result: Set<SegmentKey>,
) {
  if (!conditions || conditions === "*") {
    return;
  }

  if (typeof conditions === "string") {
    result.add(conditions);
    return;
  }

  if (Array.isArray(conditions)) {
    for (const condition of conditions) {
      collectConditionSegmentKeys(condition, result);
    }

    return;
  }

  if ("attribute" in conditions) {
    return;
  }

  if ("and" in conditions) {
    collectConditionSegmentKeys(conditions.and, result);
    return;
  }

  if ("or" in conditions) {
    collectConditionSegmentKeys(conditions.or, result);
    return;
  }

  if ("not" in conditions) {
    collectConditionSegmentKeys(conditions.not, result);
  }
}

function resolveTargetDatafileOptions(target?: Target): TargetDatafileOptions {
  return {
    stringify: target?.stringify !== false,
    pretty: target?.pretty === true,
    revisionFromHash: target?.revisionFromHash === true,
  };
}

function getDatafileSizeInBytes(datafile: DatafileContent, options: TargetDatafileOptions) {
  return Buffer.byteLength(
    options.pretty ? JSON.stringify(datafile, null, 2) : JSON.stringify(datafile),
  );
}

function stringifyDatafileExpression<T>(options: TargetDatafileOptions, value: T): T | string {
  if (!options.stringify || typeof value === "undefined" || typeof value === "string") {
    return value;
  }

  return JSON.stringify(value);
}

type TargetedResult<T> = { state: "true" } | { state: "false" } | { state: "partial"; value: T };

function hasContextValue(context: Context | undefined, attribute: string) {
  if (!context) {
    return false;
  }

  let current: any = context;

  for (const part of attribute.split(".")) {
    if (
      !current ||
      typeof current !== "object" ||
      !Object.prototype.hasOwnProperty.call(current, part)
    ) {
      return false;
    }

    current = current[part];
  }

  return true;
}

function simplifyAnd<T>(items: TargetedResult<T>[], create: (items: T[]) => T): TargetedResult<T> {
  if (items.some((item) => item.state === "false")) {
    return { state: "false" };
  }

  const partials = items
    .filter((item): item is { state: "partial"; value: T } => item.state === "partial")
    .map((item) => item.value);

  if (partials.length === 0) {
    return { state: "true" };
  }

  if (partials.length === 1) {
    return { state: "partial", value: partials[0] };
  }

  return { state: "partial", value: create(partials) };
}

function simplifyOr<T>(items: TargetedResult<T>[], create: (items: T[]) => T): TargetedResult<T> {
  if (items.some((item) => item.state === "true")) {
    return { state: "true" };
  }

  const partials = items
    .filter((item): item is { state: "partial"; value: T } => item.state === "partial")
    .map((item) => item.value);

  if (partials.length === 0) {
    return { state: "false" };
  }

  if (partials.length === 1) {
    return { state: "partial", value: partials[0] };
  }

  return { state: "partial", value: create(partials) };
}

function simplifyNot<T>(items: TargetedResult<T>[], create: (items: T[]) => T): TargetedResult<T> {
  if (items.some((item) => item.state === "false")) {
    return { state: "true" };
  }

  const partials = items
    .filter((item): item is { state: "partial"; value: T } => item.state === "partial")
    .map((item) => item.value);

  if (partials.length === 0) {
    return { state: "false" };
  }

  return { state: "partial", value: create(partials) };
}

function createTargetSimplifier(segments: Record<string, Segment>, context?: Context) {
  const targetedSegments: Record<string, Segment> = {};
  const segmentConditionResults: Record<string, TargetedResult<Condition | Condition[]>> = {};

  function simplifyCondition(
    condition: Condition | Condition[],
  ): TargetedResult<Condition | Condition[]> {
    if (Array.isArray(condition)) {
      return simplifyAnd(
        condition.map((item) => simplifyCondition(item)),
        (items) => items as Condition[],
      );
    }

    if (typeof condition === "string") {
      return simplifyGroupSegment(condition);
    }

    if ("and" in condition) {
      return simplifyAnd(
        condition.and.map((item) => simplifyCondition(item)),
        (items) => ({ and: items as Condition[] }),
      );
    }

    if ("or" in condition) {
      return simplifyOr(
        condition.or.map((item) => simplifyCondition(item)),
        (items) => ({ or: items as Condition[] }),
      );
    }

    if ("not" in condition) {
      return simplifyNot(
        condition.not.map((item) => simplifyCondition(item)),
        (items) => ({ not: items as Condition[] }),
      );
    }

    if (!("attribute" in condition) || !hasContextValue(context, condition.attribute)) {
      return { state: "partial", value: condition };
    }

    return evaluateCondition(condition, { context, segments })
      ? { state: "true" }
      : { state: "false" };
  }

  function simplifySegmentCondition(segmentKey: string): TargetedResult<Condition | Condition[]> {
    if (segmentConditionResults[segmentKey]) {
      return segmentConditionResults[segmentKey];
    }

    const segment = segments[segmentKey];

    if (!segment || segment.archived) {
      segmentConditionResults[segmentKey] = { state: "false" };
      return segmentConditionResults[segmentKey];
    }

    const result = simplifyCondition(segment.conditions);
    segmentConditionResults[segmentKey] = result;

    if (result.state === "partial") {
      const {
        key: _key,
        description: _description,
        promotable: _promotable,
        ...segmentForDatafile
      } = segment;
      targetedSegments[segmentKey] = {
        ...segmentForDatafile,
        conditions: result.value,
      };
    }

    return result;
  }

  function simplifyGroupSegment(
    groupSegment: GroupSegment | GroupSegment[],
  ): TargetedResult<GroupSegment | GroupSegment[]> {
    if (Array.isArray(groupSegment)) {
      return simplifyAnd(
        groupSegment.map((item) => simplifyGroupSegment(item)),
        (items) => items as GroupSegment[],
      );
    }

    if (typeof groupSegment === "string") {
      const segmentResult = simplifySegmentCondition(groupSegment);

      if (segmentResult.state !== "partial") {
        return segmentResult;
      }

      return { state: "partial", value: groupSegment };
    }

    if ("and" in groupSegment) {
      return simplifyAnd(
        groupSegment.and.map((item) => simplifyGroupSegment(item)),
        (items) => ({ and: items as GroupSegment[] }),
      );
    }

    if ("or" in groupSegment) {
      return simplifyOr(
        groupSegment.or.map((item) => simplifyGroupSegment(item)),
        (items) => ({ or: items as GroupSegment[] }),
      );
    }

    return simplifyNot(
      groupSegment.not.map((item) => simplifyGroupSegment(item)),
      (items) => ({ not: items as GroupSegment[] }),
    );
  }

  return {
    targetedSegments,
    simplifyCondition,
    simplifyGroupSegment,
  };
}

async function buildDatafileFromMessageKeys(
  projectConfig: ProjectConfig,
  datasource: Datasource,
  messageKeys: string[],
  targetKey: string | undefined,
  localeKey: string,
  revision: string,
): Promise<DatafileContent> {
  const localeKeys = await datasource.listLocales();

  const [locales, messages] = await Promise.all([
    readAll<Locale>(localeKeys, (key) => datasource.readLocale(key)),
    readAll<Message>(messageKeys, (key) => datasource.readMessage(key)),
  ]);

  const target = targetKey ? await datasource.readTarget(targetKey) : undefined;
  const datafileOptions = resolveTargetDatafileOptions(target);
  const includedMessages = target?.includeMessages?.length ? target.includeMessages : ["*"];
  const excludedMessages = target?.excludeMessages || [];
  const datafileMessages: DatafileContent["messages"] = {};
  const translations: DatafileContent["translations"] = {};
  const usedSegmentKeys = new Set<SegmentKey>();
  const segmentKeys = await datasource.listSegments();
  const segments = await readAll<Segment>(segmentKeys, (key) => datasource.readSegment(key));
  const targetSimplifier = createTargetSimplifier(segments, target?.context);

  for (const key of messageKeys) {
    const message = messages[key];

    if (!isAvailable(message)) {
      continue;
    }

    if (!matchesPattern(key, includedMessages) || matchesPattern(key, excludedMessages)) {
      continue;
    }

    const translation = resolveLocaleValue(message.translations, localeKey, locales);

    if (typeof translation === "undefined") {
      continue;
    }

    translations[key] = translation;

    const overrides = (message.overrides || [])
      .map<MessageOverride | undefined>((override) => {
        const overrideTranslation = resolveLocaleValue(override.translations, localeKey, locales);

        if (typeof overrideTranslation === "undefined") {
          return undefined;
        }

        const targetedOverride: MessageOverride = {
          key: override.key,
          translation: overrideTranslation,
        };

        if (override.conditions) {
          if (override.conditions === "*") {
            targetedOverride.conditions = override.conditions;
          } else {
            const targetedConditions = targetSimplifier.simplifyCondition(override.conditions);

            if (targetedConditions.state === "false") {
              return undefined;
            }

            if (targetedConditions.state === "partial") {
              collectConditionSegmentKeys(targetedConditions.value, usedSegmentKeys);
              targetedOverride.conditions = stringifyDatafileExpression(
                datafileOptions,
                targetedConditions.value,
              );
            }
          }
        }

        if (override.segments) {
          if (override.segments === "*") {
            targetedOverride.segments = override.segments;
          } else {
            const targetedSegments = targetSimplifier.simplifyGroupSegment(override.segments);

            if (targetedSegments.state === "false") {
              return undefined;
            }

            if (targetedSegments.state === "partial") {
              collectSegmentKeys(targetedSegments.value, usedSegmentKeys);
              targetedOverride.segments = stringifyDatafileExpression(
                datafileOptions,
                targetedSegments.value,
              );
            }
          }
        }

        return targetedOverride;
      })
      .filter((override): override is MessageOverride => Boolean(override));

    if (message.deprecated || message.deprecationWarning || message.meta || overrides.length > 0) {
      datafileMessages[key] = {
        deprecated: message.deprecated || undefined,
        deprecationWarning: message.deprecationWarning,
        meta: message.meta,
        overrides: overrides.length > 0 ? overrides : undefined,
      };
    }
  }

  const datafileSegments: Record<string, Segment> = {};
  const datafileSegmentKeys = Array.from(usedSegmentKeys).sort();

  for (const key of datafileSegmentKeys) {
    if (targetSimplifier.targetedSegments[key]) {
      const segment = targetSimplifier.targetedSegments[key];

      datafileSegments[key] = {
        ...segment,
        conditions: stringifyDatafileExpression(datafileOptions, segment.conditions),
      };
    }
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    messagevisorVersion: "0.0.1",
    revision,
    target: targetKey || "",
    locale: localeKey,
    direction: locales[localeKey]?.direction,
    formats: resolveFormats(localeKey, locales, target),
    segments: datafileSegments,
    messages: datafileMessages,
    translations,
  };
}

export async function buildDatafile(
  projectConfig: ProjectConfig,
  datasource: Datasource,
  targetKey: string | undefined,
  localeKey: string,
  revision: string,
): Promise<DatafileContent> {
  const messageKeys = await datasource.listMessages();

  return buildDatafileFromMessageKeys(
    projectConfig,
    datasource,
    messageKeys,
    targetKey,
    localeKey,
    revision,
  );
}

export async function buildMessageDatafile(
  projectConfig: ProjectConfig,
  datasource: Datasource,
  messageKey: string,
  localeKey: string,
  revision: string,
  targetKey?: string,
): Promise<DatafileContent> {
  const availableMessageKeys = await datasource.listMessages();
  const selectedMessageKeys = availableMessageKeys.includes(messageKey) ? [messageKey] : [];

  return buildDatafileFromMessageKeys(
    projectConfig,
    datasource,
    selectedMessageKeys,
    targetKey,
    localeKey,
    revision,
  );
}

export async function buildProject(
  projectConfig: ProjectConfig,
  datasource: Datasource,
  options: BuildProjectOptions = {},
) {
  const startTime = Date.now();
  const [targetKeys, localeKeys] = await Promise.all([
    datasource.listTargets(),
    datasource.listLocales(),
  ]);
  const selectedTargetKeys = options.target ? [options.target] : targetKeys;
  const builtDatafiles: DatafileContent[] = [];
  const previousRevision = await datasource.readRevision();
  let revision = options.revision;

  if (!revision) {
    const numericRevision = Number(previousRevision);
    revision = Number.isNaN(numericRevision) ? previousRevision : String(numericRevision + 1);
  }

  options.onProgress?.({
    type: "start",
    previousRevision,
    revision,
    targets: selectedTargetKeys,
  });

  for (const targetKey of selectedTargetKeys) {
    const target = await datasource.readTarget(targetKey);
    const selectedLocaleKeys = options.locale
      ? [options.locale]
      : target.locales?.length
        ? target.locales
        : localeKeys;

    options.onProgress?.({
      type: "targetStart",
      target: targetKey,
      locales: selectedLocaleKeys,
    });

    for (const localeKey of selectedLocaleKeys) {
      let datafile = await buildDatafile(projectConfig, datasource, targetKey, localeKey, revision);
      const datafileOptions = resolveTargetDatafileOptions(target);

      if (datafileOptions.revisionFromHash) {
        const content = JSON.stringify({ ...datafile, revision: "" });
        datafile = {
          ...datafile,
          revision: crypto.createHash("sha1").update(content).digest("hex"),
        };
      }

      if (options.json) {
        const pretty = options.pretty === true || datafileOptions.pretty;
        console.log(pretty ? JSON.stringify(datafile, null, 2) : JSON.stringify(datafile));
      } else {
        await datasource.writeDatafile(datafile, { pretty: datafileOptions.pretty });
      }

      builtDatafiles.push(datafile);

      options.onProgress?.({
        type: "localeBuilt",
        target: targetKey,
        locale: localeKey,
        datafile,
        filePath: path.join(
          projectConfig.datafilesDirectoryPath,
          formatDatafilePath(projectConfig, targetKey, localeKey),
        ),
        sizeInBytes: options.showSize
          ? getDatafileSizeInBytes(datafile, datafileOptions)
          : undefined,
      });
    }
  }

  if (!options.noStateFiles && !options.revision) {
    await datasource.writeRevision(revision);
  }

  options.onProgress?.({
    type: "complete",
    datafiles: builtDatafiles,
    duration: Date.now() - startTime,
    revision,
  });

  return builtDatafiles;
}

export async function buildProjectSets(
  projectConfig: ProjectConfig,
  datasource: Datasource,
  options: BuildProjectSetsOptions = {},
) {
  const startTime = Date.now();
  const setExecutions = await getProjectSetExecutions(projectConfig, datasource, options.set);
  const setKeys = setExecutions.map((execution) => execution.set);
  const builtDatafiles: DatafileContent[] = [];
  const previousRevision = await datasource.readRevision();
  const numericRevision = Number(previousRevision);
  const revision = Number.isNaN(numericRevision) ? previousRevision : String(numericRevision + 1);

  if (projectConfig.sets) {
    options.onProjectSetsProgress?.({
      type: "setsStart",
      previousRevision,
      revision,
      sets: setKeys,
    });
  }

  for (const execution of setExecutions) {
    if (projectConfig.sets) {
      options.onProjectSetsProgress?.({ type: "setStart", set: execution.set });
    }

    const datafiles = await buildProject(execution.projectConfig, execution.datasource, {
      ...options,
      onProgress: options.onProjectSetsProgress
        ? (event) =>
            options.onProjectSetsProgress?.({
              ...event,
              set: execution.set,
            } as BuildProjectSetsProgressEvent)
        : options.onProgress,
    });

    builtDatafiles.push(...datafiles);
  }

  if (projectConfig.sets && !options.noStateFiles && !options.revision) {
    await datasource.writeRevision(revision);
  }

  if (projectConfig.sets) {
    options.onProjectSetsProgress?.({
      type: "setsComplete",
      duration: Date.now() - startTime,
      revision,
      sets: setKeys,
      datafiles: builtDatafiles,
    });
  }

  return builtDatafiles;
}

function printBuildProgress(projectConfig: ProjectConfig, event: BuildProgressEvent) {
  if (event.type === "start") {
    console.log("");
    console.log(CLI_FORMAT_BOLD, `Building Messagevisor datafiles`);
    console.log(`  Starting revision: ${event.previousRevision}`);
    console.log(`  Targets:   ${event.targets.join(", ") || "(none)"}`);
    return;
  }

  if (event.type === "targetStart") {
    console.log("");
    console.log(CLI_FORMAT_BOLD, `Target "${event.target}"`);
    console.log(`  Locales: ${event.locales.join(", ") || "(none)"}`);
    return;
  }

  if (event.type === "localeBuilt") {
    const relativeFilePath = event.filePath
      ? path.relative(process.cwd(), event.filePath)
      : formatDatafilePath(projectConfig, event.target, event.locale);
    const messageCount = Object.keys(event.datafile.translations).length;
    const metadataCount = Object.keys(event.datafile.messages).length;
    const segmentCount = Object.keys(event.datafile.segments).length;
    const size =
      typeof event.sizeInBytes === "number" ? `, ${(event.sizeInBytes / 1024).toFixed(2)} kB` : "";

    console.log(
      `  ✔ ${event.locale} -> ${relativeFilePath} (${messageCount} translations, ${metadataCount} metadata entries, ${segmentCount} segments${size})`,
    );
    return;
  }

  console.log("");
  console.log(
    CLI_FORMAT_GREEN,
    `Built ${event.datafiles.length} datafile(s) in ${path.relative(process.cwd(), projectConfig.datafilesDirectoryPath) || projectConfig.datafilesDirectoryPath}`,
  );
  console.log(CLI_FORMAT_BOLD, `Revision: ${event.revision}`);
  console.log(CLI_FORMAT_BOLD, `Time:  ${prettyDuration(event.duration)}`);
}

function printProjectSetsBuildProgress(
  projectConfig: ProjectConfig,
  event: BuildProjectSetsProgressEvent,
) {
  if (event.type === "setsStart") {
    console.log("");
    console.log(CLI_FORMAT_BOLD, `Building Messagevisor sets`);
    console.log(`  Starting project revision: ${event.previousRevision}`);
    console.log(`  Sets: ${event.sets.join(", ") || "(none)"}`);
    return;
  }

  if (event.type === "setStart") {
    console.log("");
    console.log(CLI_FORMAT_BOLD, `Set "${event.set}"`);
    return;
  }

  if (event.type === "setsComplete") {
    console.log("");
    console.log(
      CLI_FORMAT_GREEN,
      `Built ${event.datafiles.length} datafile(s) across ${event.sets.length} set(s) in ${path.relative(process.cwd(), projectConfig.datafilesDirectoryPath) || projectConfig.datafilesDirectoryPath}`,
    );
    console.log(CLI_FORMAT_BOLD, `Project revision: ${event.revision}`);
    console.log(CLI_FORMAT_BOLD, `Time:  ${prettyDuration(event.duration)}`);
    return;
  }

  printBuildProgress(
    projectConfig.sets
      ? {
          ...projectConfig,
          datafilesDirectoryPath: path.join(projectConfig.datafilesDirectoryPath, event.set),
        }
      : projectConfig,
    event,
  );
}

export const buildPlugin = {
  command: "build",
  handler: async ({ projectConfig, datasource, parsed }: any) => {
    assertProjectSetJsonSelection(projectConfig, parsed.set, parsed.json);

    const datafiles = await buildProjectSets(projectConfig, datasource, {
      set: parsed.set,
      target: parsed.target,
      locale: parsed.locale,
      revision: parsed.revision,
      noStateFiles: parsed.json || parsed.stateFiles === false,
      json: parsed.json,
      pretty: parsed.pretty,
      showSize: parsed.showSize,
      onProgress: parsed.json ? undefined : (event) => printBuildProgress(projectConfig, event),
      onProjectSetsProgress: parsed.json
        ? undefined
        : (event) => printProjectSetsBuildProgress(projectConfig, event),
    });
  },
  examples: [
    { command: "build", description: "build datafiles" },
    {
      command: "build --target=web --locale=en-US",
      description: "build a single target-specific locale datafile",
    },
    { command: "build --showSize", description: "show datafile sizes in the build output" },
  ],
};
