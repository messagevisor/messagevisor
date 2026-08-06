/* eslint-disable @typescript-eslint/no-unused-vars */
import * as fs from "fs";
import * as path from "path";

import type {
  Attribute,
  Condition,
  Locale,
  Message,
  Target,
  Segment,
  Test,
} from "@messagevisor/types";

import type { ProjectConfig } from "../config";
import type { Datasource } from "../datasource";
import { MessagevisorCLIError, printMessagevisorCLIError } from "../error";
import { lintProject, type LintError } from "../linter";
import { formatProjectPath } from "../path";
import { CLI_FORMAT_BOLD, CLI_FORMAT_GREEN, colorize } from "../tester/cliFormat";
import { prettyDuration } from "../tester/prettyDuration";
import { matchesPattern } from "../targeting";

type EntityType = "locale" | "attribute" | "segment" | "target" | "message" | "test";
type ConflictPolicy = "source" | "destination" | "fail";
type PromotionAuditFormat = "json" | "markdown";

type EntityValue = Locale | Attribute | Segment | Target | Message | Test;

function isPromotable(entity: { promotable?: boolean } | undefined) {
  return entity?.promotable !== false;
}

interface PromotionConflict {
  type: EntityType;
  key: string;
  path: string;
  source: unknown;
  destination: unknown;
}

interface EntityPlan {
  type: EntityType;
  key: string;
  source: EntityValue;
  destination?: EntityValue;
  merged: EntityValue;
  conflicts: PromotionConflict[];
}

export interface PromoteProjectSetsOptions {
  from?: string;
  to?: string;
  target?: string | string[];
  locale?: string | string[];
  includeMessages?: string | string[];
  excludeMessages?: string | string[];
  excludeOverrides?: boolean;
  conflicts?: ConflictPolicy;
  allowEmpty?: boolean;
  apply?: boolean;
  audit?: boolean | PromotionAuditFormat;
  showUnchanged?: boolean;
}

export interface PromoteProjectSetsResult {
  from: string;
  to: string;
  apply: boolean;
  duration: number;
  filters: {
    targets: string[];
    locales: string[];
    includeMessages: string[];
    excludeMessages: string[];
    excludeOverrides: boolean;
    conflicts: ConflictPolicy;
  };
  dependencies: {
    locales: number;
    attributes: number;
    segments: number;
    targets: number;
    messages: number;
    tests: number;
  };
  files: {
    created: string[];
    updated: string[];
    unchanged: string[];
  };
  conflicts: PromotionConflict[];
  auditFilePath?: string;
}

function assertAllowedPromotionFlow(projectConfig: ProjectConfig, from: string, to: string) {
  const allowedFlows = projectConfig.promotionFlows;

  if (typeof allowedFlows === "undefined") {
    return;
  }

  const isAllowed = allowedFlows.some((flow) => flow.from === from && flow.to === to);

  if (isAllowed) {
    return;
  }

  const allowedList = allowedFlows.map((flow) => `${flow.from} -> ${flow.to}`).join(", ") || "none";

  throw new MessagevisorCLIError(
    `Promotion from "${from}" to "${to}" is not allowed by this project's configured promotionFlows.\nAllowed flows: ${allowedList}.\nChoose one of the allowed promotion paths or update messagevisor.config.js if this flow should be permitted.`,
  );
}

function toArray(value: string | string[] | undefined): string[] {
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

function getArrayEntryIdentity(value: unknown): string | undefined {
  if (!isPlainObject(value)) {
    return undefined;
  }

  if (typeof value.description === "string") {
    return `description:${value.description}`;
  }

  const identity: Record<string, unknown> = {};

  for (const key of [
    "locale",
    "target",
    "segment",
    "context",
    "values",
    "withFlags",
    "withVariations",
    "currency",
    "timeZone",
  ]) {
    if (typeof value[key] !== "undefined") {
      identity[key] = value[key];
    }
  }

  return Object.keys(identity).length > 0 ? JSON.stringify(identity) : undefined;
}

function deepMerge(destination: unknown, source: unknown): unknown {
  if (typeof destination === "undefined") return source;
  if (typeof source === "undefined") return destination;

  if (Array.isArray(destination) && Array.isArray(source)) {
    const result = [...source];
    const sourceIdentities = new Set(
      source.map(getArrayEntryIdentity).filter((value): value is string => Boolean(value)),
    );

    for (const entry of destination) {
      const identity = getArrayEntryIdentity(entry);

      if (!identity && !result.some((item) => deepEqual(item, entry))) {
        result.push(entry);
      } else if (
        identity &&
        !sourceIdentities.has(identity) &&
        !result.some((item) => getArrayEntryIdentity(item) === identity)
      ) {
        result.push(entry);
      }
    }

    return result;
  }

  if (isPlainObject(destination) && isPlainObject(source)) {
    const result: Record<string, unknown> = { ...destination };

    for (const key of Object.keys(source)) {
      result[key] = deepMerge(result[key], source[key]);
    }

    return result;
  }

  return source;
}

function deepMergeWithPolicy(
  destination: unknown,
  source: unknown,
  policy: ConflictPolicy,
  conflicts: Array<Omit<PromotionConflict, "type" | "key">>,
  pathSegments: string[] = [],
): unknown {
  if (typeof destination === "undefined") return source;
  if (typeof source === "undefined") return destination;

  const conflictPath = pathSegments.join(".") || "<root>";

  if (Array.isArray(destination) && Array.isArray(source)) {
    if (!deepEqual(destination, source)) {
      conflicts.push({ path: conflictPath, source, destination });
    }

    if (policy === "destination") {
      const result = [...destination];
      const destinationIdentities = new Set(
        destination.map(getArrayEntryIdentity).filter((value): value is string => Boolean(value)),
      );

      for (const entry of source) {
        const identity = getArrayEntryIdentity(entry);

        if (!identity && !result.some((item) => deepEqual(item, entry))) {
          result.push(entry);
        } else if (
          identity &&
          !destinationIdentities.has(identity) &&
          !result.some((item) => getArrayEntryIdentity(item) === identity)
        ) {
          result.push(entry);
        }
      }

      return result;
    }

    return deepMerge(destination, source);
  }

  if (isPlainObject(destination) && isPlainObject(source)) {
    const result: Record<string, unknown> = { ...destination };

    for (const key of Object.keys(source)) {
      result[key] = deepMergeWithPolicy(result[key], source[key], policy, conflicts, [
        ...pathSegments,
        key,
      ]);
    }

    return result;
  }

  if (!deepEqual(destination, source)) {
    conflicts.push({ path: conflictPath, source, destination });
  }

  return policy === "destination" ? destination : source;
}

function withoutKey<T extends Record<string, unknown>>(entity: T): T {
  const { key: _key, ...rest } = entity;

  return rest as T;
}

function filterLocaleMap<T>(values: Record<string, T> | undefined, locales: Set<string>) {
  if (!values || locales.size === 0) {
    return values;
  }

  return Object.fromEntries(Object.entries(values).filter(([locale]) => locales.has(locale)));
}

function collectGroupSegmentKeys(value: any, result: Set<string>) {
  if (!value || value === "*") return;
  if (typeof value === "string") {
    result.add(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => collectGroupSegmentKeys(entry, result));
    return;
  }
  if (value.and) value.and.forEach((entry: any) => collectGroupSegmentKeys(entry, result));
  if (value.or) value.or.forEach((entry: any) => collectGroupSegmentKeys(entry, result));
  if (value.not) value.not.forEach((entry: any) => collectGroupSegmentKeys(entry, result));
}

function collectConditionDependencies(
  value: Condition | Condition[] | "*" | undefined,
  segments: Set<string>,
  attributes: Set<string>,
) {
  if (!value || value === "*") return;
  if (typeof value === "string") {
    segments.add(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => collectConditionDependencies(entry, segments, attributes));
    return;
  }
  if ("attribute" in value) {
    attributes.add(value.attribute.split(".")[0]);
    return;
  }
  if ("and" in value)
    value.and.forEach((entry) => collectConditionDependencies(entry, segments, attributes));
  if ("or" in value)
    value.or.forEach((entry) => collectConditionDependencies(entry, segments, attributes));
  if ("not" in value)
    value.not.forEach((entry) => collectConditionDependencies(entry, segments, attributes));
}

function mergeMessage(
  messageKey: string,
  destination: Message | undefined,
  source: Message,
  policy: ConflictPolicy,
  conflicts: PromotionConflict[],
): Message {
  if (!destination) {
    const overrides = (source.overrides || []).filter((override) => isPromotable(override));

    return {
      ...source,
      overrides: overrides.length > 0 ? overrides : undefined,
    };
  }

  validateMessageOverrideKeys(messageKey, source);
  validateMessageOverrideKeys(messageKey, destination);

  const sourceOverrides = source.overrides || [];
  const destinationOverrides = destination.overrides || [];
  const mergedOverrideKeys = new Set<string>();
  const overrides: Message["overrides"] = [];

  for (const sourceOverride of sourceOverrides) {
    if (!isPromotable(sourceOverride)) {
      continue;
    }

    const destinationOverride = destinationOverrides.find(
      (override) => override.key === sourceOverride.key,
    );
    mergedOverrideKeys.add(sourceOverride.key);

    if (destinationOverride && !isPromotable(destinationOverride)) {
      overrides.push(destinationOverride);
      continue;
    }

    const overrideConflicts: Array<Omit<PromotionConflict, "type" | "key">> = [];
    const merged = deepMergeWithPolicy(
      destinationOverride,
      sourceOverride,
      policy,
      overrideConflicts,
      ["overrides", sourceOverride.key],
    ) as NonNullable<Message["overrides"]>[number];

    conflicts.push(
      ...overrideConflicts.map((conflict) => ({
        type: "message" as const,
        key: messageKey,
        ...conflict,
      })),
    );

    overrides.push(merged);
  }

  for (const destinationOverride of destinationOverrides) {
    if (!mergedOverrideKeys.has(destinationOverride.key)) {
      overrides.push(destinationOverride);
    }
  }

  const messageConflicts: Array<Omit<PromotionConflict, "type" | "key">> = [];
  const mergedMessage = deepMergeWithPolicy(
    destination,
    { ...source, overrides: undefined },
    policy,
    messageConflicts,
  ) as Message;
  conflicts.push(
    ...messageConflicts.map((conflict) => ({
      type: "message" as const,
      key: messageKey,
      ...conflict,
    })),
  );

  return {
    ...mergedMessage,
    overrides: overrides.length > 0 ? overrides : undefined,
  };
}

function removeMessageOverrides(message: Message): Message {
  const { overrides: _overrides, ...messageWithoutOverrides } = message;

  return messageWithoutOverrides;
}

function filterMessageForLocales(message: Message, locales: Set<string>): Message {
  if (locales.size === 0) {
    return message;
  }

  const overrides = (message.overrides || [])
    .map((override) => ({
      ...override,
      translations: filterLocaleMap(override.translations, locales) || {},
    }))
    .filter((override) => Object.keys(override.translations).length > 0);

  return {
    ...message,
    translations: filterLocaleMap(message.translations, locales) || {},
    overrides: overrides.length > 0 ? overrides : undefined,
  };
}

function filterTargetForLocales(target: Target, locales: Set<string>) {
  if (locales.size === 0) {
    return target;
  }

  return {
    ...target,
    locales: target.locales?.filter((locale) => locales.has(locale)),
    formats: filterLocaleMap(target.formats, locales),
  };
}

function filterTestForLocales(test: any, locales: Set<string>) {
  if (locales.size === 0 || !Array.isArray(test.assertions)) {
    return test;
  }

  return {
    ...test,
    assertions: test.assertions.filter(
      (assertion: any) => !assertion.locale || locales.has(assertion.locale),
    ),
  };
}

function validateMessageOverrideKeys(messageKey: string, message: Message) {
  const keys = new Set<string>();

  for (let index = 0; index < (message.overrides || []).length; index++) {
    const override = (message.overrides || [])[index];

    if (!override.key) {
      throw new Error(
        `Message "${messageKey}" override at index ${index} must define a key before promotion.`,
      );
    }

    if (keys.has(override.key)) {
      throw new Error(`Message "${messageKey}" has duplicate override key "${override.key}".`);
    }

    keys.add(override.key);
  }
}

async function safeRead<T>(
  keys: string[],
  read: (key: string) => Promise<T>,
): Promise<Record<string, T>> {
  const entries = await Promise.all(keys.map(async (key) => [key, await read(key)] as const));
  return Object.fromEntries(entries);
}

async function readDestination<T>(
  key: string,
  read: (key: string) => Promise<T>,
): Promise<T | undefined> {
  try {
    return await read(key);
  } catch {
    return undefined;
  }
}

function formatLintPreflightErrors(set: string, errors: LintError[]) {
  const preview = errors
    .slice(0, 5)
    .map((error) => `${error.filePath}: ${error.message}`)
    .join("\n");
  const suffix = errors.length > 5 ? `\n...and ${errors.length - 5} more` : "";

  return `Set "${set}" failed preflight lint with ${errors.length} error(s).\n${preview}${suffix}`;
}

async function assertSetLintsClean(set: string, datasource: Datasource) {
  const result = await lintProject(datasource.getConfig(), datasource);

  if (result.hasError) {
    throw new Error(formatLintPreflightErrors(set, result.errors));
  }
}

function getEntityFilePath(projectConfig: ProjectConfig, type: EntityType, key: string) {
  const directories: Record<EntityType, string> = {
    locale: projectConfig.localesDirectoryPath,
    attribute: projectConfig.attributesDirectoryPath,
    segment: projectConfig.segmentsDirectoryPath,
    target: projectConfig.targetsDirectoryPath,
    message: projectConfig.messagesDirectoryPath,
    test: projectConfig.testsDirectoryPath,
  };
  const extension = (projectConfig.parser as any).extension || "yml";

  return (
    path.join(directories[type], ...key.split(projectConfig.namespaceCharacter)) + `.${extension}`
  );
}

async function getPromotionPlan(
  sourceDatasource: Datasource,
  destinationDatasource: Datasource,
  options: Required<
    Pick<
      PromoteProjectSetsOptions,
      | "target"
      | "locale"
      | "includeMessages"
      | "excludeMessages"
      | "excludeOverrides"
      | "allowEmpty"
      | "conflicts"
    >
  >,
) {
  const selectedTargets = new Set(toArray(options.target));
  const requestedLocales = new Set(toArray(options.locale));
  const includeMessages = toArray(options.includeMessages);
  const excludeMessages = toArray(options.excludeMessages);
  const hasNoFilters =
    selectedTargets.size === 0 && includeMessages.length === 0 && requestedLocales.size === 0;

  const [localeKeys, targetKeys, messageKeys, segmentKeys, attributeKeys, testKeys] =
    await Promise.all([
      sourceDatasource.listLocales(),
      sourceDatasource.listTargets(),
      sourceDatasource.listMessages(),
      sourceDatasource.listSegments(),
      sourceDatasource.listAttributes(),
      sourceDatasource.listTests(),
    ]);

  for (const locale of Array.from(requestedLocales)) {
    if (!localeKeys.includes(locale)) {
      throw new Error(
        `Unknown source locale "${locale}". Available locales: ${localeKeys.join(", ") || "none"}.`,
      );
    }
  }
  const [locales, targets, messages, segments, attributes, tests] = await Promise.all([
    safeRead<Locale>(localeKeys, (key) => sourceDatasource.readLocale(key)),
    safeRead<Target>(targetKeys, (key) => sourceDatasource.readTarget(key)),
    safeRead<Message>(messageKeys, (key) => sourceDatasource.readMessage(key)),
    safeRead<Segment>(segmentKeys, (key) => sourceDatasource.readSegment(key)),
    safeRead<Attribute>(attributeKeys, (key) => sourceDatasource.readAttribute(key)),
    safeRead<Test>(testKeys, (key) => sourceDatasource.readTest(key)),
  ]);

  function addLocaleWithAncestors(locale: string, result: Set<string>) {
    if (!locales[locale] || result.has(locale)) return;

    result.add(locale);

    if (locales[locale].inheritFormatsFrom)
      addLocaleWithAncestors(locales[locale].inheritFormatsFrom, result);
    if (locales[locale].inheritTranslationsFrom)
      addLocaleWithAncestors(locales[locale].inheritTranslationsFrom, result);
  }

  const promotedTargetKeys = new Set<string>();
  const promotedMessageKeys = new Set<string>();
  const explicitRuntimeLocales = new Set<string>();

  if (hasNoFilters) {
    targetKeys.forEach((key) => promotedTargetKeys.add(key));
    messageKeys.forEach((key) => promotedMessageKeys.add(key));
    localeKeys.forEach((key) => explicitRuntimeLocales.add(key));
  } else {
    selectedTargets.forEach((key) => {
      if (!targets[key]) throw new Error(`Unknown source target "${key}".`);
      promotedTargetKeys.add(key);
      (targets[key].locales || localeKeys).forEach((locale) => explicitRuntimeLocales.add(locale));

      for (const messageKey of messageKeys) {
        const included = matchesPattern(
          messageKey,
          typeof targets[key].includeMessages === "undefined"
            ? ["*"]
            : targets[key].includeMessages,
        );
        const excluded = matchesPattern(messageKey, targets[key].excludeMessages || []);

        if (included && !excluded) {
          promotedMessageKeys.add(messageKey);
        }
      }
    });

    if (includeMessages.length > 0) {
      let matchedMessageCount = 0;

      for (const messageKey of messageKeys) {
        if (
          matchesPattern(messageKey, includeMessages) &&
          !matchesPattern(messageKey, excludeMessages)
        ) {
          promotedMessageKeys.add(messageKey);
          matchedMessageCount++;
        }
      }

      if (matchedMessageCount === 0 && !options.allowEmpty) {
        throw new Error(
          `No source messages matched --includeMessages=${includeMessages.join(", ")}.`,
        );
      }
    }

    if (requestedLocales.size > 0) {
      requestedLocales.forEach((locale) => explicitRuntimeLocales.add(locale));
      if (selectedTargets.size === 0 && includeMessages.length === 0) {
        targetKeys.forEach((key) => promotedTargetKeys.add(key));
        messageKeys.forEach((key) => promotedMessageKeys.add(key));
      }
    }
  }

  for (const messageKey of Array.from(promotedMessageKeys)) {
    if (matchesPattern(messageKey, excludeMessages)) {
      promotedMessageKeys.delete(messageKey);
    }
  }

  if (selectedTargets.size === 0 && requestedLocales.size === 0 && includeMessages.length > 0) {
    for (const messageKey of Array.from(promotedMessageKeys)) {
      const message = messages[messageKey];

      if (!message) continue;

      Object.keys(message.translations || {}).forEach((locale) =>
        explicitRuntimeLocales.add(locale),
      );
      if (!options.excludeOverrides) {
        for (const override of message.overrides || []) {
          if (!isPromotable(override)) {
            continue;
          }

          Object.keys(override.translations || {}).forEach((locale) =>
            explicitRuntimeLocales.add(locale),
          );
        }
      }
    }
  }

  const promotedLocaleKeys = new Set<string>();
  const localeFilterKeys = new Set<string>();
  const localeRestricted = requestedLocales.size > 0 || selectedTargets.size > 0;
  const localeSeeds = requestedLocales.size > 0 ? requestedLocales : explicitRuntimeLocales;
  localeSeeds.forEach((locale) => addLocaleWithAncestors(locale, promotedLocaleKeys));
  (requestedLocales.size > 0 ? requestedLocales : new Set<string>()).forEach((locale) =>
    addLocaleWithAncestors(locale, localeFilterKeys),
  );

  if (hasNoFilters && !localeRestricted && promotedLocaleKeys.size === 0) {
    localeKeys.forEach((key) => promotedLocaleKeys.add(key));
  }

  const promotedSegmentKeys = new Set<string>();
  const promotedAttributeKeys = new Set<string>();

  for (const messageKey of Array.from(promotedMessageKeys)) {
    const message = messages[messageKey];
    if (!message) continue;

    if (!options.excludeOverrides) {
      validateMessageOverrideKeys(messageKey, message);

      for (const override of message.overrides || []) {
        if (!isPromotable(override)) {
          continue;
        }

        collectConditionDependencies(
          override.conditions,
          promotedSegmentKeys,
          promotedAttributeKeys,
        );
        collectGroupSegmentKeys(override.segments, promotedSegmentKeys);
      }
    }
  }

  const pendingSegments = Array.from(promotedSegmentKeys);
  for (let index = 0; index < pendingSegments.length; index++) {
    const segmentKey = pendingSegments[index];
    const segment = segments[segmentKey];

    if (!segment) continue;

    const beforeSize = promotedSegmentKeys.size;
    collectConditionDependencies(segment.conditions, promotedSegmentKeys, promotedAttributeKeys);

    if (promotedSegmentKeys.size > beforeSize) {
      pendingSegments.push(
        ...Array.from(promotedSegmentKeys).filter((key) => !pendingSegments.includes(key)),
      );
    }
  }

  if (hasNoFilters) {
    segmentKeys.forEach((key) => promotedSegmentKeys.add(key));
    attributeKeys.forEach((key) => promotedAttributeKeys.add(key));
  }

  const promotedTestKeys = testKeys.filter((key) => {
    const test = tests[key] as any;
    return (
      promotedMessageKeys.has(test.message) ||
      promotedSegmentKeys.has(test.segment) ||
      promotedTargetKeys.has(test.target) ||
      promotedLocaleKeys.has(test.locale)
    );
  });

  const plans: EntityPlan[] = [];

  async function plan<T extends EntityValue>(
    type: EntityType,
    key: string,
    source: T,
    readDestinationEntity: (key: string) => Promise<T>,
    merge: (destination: T | undefined, source: T, conflicts: PromotionConflict[]) => T = (
      destination,
      sourceValue,
      conflicts,
    ) => {
      const entityConflicts: Array<Omit<PromotionConflict, "type" | "key">> = [];
      const merged = deepMergeWithPolicy(
        destination,
        sourceValue,
        options.conflicts,
        entityConflicts,
      ) as T;
      conflicts.push(...entityConflicts.map((conflict) => ({ type, key, ...conflict })));

      return merged;
    },
  ) {
    const cleanedSource = withoutKey(source as any) as T;
    const destination = await readDestination<T>(key, readDestinationEntity);
    const cleanedDestination = destination ? (withoutKey(destination as any) as T) : undefined;

    if (cleanedDestination && (!isPromotable(cleanedSource) || !isPromotable(cleanedDestination))) {
      plans.push({
        type,
        key,
        source: cleanedSource,
        destination: cleanedDestination,
        merged: cleanedDestination,
        conflicts: [],
      });

      return;
    }

    const conflicts: PromotionConflict[] = [];
    const merged = merge(cleanedDestination, cleanedSource, conflicts);

    plans.push({
      type,
      key,
      source: cleanedSource,
      destination: cleanedDestination,
      merged,
      conflicts,
    });
  }

  for (const key of Array.from(promotedLocaleKeys).sort()) {
    if (locales[key])
      await plan("locale", key, locales[key], (entryKey) =>
        destinationDatasource.readLocale(entryKey),
      );
  }

  for (const key of Array.from(promotedAttributeKeys).sort()) {
    if (attributes[key])
      await plan("attribute", key, attributes[key], (entryKey) =>
        destinationDatasource.readAttribute(entryKey),
      );
  }

  for (const key of Array.from(promotedSegmentKeys).sort()) {
    if (segments[key])
      await plan("segment", key, segments[key], (entryKey) =>
        destinationDatasource.readSegment(entryKey),
      );
  }

  const targetLocaleFilter =
    requestedLocales.size > 0 ? new Set(Array.from(requestedLocales)) : new Set<string>();
  for (const key of Array.from(promotedTargetKeys).sort()) {
    if (targets[key]) {
      await plan(
        "target",
        key,
        filterTargetForLocales(targets[key], targetLocaleFilter),
        (entryKey) => destinationDatasource.readTarget(entryKey),
      );
    }
  }

  const messageLocaleFilter = localeFilterKeys.size > 0 ? localeFilterKeys : new Set<string>();
  for (const key of Array.from(promotedMessageKeys).sort()) {
    if (messages[key]) {
      const sourceMessage = options.excludeOverrides
        ? removeMessageOverrides(filterMessageForLocales(messages[key], messageLocaleFilter))
        : filterMessageForLocales(messages[key], messageLocaleFilter);
      await plan(
        "message",
        key,
        sourceMessage,
        (entryKey) => destinationDatasource.readMessage(entryKey),
        (destination, source, conflicts) =>
          mergeMessage(key, destination, source, options.conflicts, conflicts),
      );
    }
  }

  for (const key of promotedTestKeys.sort()) {
    const test = filterTestForLocales(tests[key] as any, requestedLocales);
    if (!Array.isArray((test as any).assertions) || (test as any).assertions.length > 0) {
      await plan("test", key, test, (entryKey) => destinationDatasource.readTest(entryKey));
    }
  }

  return plans;
}

async function writePlan(destinationDatasource: Datasource, plans: EntityPlan[]) {
  for (const plan of plans) {
    if (deepEqual(plan.destination, plan.merged)) {
      continue;
    }

    if (plan.type === "locale")
      await destinationDatasource.writeLocale(plan.key, plan.merged as Locale);
    if (plan.type === "attribute")
      await destinationDatasource.writeAttribute(plan.key, plan.merged as Attribute);
    if (plan.type === "segment")
      await destinationDatasource.writeSegment(plan.key, plan.merged as Segment);
    if (plan.type === "target")
      await destinationDatasource.writeTarget(plan.key, plan.merged as Target);
    if (plan.type === "message")
      await destinationDatasource.writeMessage(plan.key, plan.merged as Message);
    if (plan.type === "test") await destinationDatasource.writeTest(plan.key, plan.merged as Test);
  }
}

function normalizeConflictPolicy(value: unknown): ConflictPolicy {
  if (typeof value === "undefined" || value === false) {
    return "source";
  }

  if (value === "source" || value === "destination" || value === "fail") {
    return value;
  }

  throw new MessagevisorCLIError(
    `Invalid --conflicts value "${String(value)}". Use source, destination, or fail.`,
  );
}

function normalizeAuditFormat(value: unknown): PromotionAuditFormat | false {
  if (typeof value === "undefined" || value === false || value === "false") {
    return false;
  }

  if (value === true || value === "true") {
    return "json";
  }

  if (value === "json" || value === "markdown") {
    return value;
  }

  throw new MessagevisorCLIError(`Invalid --audit value "${String(value)}". Use json or markdown.`);
}

function getTimestamp() {
  const date = new Date();
  const pad = (value: number) => (value < 10 ? `0${value}` : String(value));

  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    "T",
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
  ].join("");
}

async function getPromotionAuditFilePath(
  projectConfig: ProjectConfig,
  result: PromoteProjectSetsResult,
  format: PromotionAuditFormat,
) {
  const extension = format === "markdown" ? "md" : "json";
  const baseFileName = `${getTimestamp()}-${result.from}-to-${result.to}`;
  const directoryPath = path.join(projectConfig.stateDirectoryPath, "promotions");
  let suffix = 0;

  while (true) {
    const fileName = `${baseFileName}${suffix === 0 ? "" : `-${suffix}`}.${extension}`;
    const filePath = path.join(directoryPath, fileName);

    if (!fs.existsSync(filePath)) {
      return filePath;
    }

    suffix++;
  }
}

function getAuditPayload(result: PromoteProjectSetsResult) {
  return {
    from: result.from,
    to: result.to,
    apply: result.apply,
    filters: result.filters,
    dependencies: result.dependencies,
    files: result.files,
    conflicts: result.conflicts.map((conflict) => ({
      type: conflict.type,
      key: conflict.key,
      path: conflict.path,
      source: conflict.source,
      destination: conflict.destination,
    })),
    duration: result.duration,
  };
}

function stringifyMarkdownAudit(result: PromoteProjectSetsResult) {
  const lines = [
    `# Messagevisor Promotion`,
    "",
    `- From: ${result.from}`,
    `- To: ${result.to}`,
    `- Mode: ${result.apply ? "apply" : "preview"}`,
    `- Conflicts: ${result.filters.conflicts}`,
    `- Exclude overrides: ${result.filters.excludeOverrides ? "true" : "false"}`,
    `- Duration: ${prettyDuration(result.duration)}`,
    "",
    `## Dependencies`,
    "",
    `- Locales: ${result.dependencies.locales}`,
    `- Attributes: ${result.dependencies.attributes}`,
    `- Segments: ${result.dependencies.segments}`,
    `- Targets: ${result.dependencies.targets}`,
    `- Messages: ${result.dependencies.messages}`,
    `- Tests: ${result.dependencies.tests}`,
    "",
    `## Files`,
    "",
  ];

  for (const [label, files] of [
    ["Created", result.files.created],
    ["Updated", result.files.updated],
    ["Unchanged", result.files.unchanged],
  ] as const) {
    lines.push(`### ${label}`, "");
    lines.push(...(files.length > 0 ? files.map((filePath) => `- ${filePath}`) : ["- None"]));
    lines.push("");
  }

  if (result.conflicts.length > 0) {
    lines.push(`## Conflicts`, "");
    lines.push(
      ...result.conflicts.map(
        (conflict) => `- ${conflict.type} ${conflict.key} at ${conflict.path}`,
      ),
    );
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

async function writePromotionAudit(
  projectConfig: ProjectConfig,
  result: PromoteProjectSetsResult,
  format: PromotionAuditFormat,
) {
  const filePath = await getPromotionAuditFilePath(projectConfig, result, format);
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });

  const content =
    format === "markdown"
      ? stringifyMarkdownAudit(result)
      : `${JSON.stringify(getAuditPayload(result), null, 2)}\n`;

  await fs.promises.writeFile(filePath, content);

  return formatProjectPath(projectConfig, filePath);
}

export async function promoteProjectSets(
  projectConfig: ProjectConfig,
  datasource: Datasource,
  options: PromoteProjectSetsOptions,
): Promise<PromoteProjectSetsResult> {
  const startTime = Date.now();
  const conflictPolicy = normalizeConflictPolicy(options.conflicts);
  const auditFormat = normalizeAuditFormat(options.audit);

  if (!projectConfig.sets)
    throw new MessagevisorCLIError("Promotion is only available when `sets: true` is configured.");
  if (!options.from) throw new MessagevisorCLIError("Pass --from=<set>.");
  if (!options.to) throw new MessagevisorCLIError("Pass --to=<set>.");
  if (options.from === options.to)
    throw new MessagevisorCLIError("--from and --to must be different sets.");

  const sets = await datasource.listSets();
  if (!sets.includes(options.from))
    throw new MessagevisorCLIError(
      `Unknown source set "${options.from}". Available sets: ${sets.join(", ") || "none"}.`,
    );
  if (!sets.includes(options.to))
    throw new MessagevisorCLIError(
      `Unknown destination set "${options.to}". Available sets: ${sets.join(", ") || "none"}.`,
    );

  assertAllowedPromotionFlow(projectConfig, options.from, options.to);

  const sourceDatasource = datasource.forSet(options.from);
  const destinationDatasource = datasource.forSet(options.to);

  await assertSetLintsClean(options.from, sourceDatasource);
  await assertSetLintsClean(options.to, destinationDatasource);

  const plans = await getPromotionPlan(sourceDatasource, destinationDatasource, {
    target: options.target || [],
    locale: options.locale || [],
    includeMessages: options.includeMessages || [],
    excludeMessages: options.excludeMessages || [],
    excludeOverrides: options.excludeOverrides === true,
    allowEmpty: options.allowEmpty === true,
    conflicts: conflictPolicy,
  });
  const conflicts = plans.flatMap((plan) => plan.conflicts);

  if (conflictPolicy === "fail" && conflicts.length > 0) {
    const preview = conflicts
      .slice(0, 5)
      .map((conflict) => `${conflict.type} "${conflict.key}" at ${conflict.path}`)
      .join("\n");
    const suffix = conflicts.length > 5 ? `\n...and ${conflicts.length - 5} more` : "";

    throw new MessagevisorCLIError(
      `Promotion has ${conflicts.length} conflict(s) and --conflicts=fail was used.\n${preview}${suffix}`,
    );
  }

  if (options.apply === true) {
    await writePlan(destinationDatasource, plans);
  }

  const created = plans
    .filter((plan) => !plan.destination)
    .map((plan) =>
      formatProjectPath(
        projectConfig,
        getEntityFilePath(destinationDatasource.getConfig(), plan.type, plan.key),
      ),
    );
  const updated = plans
    .filter((plan) => plan.destination && !deepEqual(plan.destination, plan.merged))
    .map((plan) =>
      formatProjectPath(
        projectConfig,
        getEntityFilePath(destinationDatasource.getConfig(), plan.type, plan.key),
      ),
    );
  const unchanged = plans
    .filter((plan) => plan.destination && deepEqual(plan.destination, plan.merged))
    .map((plan) =>
      formatProjectPath(
        projectConfig,
        getEntityFilePath(destinationDatasource.getConfig(), plan.type, plan.key),
      ),
    );

  const result: PromoteProjectSetsResult = {
    from: options.from,
    to: options.to,
    apply: options.apply === true,
    duration: Date.now() - startTime,
    filters: {
      targets: toArray(options.target),
      locales: toArray(options.locale),
      includeMessages: toArray(options.includeMessages),
      excludeMessages: toArray(options.excludeMessages),
      excludeOverrides: options.excludeOverrides === true,
      conflicts: conflictPolicy,
    },
    dependencies: {
      locales: plans.filter((plan) => plan.type === "locale").length,
      attributes: plans.filter((plan) => plan.type === "attribute").length,
      segments: plans.filter((plan) => plan.type === "segment").length,
      targets: plans.filter((plan) => plan.type === "target").length,
      messages: plans.filter((plan) => plan.type === "message").length,
      tests: plans.filter((plan) => plan.type === "test").length,
    },
    files: { created, updated, unchanged },
    conflicts,
  };

  if (result.apply && auditFormat) {
    result.auditFilePath = await writePromotionAudit(projectConfig, result, auditFormat);
  }

  return result;
}

function printPromoteResult(
  result: PromoteProjectSetsResult,
  options: { showUnchanged?: boolean } = {},
) {
  console.log("");
  console.log(CLI_FORMAT_BOLD, `Promoting Messagevisor set translations`);
  console.log(`  From: ${result.from}`);
  console.log(`  To:   ${result.to}`);
  console.log(`  Mode: ${result.apply ? "apply" : "preview"}`);
  if (result.filters.targets.length > 0)
    console.log(`  Targets: ${result.filters.targets.join(", ")}`);
  if (result.filters.locales.length > 0)
    console.log(`  Locales: ${result.filters.locales.join(", ")}`);
  if (result.filters.includeMessages.length > 0)
    console.log(`  Include messages: ${result.filters.includeMessages.join(", ")}`);
  if (result.filters.excludeMessages.length > 0)
    console.log(`  Exclude messages: ${result.filters.excludeMessages.join(", ")}`);
  console.log(`  Conflict policy: ${result.filters.conflicts}`);
  console.log(
    `  Overrides: ${result.filters.excludeOverrides ? "excluded; existing destination overrides are preserved" : "included"}`,
  );
  console.log("");
  console.log(
    `  Dependencies: ${result.dependencies.locales} locales, ${result.dependencies.attributes} attributes, ${result.dependencies.segments} segments, ${result.dependencies.targets} targets, ${result.dependencies.messages} messages, ${result.dependencies.tests} tests`,
  );
  console.log(`  Created:   ${result.files.created.length}`);
  console.log(`  Updated:   ${result.files.updated.length}`);
  console.log(`  Unchanged: ${result.files.unchanged.length}`);
  console.log(`  Conflicts: ${result.conflicts.length}`);
  console.log("");

  printFileGroup("Created", result.files.created, 32);
  printFileGroup("Updated", result.files.updated, 33);
  if (options.showUnchanged === true) {
    printFileGroup("Unchanged", result.files.unchanged, 2);
  }
  printConflictPreview(result.conflicts);

  if (result.auditFilePath) {
    console.log(`  Audit: ${colorize(result.auditFilePath, 36)}`);
    console.log("");
  }

  console.log(CLI_FORMAT_GREEN, result.apply ? "Promotion applied" : "Promotion preview complete");
  console.log(CLI_FORMAT_BOLD, `Time: ${prettyDuration(result.duration)}`);
}

function printFileGroup(label: string, files: string[], color: number) {
  if (files.length === 0) {
    return;
  }

  console.log(CLI_FORMAT_BOLD, label);
  for (const filePath of files) {
    console.log(`  ${colorize(filePath, color)}`);
  }
  console.log("");
}

function printConflictPreview(conflicts: PromotionConflict[]) {
  if (conflicts.length === 0) {
    return;
  }

  console.log(CLI_FORMAT_BOLD, "Conflicts");
  for (const conflict of conflicts.slice(0, 10)) {
    console.log(`  ${colorize(conflict.type, 33)} ${conflict.key} ${colorize(conflict.path, 2)}`);
  }
  if (conflicts.length > 10) {
    console.log(`  ${colorize(`...and ${conflicts.length - 10} more`, 2)}`);
  }
  console.log("");
}

export const promotePlugin = {
  command: "promote",
  handler: async ({ projectConfig, datasource, parsed }: any) => {
    let result;

    try {
      result = await promoteProjectSets(projectConfig, datasource, {
        from: parsed.from,
        to: parsed.to,
        target: parsed.target,
        locale: parsed.locale,
        includeMessages: parsed.includeMessages,
        excludeMessages: parsed.excludeMessages,
        excludeOverrides: parsed.excludeOverrides,
        conflicts: parsed.conflicts,
        allowEmpty: parsed.allowEmpty,
        apply: parsed.apply === true || parsed.apply === "true",
        audit: parsed.audit,
      });
    } catch (error) {
      if (printMessagevisorCLIError(error, parsed)) {
        return false;
      }

      throw error;
    }

    printPromoteResult(result, {
      showUnchanged: parsed.showUnchanged === true || parsed.showUnchanged === "true",
    });
  },
  examples: [
    {
      command: "promote --from=dev --to=staging",
      description: "preview all translations that can be promoted from one set to another",
    },
    {
      command: "promote --from=dev --to=staging --target=web",
      description: "preview translations affecting a target",
    },
    {
      command: "promote --from=dev --to=staging --excludeOverrides",
      description: "preview messages without copying overrides",
    },
    {
      command: "promote --from=dev --to=staging --conflicts=fail",
      description: "fail instead of overwriting conflicting destination fields",
    },
    {
      command: "promote --from=dev --to=staging --apply",
      description: "apply a promotion and write destination files",
    },
    {
      command: "promote --from=dev --to=staging --apply --audit=markdown",
      description: "write a promotion audit file",
    },
    {
      command: "promote --from=dev --to=staging --showUnchanged",
      description: "preview a promotion and include unchanged entries",
    },
  ],
};
