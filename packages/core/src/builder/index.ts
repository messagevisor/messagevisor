/* eslint-disable @typescript-eslint/no-unused-vars */
import * as crypto from "crypto";
import * as path from "path";

import type {
  DatafileContent,
  Condition,
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
import { mergeFormatPresets } from "../formats";
import { extractIcuStyleReferences } from "../icuStyleReferences";
import { formatProjectPath } from "../path";
import { assertProjectSetJsonSelection, getProjectSetExecutions } from "../sets";
import { CLI_FORMAT_BOLD, CLI_FORMAT_GREEN } from "../tester/cliFormat";
import { prettyDuration } from "../tester/prettyDuration";
import { matchesPattern, targetIncludesMessage } from "../targeting";
import { createTargetContextSpecializer } from "./applyContextToTarget";

interface TargetDatafileOptions {
  stringify: boolean;
  pretty: boolean;
  revisionFromHash: boolean;
}

type FormatPatterns = Partial<Record<keyof FormatPresets, string | string[]>>;
type UsedFormatPatterns = Partial<Record<keyof FormatPresets, string[]>>;

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

export function mergeFormats(
  parent?: FormatPresets,
  child?: FormatPresets,
): FormatPresets | undefined {
  return mergeFormatPresets(parent, child);
}

function formatTypeKeys(formats: FormatPresets | undefined) {
  return Object.keys(formats || {}) as Array<keyof FormatPresets>;
}

function filterFormats(
  formats: FormatPresets | undefined,
  target?: Target,
  usedFormatPatterns?: UsedFormatPatterns,
): FormatPresets | undefined {
  if (!formats) {
    return undefined;
  }

  const includeFormats: FormatPatterns | undefined = target?.includeOnlyUsedFormats
    ? usedFormatPatterns
    : target?.includeFormats;
  const excludeFormats = target?.includeOnlyUsedFormats ? undefined : target?.excludeFormats;

  if (target?.includeOnlyUsedFormats && !includeFormats) {
    return undefined;
  }

  if (!includeFormats && !excludeFormats) {
    return formats;
  }

  const result: FormatPresets = {};

  for (const typeKey of formatTypeKeys(formats)) {
    const styles = formats[typeKey];

    if (!styles || typeof styles !== "object") {
      continue;
    }

    const includePatterns = includeFormats?.[typeKey];
    const excludePatterns = excludeFormats?.[typeKey];
    const filteredStyles = Object.fromEntries(
      Object.entries(styles).filter(([styleKey]) => {
        const included = includeFormats ? matchesPattern(styleKey, includePatterns) : true;
        const excluded = matchesPattern(styleKey, excludePatterns);

        return included && !excluded;
      }),
    );

    if (Object.keys(filteredStyles).length > 0) {
      (result as Record<string, unknown>)[typeKey] = filteredStyles;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
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
  usedFormatPatterns?: UsedFormatPatterns,
): FormatPresets | undefined {
  const chain = resolveLocaleChain(localeKey, locales, "inheritFormatsFrom");
  let formats: FormatPresets | undefined;

  for (const key of chain) {
    formats = mergeFormats(formats, locales[key]?.formats);
  }

  return filterFormats(
    mergeFormats(formats, target?.formats?.[localeKey]),
    target,
    usedFormatPatterns,
  );
}

function addUsedIcuFormatPatterns(result: UsedFormatPatterns, translation: string) {
  for (const reference of extractIcuStyleReferences(translation)) {
    if (reference.isSkeleton) {
      continue;
    }

    const type = reference.type as keyof FormatPresets;
    const styles = result[type] || [];

    if (!styles.includes(reference.style)) {
      styles.push(reference.style);
    }

    result[type] = styles;
  }
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
  const datafileMessages: DatafileContent["messages"] = {};
  const translations: DatafileContent["translations"] = {};
  const usedSegmentKeys = new Set<SegmentKey>();
  const usedFormatPatterns: UsedFormatPatterns = {};
  const segmentKeys = await datasource.listSegments();
  const segments = await readAll<Segment>(segmentKeys, (key) => datasource.readSegment(key));
  const targetSimplifier = createTargetContextSpecializer(segments, target?.context);

  for (const key of messageKeys) {
    const message = messages[key];

    if (!isAvailable(message)) {
      continue;
    }

    if (!targetIncludesMessage(target, key)) {
      continue;
    }

    const translation = resolveLocaleValue(message.translations, localeKey, locales);

    if (typeof translation === "undefined") {
      continue;
    }

    translations[key] = translation;

    if (target?.includeOnlyUsedFormats) {
      addUsedIcuFormatPatterns(usedFormatPatterns, translation);
    }

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
            const targetedConditions = targetSimplifier.applyContextToCondition(
              override.conditions,
            );

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
            const targetedSegments = targetSimplifier.applyContextToGroupSegment(override.segments);

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

        if (target?.includeOnlyUsedFormats) {
          addUsedIcuFormatPatterns(usedFormatPatterns, overrideTranslation);
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
    if (targetSimplifier.specializedSegments[key]) {
      const segment = targetSimplifier.specializedSegments[key];

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
    formats: resolveFormats(localeKey, locales, target, usedFormatPatterns),
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
      ? formatProjectPath(projectConfig, event.filePath)
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
    `Built ${event.datafiles.length} datafile(s) in ${formatProjectPath(projectConfig, projectConfig.datafilesDirectoryPath)}`,
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
      `Built ${event.datafiles.length} datafile(s) across ${event.sets.length} set(s) in ${formatProjectPath(projectConfig, projectConfig.datafilesDirectoryPath)}`,
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
