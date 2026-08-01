import type { Attribute, Locale, Message, Target, Segment, Test } from "@messagevisor/types";

import type { DatafileFile } from "../datasource";
import { MessagevisorCLIError, printMessagevisorCLIError } from "../error";
import { assertProjectSetJsonSelection, getProjectSetExecutions } from "../sets";
import { matchesPattern } from "../targeting";
import { CLI_FORMAT_GREEN, CLI_FORMAT_YELLOW, colorize } from "../tester/cliFormat";
import {
  expandLocaleAssertions,
  expandMessageAssertions,
  expandSegmentAssertions,
  expandTargetAssertions,
} from "../tester/matrix";

type EntityType = "messages" | "locales" | "segments" | "attributes" | "targets" | "tests";
type ListType = EntityType | "datafiles";

type ListableEntity = Message | Locale | Segment | Attribute | Target;

interface ParsedEntity<T> {
  key: string;
  entity: T;
}

interface EntitiesWithTests {
  messages: string[];
  locales: string[];
  segments: string[];
  targets: string[];
}

function toArray(value: unknown): string[] {
  if (typeof value === "undefined") {
    return [];
  }

  return Array.isArray(value) ? value : [String(value)];
}

function toRegex(pattern: string) {
  return new RegExp(pattern, "i");
}

function parseBooleanOption(name: string, value: unknown): boolean {
  if (value === true || value === "true") {
    return true;
  }

  if (value === false || value === "false") {
    return false;
  }

  throw new MessagevisorCLIError(`Invalid ${name}: expected true or false`);
}

function matchesOptionalBoolean(
  optionValue: unknown,
  actualValue: boolean | undefined,
  optionName: string,
  defaultValue = false,
) {
  if (typeof optionValue === "undefined") {
    return true;
  }

  return (actualValue ?? defaultValue) === parseBooleanOption(optionName, optionValue);
}

function hasFormats(formats: unknown) {
  return typeof formats !== "undefined";
}

function hasContext(context: unknown) {
  return typeof context !== "undefined";
}

function hasMeta(meta: unknown) {
  return typeof meta !== "undefined";
}

function hasOverrides(overrides: unknown) {
  return Array.isArray(overrides) && overrides.length > 0;
}

async function getEntitiesWithTests(datasource: any): Promise<EntitiesWithTests> {
  const messages = new Set<string>();
  const locales = new Set<string>();
  const segments = new Set<string>();
  const targets = new Set<string>();

  const testKeys = await datasource.listTests();

  for (const testKey of testKeys) {
    const test = (await datasource.readTest(testKey)) as Test;

    if ("message" in test) {
      messages.add(test.message);
      continue;
    }

    if ("locale" in test) {
      locales.add(test.locale);
      continue;
    }

    if ("segment" in test) {
      segments.add(test.segment);
      continue;
    }

    if ("target" in test) {
      targets.add(test.target);
    }
  }

  return {
    messages: Array.from(messages).sort(),
    locales: Array.from(locales).sort(),
    segments: Array.from(segments).sort(),
    targets: Array.from(targets).sort(),
  };
}

function getSelectedEntityType(options: any): ListType {
  const selected = (
    ["datafiles", "messages", "locales", "segments", "attributes", "targets", "tests"] as ListType[]
  ).filter((entityType) => Boolean(options[entityType]));

  if (selected.length === 0) {
    throw new MessagevisorCLIError(
      "Nothing to list. Pass exactly one of --datafiles, --messages, --locales, --segments, --attributes, --targets, or --tests.",
    );
  }

  if (selected.length > 1) {
    throw new MessagevisorCLIError(
      "Pass exactly one of --datafiles, --messages, --locales, --segments, --attributes, --targets, or --tests.",
    );
  }

  return selected[0];
}

function validateFilters(entityType: EntityType, options: any) {
  if ((options.withTests || options.withoutTests) && entityType === "attributes") {
    throw new MessagevisorCLIError(
      "--with-tests and --without-tests are not supported for attributes.",
    );
  }
}

async function listEntityKeys(datasource: any, entityType: EntityType) {
  if (entityType === "messages") return datasource.listMessages();
  if (entityType === "locales") return datasource.listLocales();
  if (entityType === "segments") return datasource.listSegments();
  if (entityType === "attributes") return datasource.listAttributes();
  if (entityType === "tests") return datasource.listTests();
  return datasource.listTargets();
}

async function readEntity(datasource: any, entityType: EntityType, key: string) {
  if (entityType === "messages") return (await datasource.readMessage(key)) as Message;
  if (entityType === "locales") return (await datasource.readLocale(key)) as Locale;
  if (entityType === "segments") return (await datasource.readSegment(key)) as Segment;
  if (entityType === "attributes") return (await datasource.readAttribute(key)) as Attribute;
  if (entityType === "tests") return (await datasource.readTest(key)) as Test;
  return (await datasource.readTarget(key)) as Target;
}

async function getTargetFilteredMessageKeys(datasource: any, targetOptions: unknown) {
  const targetKeys = toArray(targetOptions);

  if (targetKeys.length === 0) {
    return undefined;
  }

  const allMessageKeys = await datasource.listMessages();
  const selected = new Set<string>();

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
        selected.add(messageKey);
      }
    }
  }

  return selected;
}

function applySharedFilters(
  item: ParsedEntity<ListableEntity>,
  entityType: EntityType,
  options: any,
  entitiesWithTests?: EntitiesWithTests,
) {
  if (options.keyPattern && !toRegex(options.keyPattern).test(item.key)) {
    return false;
  }

  if (options.description) {
    const description = (item.entity as any).description || "";

    if (!toRegex(options.description).test(description)) {
      return false;
    }
  }

  if ("promotable" in item.entity) {
    const promotable = (item.entity as any).promotable as boolean | undefined;

    if (!matchesOptionalBoolean(options.promotable, promotable, "--promotable")) {
      return false;
    }
  }

  if (options.withTests || options.withoutTests) {
    const entityKeysWithTests = entitiesWithTests?.[entityType as keyof EntitiesWithTests] || [];
    const hasTests = entityKeysWithTests.includes(item.key);

    if (options.withTests && !hasTests) {
      return false;
    }

    if (options.withoutTests && hasTests) {
      return false;
    }
  }

  return true;
}

function applyEntitySpecificFilters(
  item: ParsedEntity<ListableEntity>,
  entityType: EntityType,
  options: any,
) {
  if (entityType === "tests") {
    return true;
  }

  if (entityType === "messages") {
    const message = item.entity as Message;

    if (!matchesOptionalBoolean(options.archived, message.archived, "--archived")) return false;
    if (!matchesOptionalBoolean(options.deprecated, message.deprecated, "--deprecated"))
      return false;
    if (options.withOverrides && !hasOverrides(message.overrides)) return false;
    if (options.withoutOverrides && hasOverrides(message.overrides)) return false;
    if (options.withMeta && !hasMeta(message.meta)) return false;
    if (options.withoutMeta && hasMeta(message.meta)) return false;
    if (options.locale && typeof message.translations?.[options.locale] === "undefined")
      return false;

    return true;
  }

  if (entityType === "locales") {
    const locale = item.entity as Locale;

    if (options.withFormats && !hasFormats(locale.formats)) return false;
    if (options.withoutFormats && hasFormats(locale.formats)) return false;
    if (options.inheritFormatsFrom && locale.inheritFormatsFrom !== options.inheritFormatsFrom)
      return false;
    if (
      options.inheritTranslationsFrom &&
      locale.inheritTranslationsFrom !== options.inheritTranslationsFrom
    ) {
      return false;
    }

    return true;
  }

  if (entityType === "segments") {
    return matchesOptionalBoolean(
      options.archived,
      (item.entity as Segment).archived,
      "--archived",
    );
  }

  if (entityType === "attributes") {
    const attribute = item.entity as Attribute;

    if (!matchesOptionalBoolean(options.archived, attribute.archived, "--archived")) return false;
    if (options.type && attribute.type !== options.type) return false;

    return true;
  }

  const target = item.entity as Target;

  if (options.locale && !target.locales?.includes(options.locale)) return false;
  if (options.withContext && !hasContext(target.context)) return false;
  if (options.withoutContext && hasContext(target.context)) return false;
  if (options.withFormats && !hasFormats(target.formats)) return false;
  if (options.withoutFormats && hasFormats(target.formats)) return false;

  return true;
}

async function listEntities(datasource: any, options: any, entityType: EntityType) {
  validateFilters(entityType, options);

  const entityKeys = await listEntityKeys(datasource, entityType);
  const requiresTestScan = Boolean(options.withTests || options.withoutTests);
  const entitiesWithTests = requiresTestScan ? await getEntitiesWithTests(datasource) : undefined;
  const targetFilteredMessageKeys =
    entityType === "messages"
      ? await getTargetFilteredMessageKeys(datasource, options.target)
      : undefined;
  const result: ParsedEntity<any>[] = [];

  for (const key of entityKeys) {
    if (targetFilteredMessageKeys && !targetFilteredMessageKeys.has(key)) {
      continue;
    }

    const entity = await readEntity(datasource, entityType, key);
    const item = {
      key,
      entity,
    };

    if (!applySharedFilters(item, entityType, options, entitiesWithTests)) {
      continue;
    }

    if (!applyEntitySpecificFilters(item, entityType, options)) {
      continue;
    }

    if (entityType === "tests" && options.applyMatrix) {
      const test = entity as Test;
      if ("message" in test) {
        result.push({
          key,
          entity: { ...test, assertions: expandMessageAssertions(test.assertions || []) },
        });
        continue;
      }

      if ("segment" in test) {
        result.push({
          key,
          entity: { ...test, assertions: expandSegmentAssertions(test.assertions || []) },
        });
        continue;
      }

      if ("locale" in test) {
        result.push({
          key,
          entity: { ...test, assertions: expandLocaleAssertions(test.assertions || []) },
        });
        continue;
      }

      result.push({
        key,
        entity: { ...test, assertions: expandTargetAssertions(test.assertions || []) },
      });
      continue;
    }

    result.push(item);
  }

  return result.map(({ key, entity }) => ({
    key,
    ...entity,
  }));
}

function ucfirst(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function printEntityList(entityType: EntityType, result: Array<{ key: string }>) {
  if (result.length === 0) {
    console.log(`No ${entityType} found.`);
    return;
  }

  console.log(`\n${ucfirst(entityType)}:\n`);

  for (const item of result) {
    console.log(`- ${item.key}`);
  }

  console.log(`\nFound ${result.length} ${entityType}.`);
}

function getDatafileSizeParts(size: number): { value: string; unit: string; color: number } {
  if (size < 1024) {
    return { value: size.toFixed(2), unit: "B", color: 33 };
  }

  if (size < 1024 * 1024) {
    return { value: (size / 1024).toFixed(2), unit: "kB", color: 36 };
  }

  return { value: (size / (1024 * 1024)).toFixed(2), unit: "mB", color: 32 };
}

export function formatDatafileSize(size: number): string {
  const { value, unit, color } = getDatafileSizeParts(size);
  return `${value} ${colorize(unit, color)}`;
}

function formatDatafileSizeColumn(size: number, valueWidth: number): string {
  const { value, unit, color } = getDatafileSizeParts(size);
  return `${value.padStart(valueWidth)} ${" ".repeat(2 - unit.length)}${colorize(unit, color)}`;
}

function getDatafileDirectory(datafilePath: string): string {
  const lastSlashIndex = datafilePath.lastIndexOf("/");
  return lastSlashIndex === -1 ? "" : datafilePath.slice(0, lastSlashIndex);
}

function printDatafiles(result: DatafileFile[], options: any) {
  if (options.json) {
    console.log(options.pretty ? JSON.stringify(result, null, 2) : JSON.stringify(result));
    return;
  }

  if (result.length === 0) {
    console.log(CLI_FORMAT_YELLOW, "No datafiles found.");
    return;
  }

  const pathWidth = Math.max("Datafile".length, ...result.map((datafile) => datafile.path.length));
  const sizeValueWidth = Math.max(
    ...result.map((datafile) => getDatafileSizeParts(datafile.size).value.length),
  );
  const gzipSizeValueWidth = Math.max(
    ...result.map((datafile) => getDatafileSizeParts(datafile.gzipSize).value.length),
  );
  const sizeWidth = Math.max("Size".length, sizeValueWidth + 3);
  const gzipSizeWidth = Math.max("Gzip".length, gzipSizeValueWidth + 3);

  console.log("");
  console.log(
    `  ${colorize("Datafile".padEnd(pathWidth), 36)}  ${colorize(
      "Size".padStart(sizeWidth),
      36,
    )}  ${colorize("Gzip".padStart(gzipSizeWidth), 36)}`,
  );
  console.log(`  ${"-".repeat(pathWidth)}  ${"-".repeat(sizeWidth)}  ${"-".repeat(gzipSizeWidth)}`);

  let previousDirectory: string | undefined;
  for (const datafile of result) {
    const directory = getDatafileDirectory(datafile.path);
    if (previousDirectory !== undefined && directory !== previousDirectory) {
      console.log("");
    }

    console.log(
      `  ${datafile.path.padEnd(pathWidth)}  ${formatDatafileSizeColumn(
        datafile.size,
        sizeValueWidth,
      )}  ${formatDatafileSizeColumn(datafile.gzipSize, gzipSizeValueWidth)}`,
    );
    previousDirectory = directory;
  }

  console.log("");
  console.log(CLI_FORMAT_GREEN, `Found ${result.length} datafiles.`);
}

export const listPlugin = {
  command: "list",
  handler: async ({ datasource, parsed }: any) => {
    try {
      const projectConfig = datasource.getConfig();
      const entityType = getSelectedEntityType(parsed);
      assertProjectSetJsonSelection(projectConfig, parsed.set, parsed.json);

      if (projectConfig.sets) {
        const executions = await getProjectSetExecutions(projectConfig, datasource, parsed.set);

        if (parsed.json) {
          if (entityType === "datafiles") {
            printDatafiles(await executions[0].datasource.listDatafiles(), parsed);
            return;
          }

          const result = await listEntities(executions[0].datasource, parsed, entityType);
          console.log(parsed.pretty ? JSON.stringify(result, null, 2) : JSON.stringify(result));
          return;
        }

        for (const execution of executions) {
          console.log(`\nSet "${execution.set}":`);
          if (entityType === "datafiles") {
            printDatafiles(await execution.datasource.listDatafiles(), parsed);
            console.log("");
            continue;
          }

          printEntityList(entityType, await listEntities(execution.datasource, parsed, entityType));
          console.log("");
        }

        return;
      }

      if (entityType === "datafiles") {
        printDatafiles(await datasource.listDatafiles(), parsed);
        return;
      }

      const result = await listEntities(datasource, parsed, entityType);

      if (parsed.json) {
        console.log(parsed.pretty ? JSON.stringify(result, null, 2) : JSON.stringify(result));
        return;
      }

      printEntityList(entityType, result);
    } catch (error) {
      if (printMessagevisorCLIError(error)) {
        return false;
      }

      throw error;
    }
  },
  examples: [
    { command: "list --datafiles", description: "list generated datafiles and their sizes" },
    { command: "list --messages", description: "list messages" },
    { command: "list --messages --target=web", description: "list messages covered by a target" },
    { command: "list --locales", description: "list locales" },
    { command: "list --segments", description: "list segments" },
    { command: "list --attributes", description: "list attributes" },
    { command: "list --targets", description: "list targets" },
    {
      command: "list --tests --applyMatrix --json",
      description: "list tests with matrix-expanded assertions as JSON",
    },
  ],
};
