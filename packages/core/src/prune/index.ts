import * as path from "path";

import type { CustomParser } from "@featurevisor/parsers";
import type {
  FormatPresets,
  Locale,
  Message,
  Override,
  Target,
  Translation,
} from "@messagevisor/types";

import type { ProjectConfig } from "../config";
import type { Datasource } from "../datasource";
import { mergeFormatPresets } from "../formats";
import { formatProjectPath } from "../path";
import { getProjectSetExecutions } from "../sets";
import { matchesPattern, targetIncludesMessage } from "../targeting";
import { CLI_FORMAT_BOLD, CLI_FORMAT_GREEN } from "../tester/cliFormat";

type PruneTarget = "translations" | "formats";
type EntryKind = "message" | "override" | "locale";

export interface PruneProjectOptions {
  pruneMode: PruneTarget;
  locale?: string | string[];
  target?: string | string[];
  includeMessages?: string | string[];
  excludeMessages?: string | string[];
  apply?: boolean;
}

export interface PruneEntry {
  kind: EntryKind;
  key: string;
  filePath: string;
  locale?: string;
  overrideKey?: string;
  formatPath?: string;
  inheritedFrom: string;
}

export interface PruneProjectResult {
  pruneMode: PruneTarget;
  apply: boolean;
  entries: PruneEntry[];
  changedFiles: string[];
}

function toArray(value?: string | string[]): string[] {
  if (typeof value === "undefined") {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function withoutKey<T extends Record<string, unknown>>(entity: T): T {
  const { key: _key, ...rest } = entity; // eslint-disable-line @typescript-eslint/no-unused-vars

  return rest as T;
}

function cloneWithoutKey<T extends Record<string, unknown>>(entity: T): T {
  return JSON.parse(JSON.stringify(withoutKey(entity)));
}

function assertKnownValues(label: string, requested: string[], available: string[]) {
  for (const value of requested) {
    if (!available.includes(value)) {
      throw new Error(
        `Unknown ${label} "${value}". Available ${label}s: ${available.join(", ") || "none"}.`,
      );
    }
  }
}

function getEntityFilePath(
  directoryPath: string,
  key: string,
  projectConfig: ProjectConfig,
  suffix = "",
) {
  const parser = projectConfig.parser as CustomParser;

  return formatProjectPath(
    projectConfig,
    path.join(directoryPath, ...key.split(projectConfig.namespaceCharacter)) +
      `${suffix}.${parser.extension}`,
  );
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

function resolveInheritedTranslationValue(
  translations: Record<string, Translation> | undefined,
  localeKey: string,
  locales: Record<string, Locale>,
) {
  let currentKey = locales[localeKey]?.inheritTranslationsFrom;

  while (currentKey) {
    if (translations && typeof translations[currentKey] !== "undefined") {
      return {
        value: translations[currentKey],
        inheritedFrom: currentKey,
      };
    }

    currentKey = locales[currentKey]?.inheritTranslationsFrom;
  }
}

function resolveInheritedFormats(
  localeKey: string,
  locales: Record<string, Locale>,
  cache: Map<string, FormatPresets | undefined>,
): FormatPresets | undefined {
  const cacheKey = `inherited:${localeKey}`;

  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  const chain = resolveLocaleChain(localeKey, locales, "inheritFormatsFrom").slice(0, -1);
  let formats: FormatPresets | undefined;

  for (const key of chain) {
    formats = mergeFormatPresets(formats, locales[key]?.formats);
  }

  cache.set(cacheKey, formats);
  return formats;
}

function resolveEffectiveFormatsForLocale(
  localeKey: string,
  locales: Record<string, Locale>,
  cache: Map<string, FormatPresets | undefined>,
): FormatPresets | undefined {
  const cacheKey = `effective:${localeKey}`;

  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  const effective = mergeFormatPresets(
    resolveInheritedFormats(localeKey, locales, cache),
    locales[localeKey]?.formats,
  );

  cache.set(cacheKey, effective);
  return effective;
}

function getPathValue(value: unknown, pathSegments: string[]) {
  let current = value;

  for (const segment of pathSegments) {
    if (!isPlainObject(current) || !(segment in current)) {
      return undefined;
    }

    current = current[segment];
  }

  return current;
}

function findInheritedFormatSource(
  localeKey: string,
  pathSegments: string[],
  value: unknown,
  locales: Record<string, Locale>,
  cache: Map<string, FormatPresets | undefined>,
) {
  let currentKey = locales[localeKey]?.inheritFormatsFrom;

  while (currentKey) {
    const effectiveFormats = resolveEffectiveFormatsForLocale(currentKey, locales, cache);

    if (deepEqual(getPathValue(effectiveFormats, pathSegments), value)) {
      return currentKey;
    }

    currentKey = locales[currentKey]?.inheritFormatsFrom;
  }
}

async function getSelectedLocales(
  datasource: Datasource,
  options: Pick<PruneProjectOptions, "locale" | "target">,
) {
  const requestedLocales = toArray(options.locale);
  const requestedTargets = toArray(options.target);

  const [localeKeys, targetKeys] = await Promise.all([
    datasource.listLocales(),
    datasource.listTargets(),
  ]);

  assertKnownValues("locale", requestedLocales, localeKeys);
  assertKnownValues("target", requestedTargets, targetKeys);

  if (requestedTargets.length === 0) {
    return requestedLocales.length > 0 ? requestedLocales.sort() : localeKeys;
  }

  const targets = await readAll<Target>(requestedTargets, (key) => datasource.readTarget(key));
  const selected = new Set<string>();

  for (const targetKey of requestedTargets) {
    const targetLocales = targets[targetKey].locales?.length
      ? targets[targetKey].locales || []
      : localeKeys;

    for (const locale of targetLocales) {
      if (requestedLocales.length === 0 || requestedLocales.includes(locale)) {
        selected.add(locale);
      }
    }
  }

  return Array.from(selected).sort();
}

async function getSelectedMessageKeys(
  datasource: Datasource,
  options: Pick<PruneProjectOptions, "target" | "includeMessages" | "excludeMessages">,
) {
  const requestedTargets = toArray(options.target);
  const includeMessages = toArray(options.includeMessages);
  const excludeMessages = toArray(options.excludeMessages);

  const messageKeys = await datasource.listMessages();

  if (requestedTargets.length === 0) {
    return messageKeys
      .filter((messageKey) =>
        includeMessages.length > 0 ? matchesPattern(messageKey, includeMessages) : true,
      )
      .filter((messageKey) => !matchesPattern(messageKey, excludeMessages))
      .sort();
  }

  const targets = await readAll<Target>(requestedTargets, (key) => datasource.readTarget(key));
  const selected = new Set<string>();

  for (const targetKey of requestedTargets) {
    for (const messageKey of messageKeys) {
      if (targetIncludesMessage(targets[targetKey], messageKey)) {
        selected.add(messageKey);
      }
    }
  }

  return Array.from(selected)
    .filter((messageKey) =>
      includeMessages.length > 0 ? matchesPattern(messageKey, includeMessages) : true,
    )
    .filter((messageKey) => !matchesPattern(messageKey, excludeMessages))
    .sort();
}

async function pruneTranslations(
  projectConfig: ProjectConfig,
  datasource: Datasource,
  options: PruneProjectOptions,
): Promise<PruneProjectResult> {
  const [selectedLocales, messageKeys, localeKeys] = await Promise.all([
    getSelectedLocales(datasource, options),
    getSelectedMessageKeys(datasource, options),
    datasource.listLocales(),
  ]);
  const locales = await readAll<Locale>(localeKeys, (key) => datasource.readLocale(key));
  const entries: PruneEntry[] = [];
  const changedFiles: string[] = [];

  for (const messageKey of messageKeys) {
    const message = await datasource.readMessage(messageKey);
    let updatedMessage: Message | undefined;
    let changed = false;
    const filePath = getEntityFilePath(
      projectConfig.messagesDirectoryPath,
      messageKey,
      projectConfig,
    );

    for (const locale of Object.keys(message.translations || {}).sort()) {
      if (!selectedLocales.includes(locale)) {
        continue;
      }

      const explicitValue = message.translations[locale];
      const inherited = resolveInheritedTranslationValue(message.translations, locale, locales);

      if (typeof inherited?.value !== "undefined" && inherited.value === explicitValue) {
        entries.push({
          kind: "message",
          key: messageKey,
          filePath,
          locale,
          inheritedFrom: inherited.inheritedFrom,
        });

        if (options.apply) {
          updatedMessage =
            updatedMessage ||
            (cloneWithoutKey(message as unknown as Record<string, unknown>) as unknown as Message);
          delete updatedMessage.translations[locale];
          changed = true;
        }
      }
    }

    for (let index = 0; index < (message.overrides || []).length; index++) {
      const override = (message.overrides || [])[index] as Override;

      for (const locale of Object.keys(override.translations || {}).sort()) {
        if (!selectedLocales.includes(locale)) {
          continue;
        }

        const explicitValue = override.translations[locale];
        const inherited = resolveInheritedTranslationValue(override.translations, locale, locales);

        if (typeof inherited?.value !== "undefined" && inherited.value === explicitValue) {
          entries.push({
            kind: "override",
            key: messageKey,
            overrideKey: override.key,
            filePath,
            locale,
            inheritedFrom: inherited.inheritedFrom,
          });

          if (options.apply) {
            updatedMessage =
              updatedMessage ||
              (cloneWithoutKey(
                message as unknown as Record<string, unknown>,
              ) as unknown as Message);
            delete (updatedMessage.overrides || [])[index].translations[locale];
            changed = true;
          }
        }
      }
    }

    if (options.apply && changed && updatedMessage) {
      await datasource.writeMessage(messageKey, updatedMessage);
      changedFiles.push(filePath);
    }
  }

  return {
    pruneMode: "translations",
    apply: options.apply === true,
    entries,
    changedFiles,
  };
}

function pruneFormatDuplicates(
  currentValue: Record<string, unknown>,
  inheritedValue: Record<string, unknown> | undefined,
  localeKey: string,
  filePath: string,
  locales: Record<string, Locale>,
  cache: Map<string, FormatPresets | undefined>,
  entries: PruneEntry[],
) {
  let changed = false;

  for (const typeKey of Object.keys(currentValue)) {
    const localStyles = currentValue[typeKey];
    const inheritedStyles = isPlainObject(inheritedValue) ? inheritedValue[typeKey] : undefined;

    if (!isPlainObject(localStyles)) {
      continue;
    }

    for (const styleKey of Object.keys(localStyles)) {
      const stylePath = [typeKey, styleKey];
      const localStyle = localStyles[styleKey];
      const inheritedStyle = isPlainObject(inheritedStyles) ? inheritedStyles[styleKey] : undefined;

      if (deepEqual(localStyle, inheritedStyle)) {
        const inheritedFrom =
          findInheritedFormatSource(localeKey, stylePath, localStyle, locales, cache) ||
          locales[localeKey]?.inheritFormatsFrom ||
          "unknown";

        entries.push({
          kind: "locale",
          key: localeKey,
          filePath,
          formatPath: stylePath.join("."),
          inheritedFrom,
        });
        delete localStyles[styleKey];
        changed = true;
      }
    }

    if (Object.keys(localStyles).length === 0) {
      delete currentValue[typeKey];
      changed = true;
    }
  }

  return changed;
}

async function pruneFormats(
  projectConfig: ProjectConfig,
  datasource: Datasource,
  options: PruneProjectOptions,
): Promise<PruneProjectResult> {
  const selectedLocales = await getSelectedLocales(datasource, options);
  const localeKeys = await datasource.listLocales();
  const locales = await readAll<Locale>(localeKeys, (key) => datasource.readLocale(key));
  const cache = new Map<string, FormatPresets | undefined>();
  const entries: PruneEntry[] = [];
  const changedFiles: string[] = [];

  for (const localeKey of selectedLocales) {
    const locale = locales[localeKey];

    if (!locale?.formats || !isPlainObject(locale.formats)) {
      continue;
    }

    const inheritedFormats = resolveInheritedFormats(localeKey, locales, cache);

    if (!isPlainObject(inheritedFormats)) {
      continue;
    }

    const filePath = getEntityFilePath(
      projectConfig.localesDirectoryPath,
      localeKey,
      projectConfig,
    );
    const updatedLocale = cloneWithoutKey(locale as Record<string, unknown>) as Locale;
    const localeEntriesStart = entries.length;
    const changed = pruneFormatDuplicates(
      updatedLocale.formats as Record<string, unknown>,
      inheritedFormats as Record<string, unknown>,
      localeKey,
      filePath,
      locales,
      cache,
      entries,
    );

    if (!changed) {
      entries.splice(localeEntriesStart);
      continue;
    }

    if (isPlainObject(updatedLocale.formats) && Object.keys(updatedLocale.formats).length === 0) {
      delete updatedLocale.formats;
    }

    if (options.apply) {
      await datasource.writeLocale(localeKey, updatedLocale);
      changedFiles.push(filePath);
    }
  }

  return {
    pruneMode: "formats",
    apply: options.apply === true,
    entries,
    changedFiles,
  };
}

export async function pruneProject(
  projectConfig: ProjectConfig,
  datasource: Datasource,
  options: PruneProjectOptions,
) {
  if (options.pruneMode === "translations") {
    return pruneTranslations(projectConfig, datasource, options);
  }

  return pruneFormats(projectConfig, datasource, options);
}

function printPruneResult(result: PruneProjectResult, set?: string) {
  console.log("");
  if (set) {
    console.log(`Set "${set}":`);
  }
  console.log(CLI_FORMAT_BOLD, "Prune Messagevisor project");
  console.log(`  Target: ${result.pruneMode}`);
  console.log(`  Mode:   ${result.apply ? "apply" : "preview"}`);
  console.log(`  Entries: ${result.entries.length}`);
  console.log(`  Files:   ${new Set(result.entries.map((entry) => entry.filePath)).size}`);
  if (result.apply) {
    console.log(`  Updated: ${result.changedFiles.length}`);
  }
  console.log("");

  if (result.entries.length === 0) {
    console.log(CLI_FORMAT_GREEN, `No prune-able ${result.pruneMode} found.`);
    return;
  }

  const grouped = new Map<string, PruneEntry[]>();

  for (const entry of result.entries) {
    const label =
      entry.kind === "override" ? `${entry.key} (override ${entry.overrideKey})` : entry.key;
    const groupKey = `${entry.filePath}:::${label}`;
    const existing = grouped.get(groupKey) || [];
    existing.push(entry);
    grouped.set(groupKey, existing);
  }

  for (const [groupKey, entries] of Array.from(grouped.entries())) {
    const [filePath, label] = groupKey.split(":::");
    console.log(CLI_FORMAT_BOLD, `${label}`);
    console.log(`  ${filePath}`);

    for (const entry of entries) {
      if (result.pruneMode === "translations") {
        console.log(
          `  - locale ${entry.locale} duplicates inherited value from ${entry.inheritedFrom}`,
        );
      } else {
        console.log(
          `  - formats.${entry.formatPath} duplicates inherited value from ${entry.inheritedFrom}`,
        );
      }
    }

    console.log("");
  }

  console.log(
    CLI_FORMAT_GREEN,
    result.apply
      ? `Prune applied: ${result.entries.length} entries across ${result.changedFiles.length} files`
      : `Prune preview complete: ${result.entries.length} entries across ${
          new Set(result.entries.map((entry) => entry.filePath)).size
        } files`,
  );
}

function getTarget(parsed: Record<string, unknown>): PruneTarget {
  const selected = ["translations", "formats"].filter((key) =>
    Boolean(parsed[key]),
  ) as PruneTarget[];

  if (selected.length === 0) {
    throw new Error("Pass exactly one of --translations or --formats.");
  }

  if (selected.length > 1) {
    throw new Error("Pass exactly one of --translations or --formats.");
  }

  return selected[0];
}

export const prunePlugin = {
  command: "prune",
  handler: async ({ projectConfig, datasource, parsed }: any) => {
    try {
      const pruneMode = getTarget(parsed);
      const executions = await getProjectSetExecutions(projectConfig, datasource, parsed.set);
      const options = {
        pruneMode,
        locale: parsed.locale,
        target: parsed.target,
        includeMessages: parsed.includeMessages,
        excludeMessages: parsed.excludeMessages,
        apply: parsed.apply === true || parsed.apply === "true",
      };

      for (const execution of executions) {
        const result = await pruneProject(execution.projectConfig, execution.datasource, options);
        printPruneResult(result, projectConfig.sets ? execution.set : undefined);
      }
    } catch (error) {
      if (error instanceof Error) {
        console.error(error.message);
        return false;
      }

      throw error;
    }
  },
  examples: [
    {
      command: "prune --translations",
      description: "preview prune-able inherited message translations",
    },
    {
      command: "prune --translations --target=web --apply",
      description: "apply pruning for inherited translations affecting a target",
    },
    {
      command: "prune --formats --locale=en-US",
      description: "preview prune-able inherited locale formats",
    },
  ],
};
