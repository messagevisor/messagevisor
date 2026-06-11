import * as path from "path";

import type { Attribute, Locale, Message, Target, Segment } from "@messagevisor/types";

import type { Plugin } from "../cli";
import { MessagevisorCLIError, printMessagevisorCLIError } from "../error";
import { formatProjectPath } from "../path";
import { getProjectSetExecutions } from "../sets";

type CreateEntityType = "messages" | "locales" | "targets" | "attributes" | "segments";

interface CreateSummary {
  entityType: CreateEntityType;
  requestedKeys: string[];
  createdKeys: string[];
  skippedKeys: string[];
  createdFilePaths: string[];
}

function getSelectedEntityType(parsed: Record<string, unknown>): CreateEntityType {
  const selected = (
    ["messages", "locales", "targets", "attributes", "segments"] as CreateEntityType[]
  ).filter((entityType) => Boolean(parsed[entityType]));

  if (selected.length === 0) {
    throw new MessagevisorCLIError(
      "Nothing to create. Pass exactly one of --messages, --locales, --targets, --attributes, or --segments.",
    );
  }

  if (selected.length > 1) {
    throw new MessagevisorCLIError(
      "Pass exactly one of --messages, --locales, --targets, --attributes, or --segments.",
    );
  }

  return selected[0];
}

async function readInputKeys(parsed: Record<string, unknown>) {
  if (typeof parsed.keys === "string") {
    return parsed.keys;
  }

  if (process.stdin.isTTY) {
    throw new MessagevisorCLIError(
      "Pass --keys=<multiline string> or provide newline-separated keys via stdin.",
    );
  }

  const chunks: string[] = [];

  for await (const chunk of process.stdin) {
    chunks.push(String(chunk));
  }

  return chunks.join("");
}

function parseKeys(input: string) {
  const seen = new Set<string>();
  const keys: string[] = [];

  for (const rawLine of input.split(/\r?\n/g)) {
    const key = rawLine.trim();

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    keys.push(key);
  }

  if (keys.length === 0) {
    throw new MessagevisorCLIError("No keys found. Pass at least one newline-separated key.");
  }

  return keys;
}

function getParserExtension(projectConfig: any) {
  return (projectConfig.parser as any).extension || "yml";
}

function getEntityDirectoryPath(projectConfig: any, entityType: CreateEntityType) {
  if (entityType === "messages") {
    return projectConfig.messagesDirectoryPath;
  }

  if (entityType === "locales") {
    return projectConfig.localesDirectoryPath;
  }

  if (entityType === "targets") {
    return projectConfig.targetsDirectoryPath;
  }

  if (entityType === "attributes") {
    return projectConfig.attributesDirectoryPath;
  }

  return projectConfig.segmentsDirectoryPath;
}

function getEntityFilePath(projectConfig: any, entityType: CreateEntityType, key: string) {
  return (
    path.join(
      getEntityDirectoryPath(projectConfig, entityType),
      ...key.split(projectConfig.namespaceCharacter),
    ) + `.${getParserExtension(projectConfig)}`
  );
}

async function createEntityShell(
  datasource: any,
  entityType: CreateEntityType,
): Promise<Message | Locale | Target | Attribute | Segment> {
  if (entityType === "messages") {
    const localeKeys = await datasource.listLocales();

    if (localeKeys.length === 0) {
      throw new MessagevisorCLIError(
        "Cannot create messages without at least one locale. Create a locale first.",
      );
    }

    return {
      description: "",
      translations: {
        [localeKeys[0]]: "",
      },
    };
  }

  if (entityType === "locales") {
    return {
      description: "",
    };
  }

  if (entityType === "targets") {
    return {
      description: "",
      includeMessages: ["*"],
    };
  }

  if (entityType === "attributes") {
    return {
      description: "",
      type: "string",
    };
  }

  return {
    description: "",
    conditions: "*",
  };
}

async function listExistingKeys(datasource: any, entityType: CreateEntityType) {
  if (entityType === "messages") {
    return datasource.listMessages();
  }

  if (entityType === "locales") {
    return datasource.listLocales();
  }

  if (entityType === "targets") {
    return datasource.listTargets();
  }

  if (entityType === "attributes") {
    return datasource.listAttributes();
  }

  return datasource.listSegments();
}

async function writeEntity(datasource: any, entityType: CreateEntityType, key: string) {
  const entity = await createEntityShell(datasource, entityType);

  if (entityType === "messages") {
    await datasource.writeMessage(key, entity as Message);
    return;
  }

  if (entityType === "locales") {
    await datasource.writeLocale(key, entity as Locale);
    return;
  }

  if (entityType === "targets") {
    await datasource.writeTarget(key, entity as Target);
    return;
  }

  if (entityType === "attributes") {
    await datasource.writeAttribute(key, entity as Attribute);
    return;
  }

  await datasource.writeSegment(key, entity as Segment);
}

async function createDefinitions(
  projectConfig: any,
  datasource: any,
  entityType: CreateEntityType,
  requestedKeys: string[],
): Promise<CreateSummary> {
  const existingKeys = new Set(await listExistingKeys(datasource, entityType));
  const createdKeys: string[] = [];
  const skippedKeys: string[] = [];
  const createdFilePaths: string[] = [];

  for (const key of requestedKeys) {
    if (existingKeys.has(key)) {
      skippedKeys.push(key);
      continue;
    }

    await writeEntity(datasource, entityType, key);
    createdKeys.push(key);
    createdFilePaths.push(
      formatProjectPath(projectConfig, getEntityFilePath(projectConfig, entityType, key)),
    );
    existingKeys.add(key);
  }

  return {
    entityType,
    requestedKeys,
    createdKeys,
    skippedKeys,
    createdFilePaths,
  };
}

function printSummary(summary: CreateSummary) {
  console.log("");
  console.log(`Entity type      : ${summary.entityType}`);
  console.log(`Requested        : ${summary.requestedKeys.length}`);
  console.log(`Created          : ${summary.createdKeys.length}`);
  console.log(`Skipped existing : ${summary.skippedKeys.length}`);
}

export const createPlugin: Plugin = {
  command: "create",
  handler: async ({ projectConfig, datasource, parsed }) => {
    try {
      if (projectConfig.sets && !parsed.set) {
        throw new MessagevisorCLIError("Pass --set=<set>");
      }

      if (projectConfig.sets) {
        const [execution] = await getProjectSetExecutions(projectConfig, datasource, parsed.set);
        projectConfig = execution.projectConfig;
        datasource = execution.datasource;
      }

      const entityType = getSelectedEntityType(parsed);
      const requestedKeys = parseKeys(await readInputKeys(parsed));
      const summary = await createDefinitions(projectConfig, datasource, entityType, requestedKeys);

      if (parsed.json) {
        console.log(parsed.pretty ? JSON.stringify(summary, null, 2) : JSON.stringify(summary));
        return;
      }

      printSummary(summary);
    } catch (error) {
      if (printMessagevisorCLIError(error)) {
        return false;
      }

      throw error;
    }
  },
  examples: [
    {
      command: `create --messages --keys=$'auth.signin\\nauth.signout'`,
      description: "create missing message definitions from newline-separated keys",
    },
    {
      command: `create --locales --keys=$'en\\nnl'`,
      description: "create missing locale definitions",
    },
    {
      command: `create --attributes --keys=$'plan\\nplatform'`,
      description: "create missing attribute definitions",
    },
  ],
};
