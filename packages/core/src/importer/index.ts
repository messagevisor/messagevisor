/* eslint-disable @typescript-eslint/no-unused-vars */
import * as fs from "fs";
import * as path from "path";

import type { Locale, Message, Override, Translation } from "@messagevisor/types";

import type { ProjectConfig } from "../config";
import type { Datasource } from "../datasource";
import { MessagevisorCLIError, printMessagevisorCLIError } from "../error";
import {
  getLocaleInheritanceDepth,
  resolveInheritedLocaleValue,
  resolveLocaleValue,
} from "../localeResolution";
import { formatProjectPath } from "../path";
import { getProjectSetExecutions } from "../sets";
import {
  CLI_FORMAT_BOLD,
  CLI_FORMAT_GREEN,
  CLI_FORMAT_YELLOW,
  colorize,
} from "../tester/cliFormat";
import { prettyDuration } from "../tester/prettyDuration";

export interface ImportProjectOptions {
  input?: string;
  set?: string | string[];
  locale?: string | string[];
  createMissing?: boolean;
  apply?: boolean;
  prune?: boolean;
  fromJson?: boolean;
  jsonPath?: string;
  delimiter?: string;
  bom?: boolean;
}

interface CsvContent {
  headers: string[];
  rows: Record<string, string>[];
}

interface ParsedImportInput {
  inputFilePath: string;
  rows: ImportRow[];
  warnings: string[];
  rowCount: number;
}

interface ImportRow {
  rowNumber: number;
  set?: string;
  messageKey: string;
  overrideKey?: string;
  values: Record<string, string>;
}

interface ImportPlanEntry {
  set?: string;
  key: string;
  original?: Message;
  updated: Message;
  createdMessage: boolean;
  createdOverrides: string[];
  changedLocales: string[];
  changedOverrideLocales: Array<{ overrideKey: string; locale: string }>;
  prunedLocales: string[];
  prunedOverrideLocales: Array<{ overrideKey: string; locale: string }>;
}

export interface ImportProjectResult {
  inputFilePath: string;
  apply: boolean;
  duration: number;
  summary: {
    rows: number;
    changedMessages: number;
    changedOverrides: number;
    createdMessages: number;
    createdOverrides: number;
    changedTranslations: number;
    prunedTranslations: number;
    skippedRows: number;
    skippedCells: number;
    warnings: number;
    sets: string[];
  };
  warnings: string[];
  plans: ImportPlanEntry[];
}

function toArray(value?: string | string[]): string[] {
  if (typeof value === "undefined") return [];
  return Array.isArray(value) ? value : [value];
}

function withoutKey<T extends Record<string, unknown>>(entity: T): T {
  const { key: _key, ...rest } = entity;

  return rest as T;
}

function cloneMessage(message: Message): Message {
  return JSON.parse(JSON.stringify(withoutKey(message as any)));
}

function parseCsv(content: string, delimiter = ","): CsvContent {
  const source = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let quoteClosed = false;

  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    const next = source[index + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"';
        index++;
      } else if (char === '"') {
        inQuotes = false;
        quoteClosed = true;
      } else if (char === "\r") {
        if (next === "\n") index++;
        cell += "\n";
      } else {
        cell += char;
      }
      continue;
    }

    if (quoteClosed) {
      if (char === delimiter) {
        row.push(cell);
        cell = "";
        quoteClosed = false;
      } else if (char === "\n") {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
        quoteClosed = false;
      } else if (char === "\r") {
        if (next === "\n") index++;
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
        quoteClosed = false;
      } else {
        throw new MessagevisorCLIError("Invalid CSV: unexpected character after closing quote.");
      }
    } else if (char === '"') {
      if (cell.length > 0) {
        throw new MessagevisorCLIError("Invalid CSV: unexpected quote in unquoted field.");
      }
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char === "\r") {
      if (next === "\n") index++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (inQuotes) {
    throw new MessagevisorCLIError("Invalid CSV: unterminated quoted field.");
  }

  if (cell.length > 0 || row.length > 0 || quoteClosed) {
    row.push(cell);
    rows.push(row);
  }

  const [headers = [], ...dataRows] = rows;

  return {
    headers,
    rows: dataRows
      .map((dataRow, index) => ({
        dataRow,
        rowNumber: index + 2,
      }))
      .filter(({ dataRow }) => dataRow.some((value) => value !== ""))
      .map(({ dataRow, rowNumber }) => {
        if (dataRow.length > headers.length) {
          throw new MessagevisorCLIError(
            `Invalid CSV: row ${rowNumber} has ${dataRow.length} cells but only ${headers.length} headers.`,
          );
        }

        return Object.fromEntries(headers.map((header, index) => [header, dataRow[index] || ""]));
      }),
  };
}

function assertOptions(options: ImportProjectOptions) {
  if (typeof options.delimiter !== "undefined" && options.delimiter.length !== 1) {
    throw new MessagevisorCLIError("--delimiter must be a single character.");
  }

  if (options.fromJson && typeof options.delimiter !== "undefined") {
    throw new MessagevisorCLIError("--delimiter can only be used with CSV imports.");
  }

  if (options.fromJson && typeof options.bom !== "undefined") {
    throw new MessagevisorCLIError("--bom can only be used with CSV imports.");
  }
}

function isHttpUrl(input: string) {
  return /^https?:\/\//i.test(input);
}

function getInputFilePath(
  projectConfig: ProjectConfig,
  options: ImportProjectOptions,
  parsed: any,
) {
  const input = options.input || parsed?._?.[1];

  if (!input) {
    throw new MessagevisorCLIError(
      options.fromJson
        ? "Pass a JSON file path or URL: messagevisor import <jsonFilePathOrUrl> --from-json --locale=<locale>."
        : "Pass an input file path: messagevisor import <file>.",
    );
  }

  if (options.fromJson && isHttpUrl(input)) {
    return input;
  }

  const projectRootDirectoryPath = path.dirname(projectConfig.exportsDirectoryPath);

  return path.isAbsolute(input) ? input : path.join(projectRootDirectoryPath, input);
}

async function readAll<T>(
  keys: string[],
  read: (key: string) => Promise<T>,
): Promise<Record<string, T>> {
  const entries = await Promise.all(keys.map(async (key) => [key, await read(key)] as const));
  return Object.fromEntries(entries);
}

function resolveTranslation(
  translations: Record<string, Translation> | undefined,
  localeKey: string,
  locales: Record<string, Locale>,
) {
  return resolveLocaleValue(translations, localeKey, locales)?.value;
}

function resolveInheritedTranslationValue(
  translations: Record<string, Translation> | undefined,
  localeKey: string,
  locales: Record<string, Locale>,
) {
  return resolveInheritedLocaleValue(translations, localeKey, locales)?.value;
}

function splitMessageKey(projectConfig: ProjectConfig, key: string) {
  const separator = projectConfig.exportOverrideKeySeparator;
  const separatorIndex = key.lastIndexOf(separator);

  if (separatorIndex === -1) {
    return { messageKey: key };
  }

  return {
    messageKey: key.slice(0, separatorIndex),
    overrideKey: key.slice(separatorIndex + separator.length),
  };
}

function getLocaleHeaders(headers: string[], localeKeys: string[]) {
  const reservedHeaders = new Set(["set", "messageKey", "messageDescription"]);

  return headers.filter(
    (header) =>
      !reservedHeaders.has(header) && !header.endsWith("Status") && localeKeys.includes(header),
  );
}

function getUnknownTranslationHeaders(headers: string[], localeKeys: string[]) {
  const reservedHeaders = new Set(["set", "messageKey", "messageDescription"]);

  return headers.filter(
    (header) =>
      !reservedHeaders.has(header) && !header.endsWith("Status") && !localeKeys.includes(header),
  );
}

function assertKnownLocales(requestedLocales: string[], localeKeys: string[]) {
  for (const locale of requestedLocales) {
    if (!localeKeys.includes(locale)) {
      throw new MessagevisorCLIError(
        `Unknown locale "${locale}". Available locales: ${localeKeys.join(", ") || "none"}.`,
      );
    }
  }
}

function getSelectedLocaleHeaders(
  headers: string[],
  localeKeys: string[],
  requestedLocales: string[],
) {
  const localeHeaders = getLocaleHeaders(headers, localeKeys);

  if (requestedLocales.length === 0) {
    return localeHeaders;
  }

  assertKnownLocales(requestedLocales, localeKeys);

  return localeHeaders.filter((locale) => requestedLocales.includes(locale));
}

function toImportRows(
  projectConfig: ProjectConfig,
  csv: CsvContent,
  localeHeaders: string[],
): ImportRow[] {
  if (!csv.headers.includes("messageKey")) {
    throw new MessagevisorCLIError('CSV must include a "messageKey" column.');
  }

  return csv.rows.map((row, index) => {
    const { messageKey, overrideKey } = splitMessageKey(projectConfig, row.messageKey || "");

    return {
      rowNumber: index + 2,
      set: row.set || undefined,
      messageKey,
      overrideKey,
      values: Object.fromEntries(localeHeaders.map((locale) => [locale, row[locale] || ""])),
    };
  });
}

function addWarning(warnings: string[], message: string) {
  warnings.push(message);
}

function getOrCreatePlan(
  plansByKey: Map<string, ImportPlanEntry>,
  set: string | undefined,
  messageKey: string,
  original: Message | undefined,
) {
  const planKey = `${set || ""}:${messageKey}`;
  const existing = plansByKey.get(planKey);

  if (existing) {
    return existing;
  }

  const plan: ImportPlanEntry = {
    set,
    key: messageKey,
    original,
    updated: original ? cloneMessage(original) : { description: "", translations: {} },
    createdMessage: !original,
    createdOverrides: [],
    changedLocales: [],
    changedOverrideLocales: [],
    prunedLocales: [],
    prunedOverrideLocales: [],
  };

  plansByKey.set(planKey, plan);

  return plan;
}

function shouldApplyTranslation(
  translations: Record<string, Translation> | undefined,
  locale: string,
  value: string,
  locales: Record<string, Locale>,
) {
  if (value === "") {
    return false;
  }

  if (translations && typeof translations[locale] !== "undefined") {
    return translations[locale] !== value;
  }

  return resolveTranslation(translations, locale, locales) !== value;
}

function getImportValueEntries(values: Record<string, string>, locales: Record<string, Locale>) {
  return Object.entries(values).sort(
    ([leftLocale], [rightLocale]) =>
      getLocaleInheritanceDepth(leftLocale, locales) -
      getLocaleInheritanceDepth(rightLocale, locales),
  );
}

function getOrCreateOverride(
  message: Message,
  overrideKey: string,
  createMissing: boolean,
): { override?: Override; created: boolean } {
  const overrides = message.overrides || [];
  const existing = overrides.find((override) => override.key === overrideKey);

  if (existing) {
    return { override: existing, created: false };
  }

  if (!createMissing) {
    return { created: false };
  }

  const created: Override = {
    key: overrideKey,
    segments: "*",
    translations: {},
  };

  message.overrides = [...overrides, created];

  return { override: created, created: true };
}

async function collectImportPlansForDatasource(
  datasource: Datasource,
  rows: ImportRow[],
  options: Required<Pick<ImportProjectOptions, "createMissing" | "prune">>,
  set: string | undefined,
  warnings: string[],
) {
  const [localeKeys, messageKeys] = await Promise.all([
    datasource.listLocales(),
    datasource.listMessages(),
  ]);
  const locales = await readAll<Locale>(localeKeys, (key) => datasource.readLocale(key));
  const messages = await readAll<Message>(messageKeys, (key) => datasource.readMessage(key));
  const plansByKey = new Map<string, ImportPlanEntry>();
  let skippedRows = 0;
  let skippedCells = 0;
  let prunedTranslations = 0;

  const sortedRows = [...rows].sort(
    (a, b) => Number(Boolean(a.overrideKey)) - Number(Boolean(b.overrideKey)),
  );

  for (const row of sortedRows) {
    if (!row.messageKey) {
      skippedRows++;
      addWarning(warnings, `Row ${row.rowNumber}: missing messageKey.`);
      continue;
    }

    const planKey = `${set || ""}:${row.messageKey}`;
    const existingPlan = plansByKey.get(planKey);
    const message = messages[row.messageKey];

    if (!message && !options.createMissing) {
      skippedRows++;
      addWarning(warnings, `Row ${row.rowNumber}: unknown message "${row.messageKey}".`);
      continue;
    }

    if (row.overrideKey && !message && !existingPlan && options.createMissing) {
      skippedRows++;
      addWarning(
        warnings,
        `Row ${row.rowNumber}: cannot create override "${row.overrideKey}" because message "${row.messageKey}" does not exist or is not created by another row.`,
      );
      continue;
    }

    const plan = getOrCreatePlan(plansByKey, set, row.messageKey, message);

    if (row.overrideKey) {
      const { override, created } = getOrCreateOverride(
        plan.updated,
        row.overrideKey,
        options.createMissing,
      );

      if (!override) {
        skippedRows++;
        addWarning(
          warnings,
          `Row ${row.rowNumber}: unknown override "${row.overrideKey}" in message "${row.messageKey}".`,
        );
        continue;
      }

      let changed = false;

      for (const [locale, value] of getImportValueEntries(row.values, locales)) {
        if (!localeKeys.includes(locale)) {
          skippedCells++;
          addWarning(warnings, `Row ${row.rowNumber}: unknown locale "${locale}".`);
          continue;
        }

        const inherited = options.prune
          ? resolveInheritedTranslationValue(override.translations, locale, locales)
          : undefined;

        if (value !== "" && typeof inherited !== "undefined" && inherited === value) {
          prunedTranslations++;

          if (typeof override.translations?.[locale] !== "undefined") {
            delete override.translations[locale];
            plan.prunedOverrideLocales.push({ overrideKey: row.overrideKey, locale });
            changed = true;
          }

          continue;
        }

        if (!shouldApplyTranslation(override.translations, locale, value, locales)) {
          skippedCells++;
          continue;
        }

        override.translations = { ...override.translations, [locale]: value };
        plan.changedOverrideLocales.push({ overrideKey: row.overrideKey, locale });
        changed = true;
      }

      if (created && changed) {
        plan.createdOverrides.push(row.overrideKey);
      }
      if (created && !changed) {
        plan.updated.overrides = (plan.updated.overrides || []).filter(
          (overrideEntry) => overrideEntry.key !== row.overrideKey,
        );
      }
      continue;
    }

    for (const [locale, value] of getImportValueEntries(row.values, locales)) {
      if (!localeKeys.includes(locale)) {
        skippedCells++;
        addWarning(warnings, `Row ${row.rowNumber}: unknown locale "${locale}".`);
        continue;
      }

      const inherited = options.prune
        ? resolveInheritedTranslationValue(plan.updated.translations, locale, locales)
        : undefined;

      if (value !== "" && typeof inherited !== "undefined" && inherited === value) {
        prunedTranslations++;

        if (typeof plan.updated.translations?.[locale] !== "undefined") {
          delete plan.updated.translations[locale];
          plan.prunedLocales.push(locale);
        }

        continue;
      }

      if (!shouldApplyTranslation(plan.updated.translations, locale, value, locales)) {
        skippedCells++;
        continue;
      }

      plan.updated.translations = { ...plan.updated.translations, [locale]: value };
      plan.changedLocales.push(locale);
    }
  }

  return {
    plans: Array.from(plansByKey.values()).filter(
      (plan) =>
        plan.changedLocales.length > 0 ||
        plan.changedOverrideLocales.length > 0 ||
        plan.createdOverrides.length > 0 ||
        plan.prunedLocales.length > 0 ||
        plan.prunedOverrideLocales.length > 0,
    ),
    skippedRows,
    skippedCells,
    prunedTranslations,
  };
}

function deepEqual(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function writePlans(datasource: Datasource, plans: ImportPlanEntry[]) {
  for (const plan of plans) {
    if (plan.original && deepEqual(withoutKey(plan.original as any), plan.updated)) {
      continue;
    }

    await datasource.writeMessage(plan.key, plan.updated);
  }
}

function createResult(
  inputFilePath: string,
  apply: boolean,
  startTime: number,
  rows: number,
  plans: ImportPlanEntry[],
  skippedRows: number,
  skippedCells: number,
  prunedTranslations: number,
  warnings: string[],
): ImportProjectResult {
  const changedOverrideKeys = new Set(
    plans.flatMap((plan) =>
      [...plan.changedOverrideLocales, ...plan.prunedOverrideLocales].map(
        (entry) => `${plan.set || ""}:${plan.key}:${entry.overrideKey}`,
      ),
    ),
  );
  const changedMessagePlans = plans.filter(
    (plan) => plan.changedLocales.length > 0 || plan.prunedLocales.length > 0,
  );

  return {
    inputFilePath,
    apply,
    duration: Date.now() - startTime,
    plans,
    warnings,
    summary: {
      rows,
      changedMessages: changedMessagePlans.length,
      changedOverrides: changedOverrideKeys.size,
      createdMessages: plans.filter((plan) => plan.createdMessage).length,
      createdOverrides: plans.reduce((sum, plan) => sum + plan.createdOverrides.length, 0),
      changedTranslations:
        plans.reduce((sum, plan) => sum + plan.changedLocales.length, 0) +
        plans.reduce((sum, plan) => sum + plan.changedOverrideLocales.length, 0),
      prunedTranslations,
      skippedRows,
      skippedCells,
      warnings: warnings.length,
      sets: Array.from(
        new Set(plans.map((plan) => plan.set).filter((entry): entry is string => Boolean(entry))),
      ),
    },
  };
}

async function readCsv(inputFilePath: string, options: ImportProjectOptions) {
  if (!fs.existsSync(inputFilePath)) {
    throw new MessagevisorCLIError(`CSV file does not exist: ${inputFilePath}`);
  }

  return parseCsv(await fs.promises.readFile(inputFilePath, "utf8"), options.delimiter || ",");
}

async function readJsonText(inputFilePath: string) {
  if (isHttpUrl(inputFilePath)) {
    let response: Response;

    try {
      response = await fetch(inputFilePath);
    } catch (error) {
      throw new MessagevisorCLIError(`Unable to fetch JSON from ${inputFilePath}.`);
    }

    if (!response.ok) {
      throw new MessagevisorCLIError(
        `Unable to fetch JSON from ${inputFilePath}: ${response.status} ${response.statusText}`.trim(),
      );
    }

    return response.text();
  }

  if (!fs.existsSync(inputFilePath)) {
    throw new MessagevisorCLIError(`JSON file does not exist: ${inputFilePath}`);
  }

  return fs.promises.readFile(inputFilePath, "utf8");
}

function parseJson(content: string) {
  try {
    return JSON.parse(content);
  } catch (error) {
    throw new MessagevisorCLIError("Invalid JSON: unable to parse input.");
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function selectJsonPath(content: unknown, jsonPath?: string) {
  if (typeof jsonPath === "undefined") {
    return content;
  }

  if (jsonPath.trim() === "") {
    throw new MessagevisorCLIError("--json-path cannot be empty.");
  }

  let current = content;

  for (const segment of jsonPath.split(".")) {
    if (!segment) {
      throw new MessagevisorCLIError(`Invalid JSON path "${jsonPath}".`);
    }

    if (!isPlainObject(current) || !(segment in current)) {
      throw new MessagevisorCLIError(`JSON path "${jsonPath}" was not found.`);
    }

    current = current[segment];
  }

  return current;
}

function jsonToImportRows(
  projectConfig: ProjectConfig,
  content: unknown,
  locale: string,
  jsonPath?: string,
): ImportRow[] {
  const selected = selectJsonPath(content, jsonPath);

  if (!isPlainObject(selected)) {
    throw new MessagevisorCLIError(
      jsonPath
        ? `JSON path "${jsonPath}" must resolve to a flat object.`
        : "JSON import input must be a flat object.",
    );
  }

  return Object.entries(selected).map(([key, value], index) => {
    if (typeof value !== "string") {
      throw new MessagevisorCLIError(`JSON translation value for "${key}" must be a string.`);
    }

    const { messageKey, overrideKey } = splitMessageKey(projectConfig, key);

    return {
      rowNumber: index + 1,
      messageKey,
      overrideKey,
      values: {
        [locale]: value,
      },
    };
  });
}

function getJsonImportLocale(options: ImportProjectOptions) {
  const requestedLocales = toArray(options.locale);

  if (requestedLocales.length !== 1) {
    throw new MessagevisorCLIError("--from-json requires exactly one --locale=<locale>.");
  }

  return requestedLocales[0];
}

async function readJsonImportInput(
  projectConfig: ProjectConfig,
  inputFilePath: string,
  locale: string,
  options: ImportProjectOptions,
): Promise<ParsedImportInput> {
  const content = parseJson(await readJsonText(inputFilePath));
  const rows = jsonToImportRows(projectConfig, content, locale, options.jsonPath);

  return {
    inputFilePath,
    rows,
    warnings: [],
    rowCount: rows.length,
  };
}

async function readCsvImportInput(
  projectConfig: ProjectConfig,
  datasource: Datasource,
  inputFilePath: string,
  options: ImportProjectOptions,
): Promise<ParsedImportInput> {
  const csv = await readCsv(inputFilePath, options);

  if (csv.headers.includes("set") && hasNonEmptySetValues(csv)) {
    throw new MessagevisorCLIError(
      'CSV "set" column can only contain values when `sets: true` is configured.',
    );
  }

  const localeKeys = await datasource.listLocales();
  const requestedLocales = toArray(options.locale);
  const localeHeaders = getSelectedLocaleHeaders(csv.headers, localeKeys, requestedLocales);
  const unknownHeaders = getUnknownTranslationHeaders(csv.headers, localeKeys);
  const warnings = unknownHeaders.map((header) => `Ignoring unknown CSV column "${header}".`);
  const rows = toImportRows(projectConfig, csv, localeHeaders);

  return {
    inputFilePath,
    rows,
    warnings,
    rowCount: rows.length,
  };
}

function getAllLocaleKeysBySet(executions: Awaited<ReturnType<typeof getProjectSetExecutions>>) {
  return Promise.all(
    executions.map(async (execution) => ({
      set: execution.set,
      locales: await execution.datasource.listLocales(),
    })),
  );
}

function hasNonEmptySetValues(csv: CsvContent) {
  return csv.rows.some((row) => row.set && row.set.trim() !== "");
}

export async function importProject(
  projectConfig: ProjectConfig,
  datasource: Datasource,
  options: ImportProjectOptions = {},
  parsed?: any,
): Promise<ImportProjectResult> {
  const startTime = Date.now();
  assertOptions(options);

  if (projectConfig.sets) {
    return importProjectSets(projectConfig, datasource, options, parsed);
  }

  if (toArray(options.set).length > 0) {
    throw new MessagevisorCLIError("--set can only be used when `sets: true` is configured.");
  }

  const inputFilePath = getInputFilePath(projectConfig, options, parsed);
  const input = options.fromJson
    ? await (async () => {
        const locale = getJsonImportLocale(options);
        const localeKeys = await datasource.listLocales();
        assertKnownLocales([locale], localeKeys);

        return readJsonImportInput(projectConfig, inputFilePath, locale, options);
      })()
    : await readCsvImportInput(projectConfig, datasource, inputFilePath, options);
  const collected = await collectImportPlansForDatasource(
    datasource,
    input.rows,
    {
      createMissing: options.createMissing === true,
      prune: options.prune === true,
    },
    undefined,
    input.warnings,
  );

  if (options.apply === true) {
    await writePlans(datasource, collected.plans);
  }

  return createResult(
    inputFilePath,
    options.apply === true,
    startTime,
    input.rowCount,
    collected.plans,
    collected.skippedRows,
    collected.skippedCells,
    collected.prunedTranslations,
    input.warnings,
  );
}

export async function importProjectSets(
  projectConfig: ProjectConfig,
  datasource: Datasource,
  options: ImportProjectOptions = {},
  parsed?: any,
): Promise<ImportProjectResult> {
  const startTime = Date.now();
  assertOptions(options);

  if (!projectConfig.sets) {
    return importProject(projectConfig, datasource, options, parsed);
  }

  const requestedSets = toArray(options.set);
  const executions = await getProjectSetExecutions(projectConfig, datasource, undefined);
  const executionSets = executions.map((execution) => execution.set);
  const unknownRequestedSets = requestedSets.filter((set) => !executionSets.includes(set));
  const inputFilePath = getInputFilePath(projectConfig, options, parsed);

  if (unknownRequestedSets.length > 0) {
    throw new MessagevisorCLIError(
      `Unknown set "${unknownRequestedSets[0]}". Available sets: ${executionSets.join(", ") || "none"}.`,
    );
  }

  if (options.fromJson) {
    if (requestedSets.length !== 1) {
      throw new MessagevisorCLIError(
        "--from-json requires exactly one --set=<set> when `sets: true` is configured.",
      );
    }

    const locale = getJsonImportLocale(options);
    const execution = executions.find(
      (currentExecution) => currentExecution.set === requestedSets[0],
    )!;
    const localeKeys = await execution.datasource.listLocales();
    assertKnownLocales([locale], localeKeys);

    const input = await readJsonImportInput(projectConfig, inputFilePath, locale, options);
    const warnings = [...input.warnings];
    const collected = await collectImportPlansForDatasource(
      execution.datasource,
      input.rows.map((row) => ({ ...row, set: execution.set })),
      {
        createMissing: options.createMissing === true,
        prune: options.prune === true,
      },
      execution.set,
      warnings,
    );

    if (options.apply === true) {
      await writePlans(execution.datasource, collected.plans);
    }

    return createResult(
      inputFilePath,
      options.apply === true,
      startTime,
      input.rowCount,
      collected.plans,
      collected.skippedRows,
      collected.skippedCells,
      collected.prunedTranslations,
      warnings,
    );
  }

  const csv = await readCsv(inputFilePath, options);

  const selectedExecutions =
    requestedSets.length > 0
      ? executions.filter((execution) => requestedSets.includes(execution.set))
      : executions;
  const hasSetColumn = csv.headers.includes("set");

  if (!hasSetColumn && requestedSets.length !== 1) {
    throw new MessagevisorCLIError('CSV without a "set" column requires exactly one --set=<set>.');
  }

  const localeKeysBySet = await getAllLocaleKeysBySet(selectedExecutions);
  const allLocaleKeys = Array.from(new Set(localeKeysBySet.flatMap((entry) => entry.locales)));
  const requestedLocales = toArray(options.locale);
  const localeHeaders = getSelectedLocaleHeaders(csv.headers, allLocaleKeys, requestedLocales);
  const unknownHeaders = getUnknownTranslationHeaders(csv.headers, allLocaleKeys);
  const warnings = unknownHeaders.map((header) => `Ignoring unknown CSV column "${header}".`);
  const rows = toImportRows(projectConfig, csv, localeHeaders);
  const rowsBySet = new Map<string, ImportRow[]>();
  let skippedRows = 0;
  let skippedCells = 0;

  for (const row of rows) {
    const rowSet = hasSetColumn ? row.set : requestedSets[0];

    if (!rowSet) {
      skippedRows++;
      addWarning(warnings, `Row ${row.rowNumber}: missing set.`);
      continue;
    }

    if (!executionSets.includes(rowSet)) {
      skippedRows++;
      addWarning(warnings, `Row ${row.rowNumber}: unknown set "${rowSet}".`);
      continue;
    }

    if (requestedSets.length > 0 && !requestedSets.includes(rowSet)) {
      skippedRows++;
      continue;
    }

    rowsBySet.set(rowSet, [...(rowsBySet.get(rowSet) || []), { ...row, set: rowSet }]);
  }

  const plans: ImportPlanEntry[] = [];
  let prunedTranslations = 0;

  for (const execution of selectedExecutions) {
    const setRows = rowsBySet.get(execution.set) || [];

    if (setRows.length === 0) {
      continue;
    }

    const collected = await collectImportPlansForDatasource(
      execution.datasource,
      setRows,
      {
        createMissing: options.createMissing === true,
        prune: options.prune === true,
      },
      execution.set,
      warnings,
    );

    plans.push(...collected.plans);
    skippedRows += collected.skippedRows;
    skippedCells += collected.skippedCells;
    prunedTranslations += collected.prunedTranslations;

    if (options.apply === true) {
      await writePlans(execution.datasource, collected.plans);
    }
  }

  return createResult(
    inputFilePath,
    options.apply === true,
    startTime,
    rows.length,
    plans,
    skippedRows,
    skippedCells,
    prunedTranslations,
    warnings,
  );
}

function printImportResult(projectConfig: ProjectConfig, result: ImportProjectResult) {
  console.log("");
  console.log(CLI_FORMAT_BOLD, "Importing Messagevisor translations");
  const inputLabel = isHttpUrl(result.inputFilePath)
    ? result.inputFilePath
    : formatProjectPath(projectConfig, result.inputFilePath);
  console.log(`  Input: ${colorize(inputLabel, 36)}`);
  console.log(`  Mode: ${result.apply ? "apply" : "preview"}`);
  if (result.summary.sets.length > 0) {
    console.log(`  Sets: ${result.summary.sets.join(", ")}`);
  }
  console.log("");
  console.log(`  Rows:                  ${result.summary.rows}`);
  console.log(`  Changed messages:      ${result.summary.changedMessages}`);
  console.log(`  Changed overrides:     ${result.summary.changedOverrides}`);
  console.log(`  Created messages:      ${result.summary.createdMessages}`);
  console.log(`  Created overrides:     ${result.summary.createdOverrides}`);
  console.log(`  Changed translations:  ${result.summary.changedTranslations}`);
  console.log(`  Pruned translations:   ${result.summary.prunedTranslations}`);
  console.log(`  Skipped rows:          ${result.summary.skippedRows}`);
  console.log(`  Skipped cells:         ${result.summary.skippedCells}`);
  console.log(`  Warnings:              ${result.summary.warnings}`);
  console.log("");

  if (result.warnings.length > 0) {
    console.log(CLI_FORMAT_BOLD, "Warnings");
    for (const warning of result.warnings.slice(0, 12)) {
      console.log(CLI_FORMAT_YELLOW, `  ${warning}`);
    }
    if (result.warnings.length > 12) {
      console.log(`  ${colorize(`...and ${result.warnings.length - 12} more`, 2)}`);
    }
    console.log("");
  }

  console.log(CLI_FORMAT_GREEN, result.apply ? "Import applied" : "Import preview complete");
  console.log(CLI_FORMAT_BOLD, `Time: ${prettyDuration(result.duration)}`);
}

export const importPlugin = {
  command: "import [file]",
  handler: async ({ projectConfig, datasource, parsed }: any) => {
    try {
      if (parsed.file && parsed.input) {
        throw new MessagevisorCLIError(
          "Provide the import file either as a positional argument or with --input, not both.",
        );
      }

      const result = await importProjectSets(
        projectConfig,
        datasource,
        {
          input: parsed.file || parsed.input,
          set: parsed.set,
          locale: parsed.locale,
          createMissing: parsed.createMissing,
          apply: parsed.apply === true || parsed.apply === "true",
          prune: parsed.prune === true || parsed.prune === "true",
          fromJson: parsed.fromJson === true || parsed.fromJson === "true",
          jsonPath: parsed.jsonPath,
          delimiter: parsed.delimiter,
          bom: parsed.bom,
        },
        parsed,
      );

      printImportResult(projectConfig, result);
    } catch (error) {
      if (printMessagevisorCLIError(error, parsed)) {
        return false;
      }

      throw error;
    }
  },
  examples: [
    {
      command: "import exports/messagevisor-export-20260419T123456.csv",
      description: "preview translations from a CSV file",
    },
    {
      command: "import --input=translator/nl.csv --apply",
      description: "apply an import and write message files",
    },
    {
      command: "import --input=translator/translations.csv --locale=nl --apply",
      description: "apply only one locale column from a CSV",
    },
    {
      command: "import --input=translator/translations.csv --locale=en-US --prune --apply",
      description: "apply an import while pruning translations duplicated by inheritance",
    },
    {
      command: "import translations.csv --set=staging",
      description: "preview a CSV without a set column for one set",
    },
    {
      command: "import translations.json --from-json --locale=nl-NL --apply",
      description: "apply translations from a flat JSON object",
    },
  ],
};
