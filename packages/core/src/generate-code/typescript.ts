import * as fs from "fs";
import * as path from "path";

import type { Message, Target } from "@messagevisor/types";

import type { ProjectConfig } from "../config";
import type { Datasource } from "../datasource";
import { MessagevisorCLIError } from "../error";
import { getProjectSetExecutions } from "../sets";

export interface TypeScriptCodeGenerationOptions {
  set?: string | string[];
  target?: string | string[];
  includeMessages?: string | string[];
  excludeMessages?: string | string[];
  react?: boolean;
}

export interface TypeScriptCodeGenerationResult {
  messageKeys: string[];
  files: string[];
}

function toArray(value?: string | string[]): string[] {
  if (typeof value === "undefined") return [];
  return Array.isArray(value) ? value : [value];
}

function matchesPattern(key: string, patterns?: string | string[]) {
  if (!patterns || patterns.length === 0) {
    return false;
  }

  return (Array.isArray(patterns) ? patterns : [patterns]).some((pattern) => {
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    return new RegExp(`^${escaped}$`).test(key);
  });
}

function isAvailable(message: Message) {
  return !message.archived;
}

function sortUnique(values: string[]) {
  return Array.from(new Set(values)).sort();
}

function resolveSelectedSet(projectConfig: ProjectConfig, value?: string | string[]) {
  const sets = toArray(value);

  if (!projectConfig.sets && sets.length > 0) {
    throw new MessagevisorCLIError("Option --set can only be used when project sets are enabled.");
  }

  if (sets.length > 1) {
    throw new MessagevisorCLIError("Only one --set value can be used for code generation.");
  }

  return sets[0];
}

async function collectTargetMessageKeys(
  datasource: Datasource,
  targetKeys: string[],
  allMessageKeys: string[],
) {
  if (targetKeys.length === 0) {
    return allMessageKeys;
  }

  const selected: string[] = [];

  for (const targetKey of targetKeys) {
    const target = (await datasource.readTarget(targetKey)) as Target;
    const includeMessages =
      typeof target.includeMessages === "undefined" ? ["*"] : target.includeMessages;
    const excludeMessages = target.excludeMessages || [];

    for (const messageKey of allMessageKeys) {
      if (
        matchesPattern(messageKey, includeMessages) &&
        !matchesPattern(messageKey, excludeMessages)
      ) {
        selected.push(messageKey);
      }
    }
  }

  return sortUnique(selected);
}

async function collectMessageKeysForDatasource(
  datasource: Datasource,
  options: TypeScriptCodeGenerationOptions,
) {
  const allMessageKeys = await datasource.listMessages();
  const messages: Record<string, Message> = {};

  for (const messageKey of allMessageKeys) {
    messages[messageKey] = await datasource.readMessage(messageKey);
  }

  let messageKeys = await collectTargetMessageKeys(
    datasource,
    toArray(options.target),
    allMessageKeys,
  );

  const includeMessages = toArray(options.includeMessages);
  const excludeMessages = toArray(options.excludeMessages);

  if (includeMessages.length > 0) {
    messageKeys = messageKeys.filter((messageKey) => matchesPattern(messageKey, includeMessages));
  }

  if (excludeMessages.length > 0) {
    messageKeys = messageKeys.filter((messageKey) => !matchesPattern(messageKey, excludeMessages));
  }

  return messageKeys.filter((messageKey) => isAvailable(messages[messageKey]));
}

async function collectMessageKeys(
  projectConfig: ProjectConfig,
  datasource: Datasource,
  options: TypeScriptCodeGenerationOptions,
) {
  const selectedSet = resolveSelectedSet(projectConfig, options.set);
  const executions = await getProjectSetExecutions(projectConfig, datasource, selectedSet);
  const messageKeys: string[] = [];

  for (const execution of executions) {
    messageKeys.push(...(await collectMessageKeysForDatasource(execution.datasource, options)));
  }

  return sortUnique(messageKeys);
}

function renderMessageKeyType(messageKeys: string[]) {
  if (messageKeys.length === 0) {
    return "export type MessagevisorMessageKey = never;\n";
  }

  return [
    "export type MessagevisorMessageKey =",
    ...messageKeys.map((messageKey, index) => {
      const suffix = index === messageKeys.length - 1 ? ";" : "";

      return `  | ${JSON.stringify(messageKey)}${suffix}`;
    }),
    "",
  ].join("\n");
}

function renderSdkFile() {
  return `import type {
  TranslateOptions,
  MessageFormatResult,
  MessagePrimitiveValue,
  MessageValues,
  Messagevisor,
} from "@messagevisor/sdk";
import type { MessagevisorMessageKey } from "./messages";

let instance: Messagevisor | undefined;

export function setInstance(messagevisor: Messagevisor) {
  instance = messagevisor;
}

export function getInstance() {
  if (!instance) {
    throw new Error("Messagevisor instance is not set. Call setInstance(instance) first.");
  }

  return instance;
}

export function translate(
  messageKey: MessagevisorMessageKey,
  values?: Record<string, MessagePrimitiveValue>,
  options?: TranslateOptions,
): string;
export function translate<T>(
  messageKey: MessagevisorMessageKey,
  values: MessageValues<T>,
  options?: TranslateOptions,
): MessageFormatResult<T>;
export function translate<T>(
  messageKey: MessagevisorMessageKey,
  values?: MessageValues<T>,
  options?: TranslateOptions,
) {
  return getInstance().translate(messageKey, values, options);
}

export const t = translate;
`;
}

function renderReactFile() {
  return `import type * as React from "react";
import type {
  TranslateOptions,
  MessageFormatResult,
  MessagePrimitiveValue,
  MessageValues,
} from "@messagevisor/sdk";
import {
  useMessagevisor as useBaseMessagevisor,
  useTranslation as useBaseTranslation,
} from "@messagevisor/react";
import type { MessagevisorMessageKey } from "./messages";

export function useTranslation(
  messageKey: MessagevisorMessageKey,
  values?: Record<string, MessagePrimitiveValue>,
  options?: TranslateOptions,
): string;
export function useTranslation<T>(
  messageKey: MessagevisorMessageKey,
  values: MessageValues<T>,
  options?: TranslateOptions,
): MessageFormatResult<T> | React.ReactNode;
export function useTranslation<T>(
  messageKey: MessagevisorMessageKey,
  values?: MessageValues<T>,
  options?: TranslateOptions,
) {
  return useBaseTranslation(messageKey, values as any, options);
}

export function useMessagevisor() {
  const messagevisor = useBaseMessagevisor();

  return {
    ...messagevisor,
    t: messagevisor.t as typeof useTranslation,
  };
}
`;
}

function renderIndexFile(react?: boolean) {
  return [
    'export type * from "./messages";',
    'export * from "./sdk";',
    react ? 'export * from "./react";' : "",
    "",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

async function writeGeneratedFile(outDir: string, fileName: string, content: string) {
  const filePath = path.join(outDir, fileName);

  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, content.endsWith("\n") ? content : `${content}\n`);

  return filePath;
}

export async function generateTypeScriptCodeForProject(
  projectConfig: ProjectConfig,
  datasource: Datasource,
  outDir: string,
  options: TypeScriptCodeGenerationOptions = {},
): Promise<TypeScriptCodeGenerationResult> {
  const messageKeys = await collectMessageKeys(projectConfig, datasource, options);
  const files = [
    await writeGeneratedFile(outDir, "messages.ts", renderMessageKeyType(messageKeys)),
    await writeGeneratedFile(outDir, "sdk.ts", renderSdkFile()),
    await writeGeneratedFile(outDir, "index.ts", renderIndexFile(options.react)),
  ];

  if (options.react) {
    files.push(await writeGeneratedFile(outDir, "react.ts", renderReactFile()));
  }

  return {
    messageKeys,
    files,
  };
}
