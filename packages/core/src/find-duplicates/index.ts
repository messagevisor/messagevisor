import type { Locale, Message, Translation } from "@messagevisor/types";

import type { ProjectConfig } from "../config";
import type { Datasource } from "../datasource";
import { MessagevisorCLIError, printMessagevisorCLIError } from "../error";
import { getProjectSetExecutions } from "../sets";
import { CLI_FORMAT_BOLD, CLI_FORMAT_CYAN, CLI_FORMAT_GREEN, colorize } from "../tester/cliFormat";

export interface FindDuplicatesOptions {
  set?: string;
  locale?: string;
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

export interface DuplicateTranslationLocaleResult {
  locale: string;
  duplicateValues: DuplicateTranslationValue[];
}

export interface DuplicateTranslationSetResult {
  set: string | null;
  locales: DuplicateTranslationLocaleResult[];
}

export interface FindDuplicatesResult {
  summary: {
    sets: number;
    locales: number;
    duplicateValues: number;
    duplicateMessageKeys: number;
  };
  results: DuplicateTranslationSetResult[];
}

interface ResolvedTranslation {
  value: string;
  sourceLocale: string;
}

async function readAll<T>(
  keys: string[],
  read: (key: string) => Promise<T>,
): Promise<Record<string, T>> {
  const entries = await Promise.all(keys.map(async (key) => [key, await read(key)] as const));
  return Object.fromEntries(entries);
}

function resolveLocaleChain(localeKey: string, locales: Record<string, Locale>) {
  const chain: string[] = [];
  const seen = new Set<string>();
  let currentKey: string | undefined = localeKey;

  while (currentKey && !seen.has(currentKey)) {
    seen.add(currentKey);
    chain.unshift(currentKey);
    currentKey = locales[currentKey]?.inheritTranslationsFrom;
  }

  return chain;
}

function resolveTranslation(
  translations: Record<string, Translation> | undefined,
  localeKey: string,
  locales: Record<string, Locale>,
): ResolvedTranslation | undefined {
  const candidates = resolveLocaleChain(localeKey, locales).reverse();

  for (const candidate of candidates) {
    if (typeof translations?.[candidate] !== "undefined") {
      return {
        value: translations[candidate],
        sourceLocale: candidate,
      };
    }
  }
}

function isAvailable(message: Message) {
  return !message.archived;
}

function hasContent(value: string) {
  return value.trim().length > 0;
}

function toDuplicateLocaleResult(
  locale: string,
  messages: Record<string, Message>,
  locales: Record<string, Locale>,
): DuplicateTranslationLocaleResult {
  const entriesByValue = new Map<string, DuplicateTranslationSource[]>();

  for (const [messageKey, message] of Object.entries(messages)) {
    if (!isAvailable(message)) {
      continue;
    }

    const resolved = resolveTranslation(message.translations, locale, locales);

    if (!resolved || !hasContent(resolved.value)) {
      continue;
    }

    const existing = entriesByValue.get(resolved.value) || [];
    existing.push({
      messageKey,
      locale: resolved.sourceLocale,
    });
    entriesByValue.set(resolved.value, existing);
  }

  const duplicateValues = Array.from(entriesByValue.entries())
    .filter(([, entries]) => entries.length > 1)
    .map(([value, sources]) => ({
      value,
      messageKeys: sources.map((source) => source.messageKey).sort(),
      sources: sources
        .slice()
        .sort(
          (a, b) => a.messageKey.localeCompare(b.messageKey) || a.locale.localeCompare(b.locale),
        ),
    }))
    .sort((a, b) => a.value.localeCompare(b.value));

  return {
    locale,
    duplicateValues,
  };
}

async function findDuplicatesInDatasource(
  datasource: Datasource,
  set: string | null,
  options: Pick<FindDuplicatesOptions, "locale">,
): Promise<DuplicateTranslationSetResult> {
  const [localeKeys, messageKeys] = await Promise.all([
    datasource.listLocales(),
    datasource.listMessages(),
  ]);

  if (options.locale && !localeKeys.includes(options.locale)) {
    throw new MessagevisorCLIError(
      `Unknown locale "${options.locale}". Available locales: ${localeKeys.join(", ") || "none"}.`,
    );
  }

  const selectedLocales = options.locale ? [options.locale] : localeKeys;
  const [locales, messages] = await Promise.all([
    readAll<Locale>(localeKeys, (key) => datasource.readLocale(key)),
    readAll<Message>(messageKeys, (key) => datasource.readMessage(key)),
  ]);

  return {
    set,
    locales: selectedLocales
      .map((locale) => toDuplicateLocaleResult(locale, messages, locales))
      .filter((result) => result.duplicateValues.length > 0),
  };
}

function summarize(results: DuplicateTranslationSetResult[]): FindDuplicatesResult["summary"] {
  const duplicateValues = results.reduce(
    (sum, result) =>
      sum +
      result.locales.reduce((localeSum, locale) => localeSum + locale.duplicateValues.length, 0),
    0,
  );
  const duplicateMessageKeys = results.reduce(
    (sum, result) =>
      sum +
      result.locales.reduce(
        (localeSum, locale) =>
          localeSum +
          locale.duplicateValues.reduce(
            (valueSum, duplicate) => valueSum + duplicate.messageKeys.length,
            0,
          ),
        0,
      ),
    0,
  );

  return {
    sets: results.length,
    locales: results.reduce((sum, result) => sum + result.locales.length, 0),
    duplicateValues,
    duplicateMessageKeys,
  };
}

export async function findDuplicateTranslations(
  projectConfig: ProjectConfig,
  datasource: Datasource,
  options: FindDuplicatesOptions = {},
): Promise<FindDuplicatesResult> {
  if (!projectConfig.sets && options.set) {
    throw new MessagevisorCLIError("Option --set can only be used when project sets are enabled.");
  }

  const executions = await getProjectSetExecutions(projectConfig, datasource, options.set);
  const results = await Promise.all(
    executions.map((execution) =>
      findDuplicatesInDatasource(
        execution.datasource,
        projectConfig.sets ? execution.set : null,
        options,
      ),
    ),
  );

  return {
    summary: summarize(results),
    results,
  };
}

function printDuplicateSources(locale: string, duplicate: DuplicateTranslationValue) {
  for (const source of duplicate.sources) {
    const inheritedSuffix = source.locale !== locale ? colorize(` (from ${source.locale})`, 2) : "";
    console.log(`    - ${colorize(source.messageKey, 1)}${inheritedSuffix}`);
  }
}

function printPlainResult(result: FindDuplicatesResult, hasSets: boolean) {
  console.log("");
  console.log(CLI_FORMAT_BOLD, "Finding duplicate Messagevisor translations");
  console.log(`  Sets:              ${result.summary.sets}`);
  console.log(`  Locales:           ${result.summary.locales}`);
  console.log(`  Duplicate values:  ${result.summary.duplicateValues}`);
  console.log(`  Message key hits:  ${result.summary.duplicateMessageKeys}`);
  console.log("");

  if (result.summary.duplicateValues === 0) {
    console.log(CLI_FORMAT_GREEN, "No duplicate translations found.");
    return;
  }

  for (const setResult of result.results) {
    if (setResult.locales.length === 0) {
      continue;
    }

    if (hasSets) {
      console.log(CLI_FORMAT_BOLD, `Set "${setResult.set}"`);
    }

    for (const localeResult of setResult.locales) {
      console.log(CLI_FORMAT_CYAN, `Locale "${localeResult.locale}"`);

      for (const duplicate of localeResult.duplicateValues) {
        console.log(`  ${colorize(JSON.stringify(duplicate.value), 33)}`);
        printDuplicateSources(localeResult.locale, duplicate);
      }

      console.log("");
    }
  }

  console.log(
    CLI_FORMAT_GREEN,
    `Duplicate scan complete: ${result.summary.duplicateValues} value(s) across ${result.summary.locales} locale(s).`,
  );
}

export const findDuplicatesPlugin = {
  command: "find-duplicates",
  handler: async ({ projectConfig, datasource, parsed }: any) => {
    try {
      const result = await findDuplicateTranslations(projectConfig, datasource, {
        set: parsed.set,
        locale: parsed.locale,
      });

      if (parsed.json) {
        console.log(parsed.pretty ? JSON.stringify(result, null, 2) : JSON.stringify(result));
        return;
      }

      printPlainResult(result, projectConfig.sets);
    } catch (error) {
      if (printMessagevisorCLIError(error)) {
        return false;
      }

      throw error;
    }
  },
  examples: [
    { command: "find-duplicates", description: "find duplicate translation values" },
    {
      command: "find-duplicates --locale=en-US",
      description: "find duplicates for one locale",
    },
    {
      command: "find-duplicates --set=staging",
      description: "find duplicates in one set",
    },
    {
      command: "find-duplicates --locale=en-US --json --pretty",
      description: "print duplicate translations as JSON",
    },
  ],
};
