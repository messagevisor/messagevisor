import { createMessagevisor, type MessageValues } from "@messagevisor/sdk";
import type {
  Context,
  DatafileContent,
  FormatPresets,
  Locale,
  LocaleExample,
  Message,
  MessageExample,
} from "@messagevisor/types";

import type { Plugin } from "../cli";
import type { ProjectConfig } from "../config";
import type { Datasource } from "../datasource";
import { buildMessageDatafile, resolveFormats } from "../builder";
import { MessagevisorCLIError, printMessagevisorCLIError } from "../error";
import { applyCombinationToValue, getMatrixCombinations } from "../matrix";
import { getProjectSetExecutions } from "../sets";
import { colorize } from "../tester/cliFormat";
import { coerceExampleValuesIsoDates } from "./coerceExampleIsoDates";

export interface ResolvedLocaleExample {
  set?: string;
  locale: string;
  sourceLocale: string;
  exampleIndex: number;
  matrixIndex?: number;
  description?: string;
  rawMessage?: string;
  message?: string;
  values?: Record<string, unknown>;
  context?: Record<string, unknown>;
  formats?: FormatPresets;
  currency?: string;
  timeZone?: string;
  expectedByRuntime?: Record<string, string>;
  evaluatedTranslation: unknown;
  evaluationInput?: ExampleEvaluationInput;
}

export interface ResolvedMessageExample {
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
  expectedByRuntime?: Record<string, string>;
  evaluatedTranslation: unknown;
  evaluationInput?: ExampleEvaluationInput;
}

export interface ExampleEvaluationInput {
  datafile?: DatafileContent;
  defaultFormats?: Record<string, FormatPresets>;
  formats?: FormatPresets;
  context?: Record<string, unknown>;
  values?: Record<string, unknown>;
  currency?: string;
  timeZone?: string;
}

interface ExpandedLocaleExample extends Omit<
  ResolvedLocaleExample,
  "evaluatedTranslation" | "set"
> {
  values?: MessageValues<any>;
}

interface ExpandedMessageExample extends Omit<
  ResolvedMessageExample,
  "evaluatedTranslation" | "set"
> {
  values?: MessageValues<any>;
}

interface ExampleFilters {
  exampleIndex?: number;
  matrixIndex?: number;
  descriptionPattern?: RegExp;
  translationPattern?: RegExp;
}

export interface ExamplesOutput {
  locales: ResolvedLocaleExample[];
  messages: ResolvedMessageExample[];
}

interface ExampleSourceSelection {
  includeLocales: boolean;
  includeMessages: boolean;
}

export interface ResolveExamplesOptions {
  set?: string;
  locale?: string;
  message?: string;
  exampleIndex?: number | string;
  matrixIndex?: number | string;
  descriptionPattern?: string | RegExp;
  translationPattern?: string | RegExp;
  onlyMessages?: boolean;
  onlyLocales?: boolean;
  includeEvaluationInput?: boolean;
}

function parseOptionalPositiveInteger(name: string, value: unknown): number | undefined {
  if (typeof value === "undefined") {
    return undefined;
  }

  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue < 1) {
    throw new MessagevisorCLIError(
      `Invalid ${name}: expected an integer greater than or equal to 1.`,
    );
  }

  return parsedValue;
}

function parseOptionalPattern(name: string, value: unknown): RegExp | undefined {
  if (typeof value === "undefined") {
    return undefined;
  }

  if (value instanceof RegExp) {
    return value;
  }

  try {
    return new RegExp(String(value), "i");
  } catch (error: any) {
    throw new MessagevisorCLIError(`Invalid ${name}: ${error.message}`);
  }
}

function getExampleFilters(
  parsed: Record<string, unknown> | ResolveExamplesOptions,
): ExampleFilters {
  return {
    exampleIndex: parseOptionalPositiveInteger("--exampleIndex", parsed.exampleIndex),
    matrixIndex: parseOptionalPositiveInteger("--matrixIndex", parsed.matrixIndex),
    descriptionPattern: parseOptionalPattern("--descriptionPattern", parsed.descriptionPattern),
    translationPattern: parseOptionalPattern("--translationPattern", parsed.translationPattern),
  };
}

function getExampleSourceSelection(
  parsed: Record<string, unknown> | ResolveExamplesOptions,
): ExampleSourceSelection {
  const onlyLocales = Boolean(parsed.onlyLocales);
  const onlyMessages = Boolean(parsed.onlyMessages);

  if (onlyLocales && onlyMessages) {
    throw new MessagevisorCLIError("Pass either --onlyLocales or --onlyMessages, not both.");
  }

  return {
    includeLocales: !onlyMessages,
    includeMessages: !onlyLocales,
  };
}

function matchesCommonFilters(
  example: {
    exampleIndex: number;
    matrixIndex?: number;
    description?: string;
    evaluatedTranslation: unknown;
  },
  filters: ExampleFilters,
) {
  if (
    typeof filters.exampleIndex === "number" &&
    example.exampleIndex + 1 !== filters.exampleIndex
  ) {
    return false;
  }

  if (typeof filters.matrixIndex === "number") {
    if (
      typeof example.matrixIndex !== "number" ||
      example.matrixIndex + 1 !== filters.matrixIndex
    ) {
      return false;
    }
  }

  if (filters.descriptionPattern && !filters.descriptionPattern.test(example.description || "")) {
    return false;
  }

  if (
    filters.translationPattern &&
    !filters.translationPattern.test(String(example.evaluatedTranslation))
  ) {
    return false;
  }

  return true;
}

async function readLocales(datasource: Datasource) {
  const localeKeys = await datasource.listLocales();
  const locales = Object.fromEntries(
    await Promise.all(
      localeKeys.map(
        async (localeKey) =>
          [localeKey, (await datasource.readLocale(localeKey)) as Locale] as const,
      ),
    ),
  );

  return { localeKeys, locales };
}

async function readMessages(datasource: Datasource) {
  const messageKeys = await datasource.listMessages();
  const messages = Object.fromEntries(
    await Promise.all(
      messageKeys.map(
        async (messageKey) =>
          [messageKey, (await datasource.readMessage(messageKey)) as Message] as const,
      ),
    ),
  );

  return { messageKeys, messages };
}

function resolveLocaleExampleChain(localeKey: string, locales: Record<string, Locale>): string[] {
  const chain: string[] = [];
  const seen = new Set<string>();
  let currentKey: string | undefined = localeKey;

  while (currentKey && !seen.has(currentKey)) {
    seen.add(currentKey);
    chain.unshift(currentKey);
    currentKey = locales[currentKey]?.mergeExamplesFrom;
  }

  return chain;
}

function expandLocaleExample(
  localeKey: string,
  sourceLocale: string,
  example: LocaleExample,
  exampleIndex: number,
): ExpandedLocaleExample[] {
  if (!example.matrix) {
    return [
      {
        locale: localeKey,
        sourceLocale,
        exampleIndex,
        description: example.description,
        rawMessage: example.rawMessage,
        message: example.message,
        values: example.values as MessageValues<any> | undefined,
        context: example.context,
        formats: example.formats,
        currency: example.currency,
        timeZone: example.timeZone,
        expectedByRuntime: example.expectedByRuntime,
      },
    ];
  }

  const combinations = getMatrixCombinations(example.matrix);

  return combinations.map((combination, matrixIndex) => ({
    locale: localeKey,
    sourceLocale,
    exampleIndex,
    matrixIndex,
    description: applyCombinationToValue(example.description, combination) as string | undefined,
    rawMessage: applyCombinationToValue(example.rawMessage, combination) as string | undefined,
    message: applyCombinationToValue(example.message, combination) as string | undefined,
    values: applyCombinationToValue(example.values, combination) as MessageValues<any> | undefined,
    context: applyCombinationToValue(example.context, combination) as
      | Record<string, unknown>
      | undefined,
    formats: applyCombinationToValue(example.formats, combination) as FormatPresets | undefined,
    currency: applyCombinationToValue(example.currency, combination) as string | undefined,
    timeZone: applyCombinationToValue(example.timeZone, combination) as string | undefined,
    expectedByRuntime: applyCombinationToValue(example.expectedByRuntime, combination) as
      | Record<string, string>
      | undefined,
  }));
}

function resolveLocaleExamples(
  localeKey: string,
  locales: Record<string, Locale>,
): ExpandedLocaleExample[] {
  const chain = resolveLocaleExampleChain(localeKey, locales);
  const result: ExpandedLocaleExample[] = [];
  let exampleIndex = 0;

  for (const sourceLocale of chain) {
    const examples = locales[sourceLocale]?.examples || [];

    for (const example of examples) {
      result.push(...expandLocaleExample(localeKey, sourceLocale, example, exampleIndex));
      exampleIndex += 1;
    }
  }

  return result;
}

function expandMessageExample(
  messageKey: string,
  example: MessageExample,
  exampleIndex: number,
): ExpandedMessageExample[] {
  if (!example.matrix) {
    return [
      {
        message: messageKey,
        locale: example.locale,
        exampleIndex,
        description: example.description,
        values: example.values as MessageValues<any> | undefined,
        context: example.context,
        formats: example.formats,
        currency: example.currency,
        timeZone: example.timeZone,
        expectedByRuntime: example.expectedByRuntime,
      },
    ];
  }

  const combinations = getMatrixCombinations(example.matrix);

  return combinations.map((combination, matrixIndex) => ({
    message: messageKey,
    locale: applyCombinationToValue(example.locale, combination) as string,
    exampleIndex,
    matrixIndex,
    description: applyCombinationToValue(example.description, combination) as string | undefined,
    values: applyCombinationToValue(example.values, combination) as MessageValues<any> | undefined,
    context: applyCombinationToValue(example.context, combination) as
      | Record<string, unknown>
      | undefined,
    formats: applyCombinationToValue(example.formats, combination) as FormatPresets | undefined,
    currency: applyCombinationToValue(example.currency, combination) as string | undefined,
    timeZone: applyCombinationToValue(example.timeZone, combination) as string | undefined,
    expectedByRuntime: applyCombinationToValue(example.expectedByRuntime, combination) as
      | Record<string, string>
      | undefined,
  }));
}

function resolveMessageExamples(messageKey: string, message: Message): ExpandedMessageExample[] {
  const result: ExpandedMessageExample[] = [];
  let exampleIndex = 0;

  for (const example of message.examples || []) {
    result.push(...expandMessageExample(messageKey, example, exampleIndex));
    exampleIndex += 1;
  }

  return result;
}

async function evaluateLocaleExample(
  projectConfig: ProjectConfig,
  datasource: Datasource,
  locales: Record<string, Locale>,
  revision: string,
  example: ExpandedLocaleExample,
  includeEvaluationInput: boolean,
): Promise<ResolvedLocaleExample> {
  const evaluationValues = coerceExampleValuesIsoDates(
    example.values as Record<string, unknown> | undefined,
  ) as MessageValues<any> | undefined;

  if (example.message) {
    const datafile = await buildMessageDatafile(
      projectConfig,
      datasource,
      example.message,
      example.locale,
      revision,
    );
    const messagevisor = createMessagevisor({
      datafile,
      locale: example.locale,
      context: example.context as Context | undefined,
      modules: projectConfig.modules || [],
      logLevel: "warn",
    });

    return {
      ...example,
      evaluatedTranslation: messagevisor.translate(example.message, evaluationValues as any, {
        context: example.context as Context | undefined,
        formats: example.formats,
        currency: example.currency,
        timeZone: example.timeZone,
      }),
      evaluationInput: includeEvaluationInput
        ? {
            datafile,
            formats: example.formats,
            context: example.context,
            values: evaluationValues as Record<string, unknown> | undefined,
            currency: example.currency,
            timeZone: example.timeZone,
          }
        : undefined,
    };
  }

  const resolvedDefaultFormats = resolveFormats(example.locale, locales);
  const defaultFormats = resolvedDefaultFormats
    ? {
        [example.locale]: resolvedDefaultFormats,
      }
    : undefined;
  const messagevisor = createMessagevisor({
    locale: example.locale,
    context: example.context as Context | undefined,
    defaultFormats,
    modules: projectConfig.modules || [],
    logLevel: "warn",
  });

  return {
    ...example,
    evaluatedTranslation: messagevisor.formatMessage(
      example.rawMessage || "",
      evaluationValues || {},
      {
        formats: example.formats,
        currency: example.currency,
        timeZone: example.timeZone,
      },
    ),
    evaluationInput: includeEvaluationInput
      ? {
          defaultFormats,
          formats: example.formats,
          context: example.context,
          values: evaluationValues as Record<string, unknown> | undefined,
          currency: example.currency,
          timeZone: example.timeZone,
        }
      : undefined,
  };
}

async function evaluateMessageExample(
  projectConfig: ProjectConfig,
  datasource: Datasource,
  revision: string,
  example: ExpandedMessageExample,
  includeEvaluationInput: boolean,
): Promise<ResolvedMessageExample> {
  const evaluationValues = coerceExampleValuesIsoDates(
    example.values as Record<string, unknown> | undefined,
  ) as MessageValues<any> | undefined;

  const datafile = await buildMessageDatafile(
    projectConfig,
    datasource,
    example.message,
    example.locale,
    revision,
  );
  const messagevisor = createMessagevisor({
    datafile,
    locale: example.locale,
    context: example.context as Context | undefined,
    modules: projectConfig.modules || [],
    logLevel: "warn",
  });

  return {
    ...example,
    evaluatedTranslation: messagevisor.translate(example.message, evaluationValues as any, {
      context: example.context as Context | undefined,
      formats: example.formats,
      currency: example.currency,
      timeZone: example.timeZone,
    }),
    evaluationInput: includeEvaluationInput
      ? {
          datafile,
          formats: example.formats,
          context: example.context,
          values: evaluationValues as Record<string, unknown> | undefined,
          currency: example.currency,
          timeZone: example.timeZone,
        }
      : undefined,
  };
}

async function collectExamplesForExecution(
  projectConfig: ProjectConfig,
  datasource: Datasource,
  sourceSelection: ExampleSourceSelection,
  localeFilter?: string,
  messageFilter?: string,
  setKey?: string,
  includeEvaluationInput = false,
): Promise<ExamplesOutput> {
  const { localeKeys, locales } = await readLocales(datasource);
  const { messageKeys, messages } = await readMessages(datasource);

  if (localeFilter && !localeKeys.includes(localeFilter)) {
    throw new MessagevisorCLIError(
      `Unknown locale "${localeFilter}". Available locales: ${localeKeys.join(", ") || "none"}.`,
    );
  }

  if (messageFilter && !messageKeys.includes(messageFilter)) {
    throw new MessagevisorCLIError(
      `Unknown message "${messageFilter}". Available messages: ${messageKeys.join(", ") || "none"}.`,
    );
  }

  const selectedLocaleKeys = localeFilter ? [localeFilter] : localeKeys;
  const selectedMessageKeys = messageFilter ? [messageFilter] : messageKeys;
  const revision = await datasource.readRevision();
  const localeResults: ResolvedLocaleExample[] = [];
  const messageResults: ResolvedMessageExample[] = [];

  if (sourceSelection.includeLocales) {
    for (const localeKey of selectedLocaleKeys) {
      const examples = resolveLocaleExamples(localeKey, locales);

      for (const example of examples) {
        localeResults.push({
          ...(await evaluateLocaleExample(
            projectConfig,
            datasource,
            locales,
            revision,
            example,
            includeEvaluationInput,
          )),
          set: setKey || undefined,
        });
      }
    }
  }

  if (sourceSelection.includeMessages) {
    for (const messageKey of selectedMessageKeys) {
      const examples = resolveMessageExamples(messageKey, messages[messageKey]);

      for (const example of examples) {
        if (!localeKeys.includes(example.locale)) {
          throw new Error(
            `Unknown locale "${example.locale}" in examples for message "${messageKey}". Available locales: ${localeKeys.join(", ") || "none"}.`,
          );
        }

        if (localeFilter && example.locale !== localeFilter) {
          continue;
        }

        messageResults.push({
          ...(await evaluateMessageExample(
            projectConfig,
            datasource,
            revision,
            example,
            includeEvaluationInput,
          )),
          set: setKey || undefined,
        });
      }
    }
  }

  return {
    locales: localeResults,
    messages: messageResults,
  };
}

export async function resolveExamples(
  projectConfig: ProjectConfig,
  datasource: Datasource,
  options: ResolveExamplesOptions = {},
): Promise<ExamplesOutput> {
  const filters = getExampleFilters(options);
  const sourceSelection = getExampleSourceSelection(options);
  const executions = await getProjectSetExecutions(projectConfig, datasource, options.set);
  const results: ExamplesOutput = {
    locales: [],
    messages: [],
  };

  for (const execution of executions) {
    const executionResults = await collectExamplesForExecution(
      execution.projectConfig,
      execution.datasource,
      sourceSelection,
      options.locale,
      options.message,
      execution.set,
      options.includeEvaluationInput,
    );

    results.locales.push(
      ...executionResults.locales.filter((example) => matchesCommonFilters(example, filters)),
    );
    results.messages.push(
      ...executionResults.messages.filter((example) => matchesCommonFilters(example, filters)),
    );
  }

  return results;
}

function printPlainLocaleExamples(examples: ResolvedLocaleExample[], hasSets: boolean) {
  if (examples.length === 0) {
    console.log(colorize("No locale examples found.", 33));
    return;
  }

  let currentSet: string | undefined;
  let currentLocale: string | undefined;

  for (const example of examples) {
    if (hasSets && example.set !== currentSet) {
      currentSet = example.set;
      currentLocale = undefined;
      console.log(colorize(`Set "${currentSet}":`, 36));
      console.log("");
    }

    if (example.locale !== currentLocale) {
      currentLocale = example.locale;
      console.log(colorize(`${hasSets ? "  " : ""}Locale "${currentLocale}":`, 1));
    }

    const indent = hasSets ? "    " : "  ";
    const titleParts = [`Example #${example.exampleIndex + 1}`];

    if (typeof example.matrixIndex === "number") {
      titleParts.push(`matrix #${example.matrixIndex + 1}`);
    }

    titleParts.push(`from ${example.sourceLocale}`);
    console.log(colorize(`${indent}${titleParts.join(" · ")}`, 36));

    if (example.description) {
      console.log(colorize(`${indent}  Description:`, 2));
      console.log(`${indent}    ${example.description}`);
    }

    if (example.message) {
      console.log(colorize(`${indent}  Message:`, 2));
      console.log(`${indent}    ${example.message}`);
    }

    if (example.rawMessage) {
      console.log(colorize(`${indent}  Raw message:`, 2));
      console.log(`${indent}    ${example.rawMessage}`);
    }

    if (typeof example.values !== "undefined") {
      console.log(colorize(`${indent}  Values:`, 2));
      console.log(`${indent}    ${JSON.stringify(example.values)}`);
    }

    if (typeof example.context !== "undefined") {
      console.log(colorize(`${indent}  Context:`, 2));
      console.log(`${indent}    ${JSON.stringify(example.context)}`);
    }

    if (typeof example.formats !== "undefined") {
      console.log(colorize(`${indent}  Formats:`, 2));
      console.log(`${indent}    ${JSON.stringify(example.formats)}`);
    }

    if (example.currency) {
      console.log(colorize(`${indent}  Currency:`, 2));
      console.log(`${indent}    ${example.currency}`);
    }

    if (example.timeZone) {
      console.log(colorize(`${indent}  Time zone:`, 2));
      console.log(`${indent}    ${example.timeZone}`);
    }

    console.log(colorize(`${indent}  Evaluated translation:`, 2));
    console.log(colorize(`${indent}    ${JSON.stringify(example.evaluatedTranslation)}`, 32));
    console.log("");
  }
}

function printPlainMessageExamples(examples: ResolvedMessageExample[], hasSets: boolean) {
  if (examples.length === 0) {
    console.log(colorize("No message examples found.", 33));
    return;
  }

  let currentSet: string | undefined;
  let currentMessage: string | undefined;

  for (const example of examples) {
    if (hasSets && example.set !== currentSet) {
      currentSet = example.set;
      currentMessage = undefined;
      console.log(colorize(`Set "${currentSet}":`, 36));
      console.log("");
    }

    if (example.message !== currentMessage) {
      currentMessage = example.message;
      console.log(colorize(`${hasSets ? "  " : ""}Message "${currentMessage}":`, 1));
    }

    const indent = hasSets ? "    " : "  ";
    const titleParts = [`Example #${example.exampleIndex + 1}`];

    if (typeof example.matrixIndex === "number") {
      titleParts.push(`matrix #${example.matrixIndex + 1}`);
    }

    titleParts.push(`locale ${example.locale}`);
    console.log(colorize(`${indent}${titleParts.join(" · ")}`, 36));

    if (example.description) {
      console.log(colorize(`${indent}  Description:`, 2));
      console.log(`${indent}    ${example.description}`);
    }

    if (typeof example.values !== "undefined") {
      console.log(colorize(`${indent}  Values:`, 2));
      console.log(`${indent}    ${JSON.stringify(example.values)}`);
    }

    if (typeof example.context !== "undefined") {
      console.log(colorize(`${indent}  Context:`, 2));
      console.log(`${indent}    ${JSON.stringify(example.context)}`);
    }

    if (typeof example.formats !== "undefined") {
      console.log(colorize(`${indent}  Formats:`, 2));
      console.log(`${indent}    ${JSON.stringify(example.formats)}`);
    }

    if (example.currency) {
      console.log(colorize(`${indent}  Currency:`, 2));
      console.log(`${indent}    ${example.currency}`);
    }

    if (example.timeZone) {
      console.log(colorize(`${indent}  Time zone:`, 2));
      console.log(`${indent}    ${example.timeZone}`);
    }

    console.log(colorize(`${indent}  Evaluated translation:`, 2));
    console.log(colorize(`${indent}    ${JSON.stringify(example.evaluatedTranslation)}`, 32));
    console.log("");
  }
}

function printPlainExamples(result: ExamplesOutput, hasSets: boolean) {
  if (result.locales.length === 0 && result.messages.length === 0) {
    console.log(colorize("No examples found.", 33));
    return;
  }

  console.log("");
  console.log(colorize("Messagevisor examples", 1));
  console.log(`  Locale examples:  ${result.locales.length}`);
  console.log(`  Message examples: ${result.messages.length}`);
  if (hasSets) {
    console.log(
      `  Sets:             ${
        new Set(
          [...result.locales, ...result.messages].map((example) => example.set).filter(Boolean),
        ).size
      }`,
    );
  }
  console.log("");

  if (result.locales.length > 0) {
    console.log(colorize("Locales", 1));
    console.log("");
    printPlainLocaleExamples(result.locales, hasSets);
  }

  if (result.messages.length > 0) {
    console.log(colorize("Messages", 1));
    console.log("");
    printPlainMessageExamples(result.messages, hasSets);
  }

  const total = result.locales.length + result.messages.length;
  console.log(colorize(`Found ${total} example${total === 1 ? "" : "s"}.`, 32));
  console.log(colorize("Tip: use --json --pretty for structured output.", 2));
}

export const examplesPlugin: Plugin = {
  command: "examples",
  handler: async ({ projectConfig, datasource, parsed }) => {
    try {
      const results = await resolveExamples(projectConfig, datasource, {
        set: parsed.set,
        locale: parsed.locale,
        exampleIndex: parsed.exampleIndex,
        matrixIndex: parsed.matrixIndex,
        descriptionPattern: parsed.descriptionPattern,
        translationPattern: parsed.translationPattern,
        onlyMessages: parsed.onlyMessages,
        onlyLocales: parsed.onlyLocales,
        includeEvaluationInput: parsed.includeEvaluationInput,
      });

      if (parsed.json) {
        console.log(parsed.pretty ? JSON.stringify(results, null, 2) : JSON.stringify(results));
        return;
      }

      printPlainExamples(results, projectConfig.sets);
    } catch (error) {
      if (printMessagevisorCLIError(error)) {
        return false;
      }

      throw error;
    }
  },
  examples: [
    { command: "examples", description: "list all locale and message examples" },
    { command: "examples --locale=en-US", description: "list examples for a specific locale" },
    {
      command: "examples --exampleIndex=2 --matrixIndex=3",
      description: "list a specific expanded matrix example",
    },
    {
      command: "examples --descriptionPattern=welcome --translationPattern=adult",
      description: "filter examples by description or evaluated translation",
    },
    {
      command: "examples --onlyMessages",
      description: "list only message examples",
    },
    {
      command: "examples --onlyLocales",
      description: "list only locale examples",
    },
    { command: "examples --json --pretty", description: "print examples as JSON" },
  ],
};
