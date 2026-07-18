import type {
  Condition,
  FormatPresets,
  GroupSegment,
  Locale,
  Message,
  Segment,
  Target,
} from "@messagevisor/types";

import type { Datasource } from "../datasource";
import { extractIcuStyleReferences } from "../icuStyleReferences";
import { MessagevisorCLIError, printMessagevisorCLIError } from "../error";
import { assertProjectSetJsonSelection, getProjectSetExecutions } from "../sets";
import { matchesPattern, targetIncludesMessage } from "../targeting";

export interface UsageReference {
  type: "message" | "segment" | "locale" | "target" | "test";
  key: string;
  path: string;
}

export interface FindUsageQuery {
  message?: string;
  segment?: string;
  attribute?: string;
  locale?: string;
  format?: string;
}

function parseFormatKey(format: string): [string, string] {
  const separatorIndex = format.indexOf(".");

  if (separatorIndex <= 0 || separatorIndex === format.length - 1) {
    throw new MessagevisorCLIError(
      `Invalid format "${format}". Expected <type>.<preset>, for example number.currency.`,
    );
  }

  return [format.slice(0, separatorIndex), format.slice(separatorIndex + 1)];
}

function visitConditions(
  value: Condition | Condition[] | "*" | undefined,
  visit: (item: any) => void,
) {
  if (!value || value === "*") return;
  if (Array.isArray(value)) return value.forEach((item) => visitConditions(item, visit));
  if (typeof value === "string") return;
  if ("and" in value) return visitConditions(value.and, visit);
  if ("or" in value) return visitConditions(value.or, visit);
  if ("not" in value) return visitConditions(value.not, visit);
  visit(value);
}

function segmentKeys(value: GroupSegment | GroupSegment[] | "*" | undefined, result: Set<string>) {
  if (!value || value === "*") return;
  if (Array.isArray(value)) return value.forEach((item) => segmentKeys(item, result));
  if (typeof value === "string") return void result.add(value);
  if ("and" in value) return segmentKeys(value.and, result);
  if ("or" in value) return segmentKeys(value.or, result);
  segmentKeys(value.not, result);
}

export async function findUsage(
  datasource: Datasource,
  query: FindUsageQuery,
): Promise<UsageReference[]> {
  const [messageKeys, segmentKeyList, attributeKeys, localeKeys, targetKeys, testKeys] =
    await Promise.all([
      datasource.listMessages(),
      datasource.listSegments(),
      datasource.listAttributes(),
      datasource.listLocales(),
      datasource.listTargets(),
      datasource.listTests(),
    ]);

  const selectedEntity = query.message
    ? (["message", query.message, messageKeys] as const)
    : query.segment
      ? (["segment", query.segment, segmentKeyList] as const)
      : query.attribute
        ? (["attribute", query.attribute.split(".")[0], attributeKeys] as const)
        : query.locale
          ? (["locale", query.locale, localeKeys] as const)
          : undefined;
  if (selectedEntity && !selectedEntity[2].includes(selectedEntity[1])) {
    throw new MessagevisorCLIError(`Unknown ${selectedEntity[0]} "${selectedEntity[1]}".`);
  }

  const formatKey = query.format ? parseFormatKey(query.format) : undefined;
  const [messages, segments, locales, targets, tests] = await Promise.all([
    Promise.all(messageKeys.map((key) => datasource.readMessage(key))),
    Promise.all(segmentKeyList.map((key) => datasource.readSegment(key))),
    Promise.all(localeKeys.map((key) => datasource.readLocale(key))),
    Promise.all(targetKeys.map((key) => datasource.readTarget(key))),
    Promise.all(testKeys.map((key) => datasource.readTest(key))),
  ]);
  const references: UsageReference[] = [];
  const referenceKeys = new Set<string>();

  function add(type: UsageReference["type"], key: string, path: string) {
    const referenceKey = `${type}\0${key}\0${path}`;
    if (referenceKeys.has(referenceKey)) return;
    referenceKeys.add(referenceKey);
    references.push({ type, key, path });
  }

  messages.forEach((message: Message, messageIndex) => {
    const key = messageKeys[messageIndex];
    if (query.locale && typeof message.translations?.[query.locale] !== "undefined") {
      add("message", key, `translations.${query.locale}`);
    }
    (message.overrides || []).forEach((override, overrideIndex) => {
      const segmentsUsed = new Set<string>();
      segmentKeys(override.segments, segmentsUsed);
      if (query.segment && segmentsUsed.has(query.segment)) {
        add("message", key, `overrides.${overrideIndex}.segments`);
      }
      if (query.attribute) {
        visitConditions(override.conditions, (condition) => {
          if (
            condition.attribute === query.attribute ||
            condition.attribute?.startsWith(`${query.attribute}.`)
          ) {
            add("message", key, `overrides.${overrideIndex}.conditions`);
          }
        });
      }
      if (query.locale && typeof override.translations?.[query.locale] !== "undefined") {
        add("message", key, `overrides.${overrideIndex}.translations.${query.locale}`);
      }
    });

    if (formatKey) {
      const [type, style] = formatKey;
      for (const [locale, translation] of Object.entries(message.translations || {})) {
        if (
          extractIcuStyleReferences(translation).some(
            (ref) => ref.type === type && ref.style === style,
          )
        ) {
          add("message", key, `translations.${locale}`);
        }
      }
      (message.overrides || []).forEach((override, overrideIndex) => {
        for (const [locale, translation] of Object.entries(override.translations || {})) {
          if (
            extractIcuStyleReferences(translation).some(
              (ref) => ref.type === type && ref.style === style,
            )
          ) {
            add("message", key, `overrides.${overrideIndex}.translations.${locale}`);
          }
        }
      });
    }
  });

  segments.forEach((segment: Segment, index) => {
    if (!query.attribute) return;
    visitConditions(segment.conditions, (condition) => {
      if (
        condition.attribute === query.attribute ||
        condition.attribute?.startsWith(`${query.attribute}.`)
      ) {
        add("segment", segmentKeyList[index], "conditions");
      }
    });
  });

  locales.forEach((locale: Locale, index) => {
    const key = localeKeys[index];
    if (
      query.locale &&
      (locale.inheritTranslationsFrom === query.locale ||
        locale.inheritFormatsFrom === query.locale ||
        locale.mergeExamplesFrom === query.locale)
    ) {
      add("locale", key, "inheritance");
    }
    (locale.examples || []).forEach((example, exampleIndex) => {
      if (query.message && example.message === query.message) {
        add("locale", key, `examples.${exampleIndex}.message`);
      }
      if (formatKey && typeof example.rawMessage === "string") {
        const [type, style] = formatKey;
        if (
          extractIcuStyleReferences(example.rawMessage).some(
            (reference) => reference.type === type && reference.style === style,
          )
        ) {
          add("locale", key, `examples.${exampleIndex}.rawMessage`);
        }
      }
    });
    if (formatKey) {
      const [type, style] = formatKey;
      if ((locale.formats as any)?.[type]?.[style]) add("locale", key, `formats.${type}.${style}`);
    }
  });

  targets.forEach((target: Target, index) => {
    const key = targetKeys[index];
    if (query.message && targetIncludesMessage(target, query.message))
      add("target", key, "messages");
    if (query.locale && (!target.locales || target.locales.includes(query.locale)))
      add("target", key, "locales");
    if (query.locale && target.formats?.[query.locale]) {
      add("target", key, `formats.${query.locale}`);
    }
    if (query.attribute) {
      const rootAttribute = query.attribute.split(".")[0];
      if (Object.prototype.hasOwnProperty.call(target.context || {}, rootAttribute)) {
        add("target", key, `context.${rootAttribute}`);
      }
    }
    if (formatKey) {
      const [type, style] = formatKey;
      if (Object.values(target.formats || {}).some((formats: any) => formats?.[type]?.[style])) {
        add("target", key, `formats.${type}.${style}`);
      }
      for (const field of ["includeFormats", "excludeFormats"] as const) {
        const patterns = target[field]?.[type as keyof FormatPresets];
        const values = typeof patterns === "string" ? [patterns] : patterns || [];
        if (values.some((pattern: string) => matchesPattern(style, pattern))) {
          add("target", key, `${field}.${type}`);
        }
      }
    }
  });

  tests.forEach((test, testIndex) => {
    const testKey = testKeys[testIndex];
    if (query.message && "message" in test && test.message === query.message)
      add("test", testKey, "message");
    if (query.segment && "segment" in test && test.segment === query.segment)
      add("test", testKey, "segment");
    if (query.locale && "locale" in test && test.locale === query.locale)
      add("test", testKey, "locale");
    test.assertions.forEach((assertion: any, assertionIndex: number) => {
      const assertionPath = `assertions.${assertionIndex}`;
      if (
        query.message &&
        (assertion.message === query.message ||
          assertion.expectedToIncludeMessages?.includes(query.message) ||
          assertion.expectedToNotIncludeMessages?.includes(query.message))
      ) {
        add("test", testKey, `${assertionPath}.message`);
      }
      if (query.locale && assertion.locale === query.locale) {
        add("test", testKey, `${assertionPath}.locale`);
      }
      if (formatKey && typeof assertion.rawMessage === "string") {
        const [type, style] = formatKey;
        if (
          extractIcuStyleReferences(assertion.rawMessage).some(
            (reference) => reference.type === type && reference.style === style,
          )
        ) {
          add("test", testKey, `${assertionPath}.rawMessage`);
        }
      }
    });
  });

  return references.sort((a, b) =>
    `${a.type}:${a.key}:${a.path}`.localeCompare(`${b.type}:${b.key}:${b.path}`),
  );
}

export const findUsagePlugin = {
  command: "find-usage",
  handler: async ({ projectConfig, datasource, parsed }: any) => {
    try {
      const query = {
        message: parsed.message,
        segment: parsed.segment,
        attribute: parsed.attribute,
        locale: parsed.locale,
        format: parsed.format,
      };
      if (Object.values(query).filter(Boolean).length !== 1) {
        throw new MessagevisorCLIError(
          "Provide exactly one of --message, --segment, --attribute, --locale, or --format.",
        );
      }
      if (!projectConfig.sets && parsed.set) {
        throw new MessagevisorCLIError(
          "Option --set can only be used when project sets are enabled.",
        );
      }
      assertProjectSetJsonSelection(projectConfig, parsed.set, parsed.json);
      const executions = await getProjectSetExecutions(projectConfig, datasource, parsed.set);

      if (parsed.json) {
        const references = await findUsage(executions[0].datasource, query);
        console.log(JSON.stringify(references, null, parsed.pretty ? 2 : 0));
        return;
      }

      for (const execution of executions) {
        if (projectConfig.sets) console.log(`\nSet "${execution.set}":`);
        const references = await findUsage(execution.datasource, query);
        console.log("");
        if (references.length === 0) {
          console.log("No usage found.");
          continue;
        }
        references.forEach((reference) => {
          console.log(`${reference.type}\t${reference.key}\t${reference.path}`);
        });
      }
    } catch (error) {
      if (printMessagevisorCLIError(error)) return false;
      throw error;
    }
  },
  examples: [
    { command: "find-usage --message=checkout.title", description: "find where a message is used" },
    { command: "find-usage --segment=premium", description: "find where a segment is used" },
    { command: "find-usage --attribute=user.plan", description: "find where an attribute is used" },
    { command: "find-usage --locale=nl", description: "find direct locale usage" },
    { command: "find-usage --format=number.currency", description: "find named ICU format usage" },
  ],
};
