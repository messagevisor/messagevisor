import * as fs from "fs";
import * as path from "path";

import type { Locale, Message, Target, Translation } from "@messagevisor/types";

import type { ProjectConfig } from "../config";
import type { Datasource } from "../datasource";
import { MessagevisorCLIError, printMessagevisorCLIError } from "../error";
import { getProjectSetExecutions } from "../sets";
import { matchesPattern, targetIncludesMessage } from "../targeting";

export interface ExportProjectOptions {
  set?: string | string[];
  locale?: string | string[];
  target?: string | string[];
  includeMessages?: string | string[];
  excludeMessages?: string | string[];
  excludeOverrides?: boolean;
  withoutDescription?: boolean;
  withoutStatus?: boolean;
  onlyUntranslated?: boolean;
  onlyDirectlyUntranslated?: boolean;
  print?: boolean;
  output?: string;
  force?: boolean;
  delimiter?: string;
  bom?: boolean;
  lineEnding?: "lf" | "crlf";
  now?: Date;
  allowMissingLocales?: boolean;
}

type TranslationStatus = "direct" | "inherited" | "missing";

interface ExportRow {
  set?: string;
  messageKey: string;
  isOverride: boolean;
  messageDescription?: string;
  translations: Record<string, string>;
  statuses: Record<string, TranslationStatus>;
}

export interface ExportProjectResult {
  csv: string;
  filePath?: string;
  rows: ExportRow[];
  locales: string[];
  summary: {
    messageRows: number;
    overrideRows: number;
    totalRows: number;
    locales: string[];
    sets: string[];
  };
}

function toArray(value?: string | string[]): string[] {
  if (typeof value === "undefined") return [];
  return Array.isArray(value) ? value : [value];
}

async function readAll<T>(
  keys: string[],
  read: (key: string) => Promise<T>,
): Promise<Record<string, T>> {
  const entries = await Promise.all(keys.map(async (key) => [key, await read(key)] as const));
  return Object.fromEntries(entries);
}

function isAvailable(message: Message) {
  return !message.archived;
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

function resolveTranslationStatus(
  translations: Record<string, Translation> | undefined,
  localeKey: string,
  locales: Record<string, Locale>,
): {
  value: string;
  status: TranslationStatus;
} {
  if (typeof translations?.[localeKey] !== "undefined") {
    return {
      value: translations[localeKey],
      status: "direct",
    };
  }

  const candidates = resolveLocaleChain(localeKey, locales).reverse();

  for (const candidate of candidates) {
    if (translations && typeof translations[candidate] !== "undefined") {
      return {
        value: translations[candidate],
        status: "inherited",
      };
    }
  }

  return {
    value: "",
    status: "missing",
  };
}

function resolveTranslation(
  translations: Record<string, Translation> | undefined,
  localeKey: string,
  locales: Record<string, Locale>,
) {
  const result = resolveTranslationStatus(translations, localeKey, locales);

  return result.status === "missing" ? undefined : result.value;
}

function csvEscape(value: unknown, delimiter: string) {
  const stringValue = typeof value === "undefined" || value === null ? "" : String(value);
  const needsEscaping =
    stringValue.includes(delimiter) || stringValue.includes('"') || /[\n\r]/.test(stringValue);

  if (needsEscaping) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

export function toCsv(
  headers: string[],
  rows: string[][],
  options: {
    delimiter?: string;
    bom?: boolean;
    lineEnding?: "lf" | "crlf";
  } = {},
) {
  const delimiter = options.delimiter || ",";
  const lineEnding = options.lineEnding === "crlf" ? "\r\n" : "\n";
  const csv = [headers, ...rows]
    .map((row) => row.map((value) => csvEscape(value, delimiter)).join(delimiter))
    .join(lineEnding);

  return options.bom ? `\uFEFF${csv}` : csv;
}

function formatTimestamp(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "T",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
}

async function getExportFilePath(
  projectConfig: ProjectConfig,
  options: {
    now?: Date;
    output?: string;
    force?: boolean;
  },
) {
  if (options.output) {
    const projectRootDirectoryPath = path.dirname(projectConfig.exportsDirectoryPath);
    const filePath = path.isAbsolute(options.output)
      ? options.output
      : path.join(projectRootDirectoryPath, options.output);

    if (!options.force && fs.existsSync(filePath)) {
      throw new MessagevisorCLIError(
        `Export output file already exists: ${filePath}. Pass --force to overwrite.`,
      );
    }

    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });

    return filePath;
  }

  await fs.promises.mkdir(projectConfig.exportsDirectoryPath, { recursive: true });

  const timestamp = formatTimestamp(options.now || new Date());
  let index = 0;

  while (true) {
    const suffix = index === 0 ? "" : `-${index}`;
    const filePath = path.join(
      projectConfig.exportsDirectoryPath,
      `messagevisor-export-${timestamp}${suffix}.csv`,
    );

    if (!fs.existsSync(filePath)) {
      return filePath;
    }

    index++;
  }
}

function assertKnownValues(label: string, requested: string[], available: string[]) {
  for (const value of requested) {
    if (!available.includes(value)) {
      throw new MessagevisorCLIError(
        `Unknown ${label} "${value}". Available ${label}s: ${available.join(", ") || "none"}.`,
      );
    }
  }
}

function addLocale(locales: string[], locale: string) {
  if (!locales.includes(locale)) {
    locales.push(locale);
  }
}

function shouldIncludeForUntranslatedFilter(
  translations: Record<string, Translation> | undefined,
  locales: Record<string, Locale>,
  selectedLocales: string[],
  options: ExportProjectOptions,
) {
  if (!options.onlyUntranslated && !options.onlyDirectlyUntranslated) {
    return true;
  }

  return selectedLocales.some((locale) => {
    if (options.onlyDirectlyUntranslated) {
      return typeof translations?.[locale] === "undefined";
    }

    return typeof resolveTranslation(translations, locale, locales) === "undefined";
  });
}

async function collectRows(
  projectConfig: ProjectConfig,
  datasource: Datasource,
  options: ExportProjectOptions,
  set?: string,
) {
  const requestedLocales = toArray(options.locale);
  const requestedTargets = toArray(options.target);
  const includeMessages = toArray(options.includeMessages);
  const excludeMessages = toArray(options.excludeMessages);

  const [localeKeys, targetKeys, messageKeys] = await Promise.all([
    datasource.listLocales(),
    datasource.listTargets(),
    datasource.listMessages(),
  ]);

  const datasourceLocales = options.allowMissingLocales
    ? requestedLocales.filter((locale) => localeKeys.includes(locale))
    : requestedLocales;

  if (!options.allowMissingLocales) {
    assertKnownValues("locale", requestedLocales, localeKeys);
  }
  assertKnownValues("target", requestedTargets, targetKeys);

  const [locales, targets, messages] = await Promise.all([
    readAll<Locale>(localeKeys, (key) => datasource.readLocale(key)),
    readAll<Target>(targetKeys, (key) => datasource.readTarget(key)),
    readAll<Message>(messageKeys, (key) => datasource.readMessage(key)),
  ]);

  const selectedMessageKeys = new Set<string>();
  const selectedLocales: string[] = [];

  if (requestedTargets.length > 0) {
    for (const targetKey of requestedTargets) {
      const target = targets[targetKey];
      const targetLocales = target.locales?.length ? target.locales : localeKeys;

      for (const locale of targetLocales) {
        if (datasourceLocales.length === 0 || datasourceLocales.includes(locale)) {
          addLocale(selectedLocales, locale);
        }
      }

      for (const messageKey of messageKeys) {
        if (targetIncludesMessage(target, messageKey)) {
          selectedMessageKeys.add(messageKey);
        }
      }
    }
  } else {
    messageKeys.forEach((key) => selectedMessageKeys.add(key));
  }

  if (includeMessages.length > 0) {
    for (const messageKey of Array.from(selectedMessageKeys)) {
      if (!matchesPattern(messageKey, includeMessages)) {
        selectedMessageKeys.delete(messageKey);
      }
    }
  }

  for (const messageKey of Array.from(selectedMessageKeys)) {
    if (matchesPattern(messageKey, excludeMessages)) {
      selectedMessageKeys.delete(messageKey);
    }
  }

  if (selectedLocales.length === 0 && requestedTargets.length === 0) {
    for (const locale of requestedLocales.length > 0 ? datasourceLocales : localeKeys) {
      addLocale(selectedLocales, locale);
    }
  }

  const rows: ExportRow[] = [];

  function createRow(
    messageKey: string,
    description: string | undefined,
    translations: Record<string, Translation> | undefined,
    isOverride: boolean,
  ) {
    if (!shouldIncludeForUntranslatedFilter(translations, locales, selectedLocales, options)) {
      return;
    }

    rows.push({
      set,
      messageKey,
      isOverride,
      messageDescription: options.withoutDescription ? undefined : description || "",
      translations: Object.fromEntries(
        selectedLocales.map((locale) => [
          locale,
          resolveTranslationStatus(translations, locale, locales).value,
        ]),
      ),
      statuses: Object.fromEntries(
        selectedLocales.map((locale) => [
          locale,
          resolveTranslationStatus(translations, locale, locales).status,
        ]),
      ) as Record<string, TranslationStatus>,
    });
  }

  for (const messageKey of Array.from(selectedMessageKeys).sort()) {
    const message = messages[messageKey];

    if (!message || !isAvailable(message)) {
      continue;
    }

    const messageDescription = message.summary ?? message.description;

    createRow(messageKey, messageDescription, message.translations, false);

    if (options.excludeOverrides) {
      continue;
    }

    for (const override of message.overrides || []) {
      const overrideDescription = override.summary ?? override.description;

      createRow(
        `${messageKey}${projectConfig.exportOverrideKeySeparator}${override.key}`,
        overrideDescription,
        override.translations,
        true,
      );
    }
  }

  return {
    rows,
    locales: selectedLocales,
  };
}

function createCsv(
  rows: ExportRow[],
  locales: string[],
  options: ExportProjectOptions,
  withSets: boolean,
) {
  const localeHeaders = locales.flatMap((locale) =>
    options.withoutStatus ? [locale] : [locale, `${locale}Status`],
  );
  const headers = [
    ...(withSets ? ["set"] : []),
    "messageKey",
    ...(options.withoutDescription ? [] : ["messageDescription"]),
    ...localeHeaders,
  ];

  return toCsv(
    headers,
    rows.map((row) => [
      ...(withSets ? [row.set || ""] : []),
      row.messageKey,
      ...(options.withoutDescription ? [] : [row.messageDescription || ""]),
      ...locales.flatMap((locale) =>
        options.withoutStatus
          ? [row.translations[locale] || ""]
          : [row.translations[locale] || "", row.statuses[locale] || "missing"],
      ),
    ]),
    {
      delimiter: options.delimiter,
      bom: options.bom,
      lineEnding: options.lineEnding,
    },
  );
}

function createExportSummary(rows: ExportRow[], locales: string[]) {
  return {
    messageRows: rows.filter((row) => !row.isOverride).length,
    overrideRows: rows.filter((row) => row.isOverride).length,
    totalRows: rows.length,
    locales,
    sets: Array.from(
      new Set(rows.map((row) => row.set).filter((set): set is string => Boolean(set))),
    ),
  };
}

async function finishExport(
  projectConfig: ProjectConfig,
  rows: ExportRow[],
  locales: string[],
  options: ExportProjectOptions,
  withSets: boolean,
): Promise<ExportProjectResult> {
  const csv = createCsv(rows, locales, options, withSets);
  const summary = createExportSummary(rows, locales);

  if (options.print) {
    return {
      csv,
      rows,
      locales,
      summary,
    };
  }

  const filePath = await getExportFilePath(projectConfig, options);
  await fs.promises.writeFile(filePath, csv);

  return {
    csv,
    filePath,
    rows,
    locales,
    summary,
  };
}

function assertExportOptions(options: ExportProjectOptions) {
  if (options.onlyUntranslated && options.onlyDirectlyUntranslated) {
    throw new MessagevisorCLIError(
      "Use either --onlyUntranslated or --onlyDirectlyUntranslated, not both.",
    );
  }

  if (typeof options.delimiter !== "undefined" && options.delimiter.length !== 1) {
    throw new MessagevisorCLIError("--delimiter must be a single character.");
  }

  if (options.print && options.output) {
    throw new MessagevisorCLIError("Use either --print or --output, not both.");
  }
}

export async function exportProject(
  projectConfig: ProjectConfig,
  datasource: Datasource,
  options: ExportProjectOptions = {},
): Promise<ExportProjectResult> {
  assertExportOptions(options);

  if (!projectConfig.sets && toArray(options.set).length > 0) {
    throw new MessagevisorCLIError("--set can only be used when `sets: true` is configured.");
  }

  const collected = await collectRows(projectConfig, datasource, options);

  return finishExport(projectConfig, collected.rows, collected.locales, options, false);
}

export async function exportProjectSets(
  projectConfig: ProjectConfig,
  datasource: Datasource,
  options: ExportProjectOptions = {},
): Promise<ExportProjectResult> {
  assertExportOptions(options);

  if (!projectConfig.sets) {
    return exportProject(projectConfig, datasource, options);
  }

  const executions = await getProjectSetExecutions(projectConfig, datasource, undefined);
  const requestedSets = toArray(options.set);
  const selectedExecutions =
    requestedSets.length > 0
      ? executions.filter((execution) => requestedSets.includes(execution.set))
      : executions;

  assertKnownValues(
    "set",
    requestedSets,
    executions.map((execution) => execution.set),
  );

  const rows: ExportRow[] = [];
  const requestedLocales = toArray(options.locale);
  const locales: string[] = [];
  const availableLocales: string[] = [];

  for (const execution of selectedExecutions) {
    const localeKeys = await execution.datasource.listLocales();
    localeKeys.forEach((locale) => addLocale(availableLocales, locale));
  }

  assertKnownValues("locale", requestedLocales, availableLocales);
  requestedLocales.forEach((locale) => addLocale(locales, locale));

  for (const execution of selectedExecutions) {
    const collected = await collectRows(
      projectConfig,
      execution.datasource,
      {
        ...options,
        allowMissingLocales: true,
      },
      execution.set,
    );

    rows.push(...collected.rows);
    if (requestedLocales.length === 0) {
      collected.locales.forEach((locale) => addLocale(locales, locale));
    }
  }

  return finishExport(projectConfig, rows, locales, options, true);
}

function printExportResult(result: ExportProjectResult, print: boolean | undefined) {
  if (print) {
    console.log(result.csv);
    return;
  }

  console.log(`CSV file generated successfully at ${result.filePath}`);
  console.log(`Rows: ${result.summary.totalRows} total`);
  console.log(`Messages: ${result.summary.messageRows}`);
  console.log(`Overrides: ${result.summary.overrideRows}`);
  console.log(`Locales: ${result.summary.locales.join(", ") || "(none)"}`);

  if (result.summary.sets.length > 0) {
    console.log(`Sets: ${result.summary.sets.join(", ")}`);
  }
}

export const exportPlugin = {
  command: "export",
  handler: async ({ projectConfig, datasource, parsed }: any) => {
    try {
      const result = await exportProjectSets(projectConfig, datasource, {
        set: parsed.set,
        locale: parsed.locale,
        target: parsed.target,
        includeMessages: parsed.includeMessages,
        excludeMessages: parsed.excludeMessages,
        excludeOverrides: parsed.excludeOverrides,
        withoutDescription: parsed.withoutDescription,
        withoutStatus: parsed.withoutStatus,
        onlyUntranslated: parsed.onlyUntranslated,
        onlyDirectlyUntranslated: parsed.onlyDirectlyUntranslated,
        print: parsed.print,
        output: parsed.output,
        force: parsed.force,
        delimiter: parsed.delimiter,
        bom: parsed.bom,
        lineEnding: parsed.lineEnding,
      });

      printExportResult(result, parsed.print);
    } catch (error) {
      if (printMessagevisorCLIError(error)) {
        return false;
      }

      throw error;
    }
  },
  examples: [
    { command: "export", description: "export translations to CSV" },
    {
      command: "export --locale=en-US --target=web",
      description: "export translations for one locale and target",
    },
    {
      command: "export --locale=en --locale=nl --target=web",
      description: "export multiple locales, for example source plus target",
    },
    {
      command: "export --print",
      description: "print exported CSV to the console",
    },
  ],
};
