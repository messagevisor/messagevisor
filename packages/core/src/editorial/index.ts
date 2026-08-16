import type { Attribute, Locale, Message, Segment, Target, Test } from "@messagevisor/types";

import type { ProjectConfig } from "../config";
import type {
  Datasource,
  EntityDocument,
  EntityMutation,
  EntityMutationResult,
  EntityType,
} from "../datasource";
import { getAttributeZodSchema } from "../linter/attributeSchema";
import { getConditionsZodSchema } from "../linter/conditionSchema";
import { getLocaleZodSchema } from "../linter/localeSchema";
import { getMessageZodSchema } from "../linter/messageSchema";
import { getSegmentZodSchema } from "../linter/segmentSchema";
import { getTargetZodSchema } from "../linter/targetSchema";
import { getTestZodSchema } from "../linter/testSchema";
import { MessagevisorCLIError } from "../error";

export interface EditorialValidationIssue {
  type: EntityType;
  key: string;
  path: (string | number)[];
  message: string;
}

export interface EditorialMutationPreview {
  mutations: EntityMutation[];
  results: EntityMutationResult[];
  issues: EditorialValidationIssue[];
}

export interface RenameEntityOptions {
  dryRun?: boolean;
  /** Apply even if projected entities fail validation. Defaults to false. */
  allowInvalid?: boolean;
}

export interface RenameEntityResult extends EditorialMutationPreview {
  applied: boolean;
}

type EntityMaps = {
  locale: Record<string, Locale>;
  message: Record<string, Message>;
  segment: Record<string, Segment>;
  attribute: Record<string, Attribute>;
  target: Record<string, Target>;
  test: Record<string, Test>;
};

const entityTypes: EntityType[] = ["locale", "attribute", "segment", "message", "target", "test"];

async function readAllEntities(datasource: Datasource): Promise<EntityMaps> {
  const maps = {
    locale: {},
    message: {},
    segment: {},
    attribute: {},
    target: {},
    test: {},
  } as EntityMaps;

  for (const type of entityTypes) {
    for (const key of await datasource.listEntities(type)) {
      maps[type][key] = (await datasource.readEntity(type, key)) as never;
    }
  }
  return maps;
}

function applyProjectedMutations(maps: EntityMaps, mutations: EntityMutation[]) {
  for (const mutation of mutations) {
    if (mutation.operation === "delete") delete maps[mutation.type][mutation.key];
    else maps[mutation.type][mutation.key] = mutation.entity as never;
  }
}

export async function previewEntityMutations(
  projectConfig: ProjectConfig,
  datasource: Datasource,
  mutations: EntityMutation[],
): Promise<EditorialMutationPreview> {
  const results = await datasource.applyEntityMutations(mutations, { dryRun: true });
  const maps = await readAllEntities(datasource);
  applyProjectedMutations(maps, mutations);

  const localeKeys = Object.keys(maps.locale);
  const messageKeys = Object.keys(maps.message);
  const segmentKeys = Object.keys(maps.segment);
  const attributes = maps.attribute;
  const conditionsSchema = getConditionsZodSchema(attributes);
  const schemas = {
    locale: getLocaleZodSchema(localeKeys, messageKeys),
    attribute: getAttributeZodSchema(),
    segment: getSegmentZodSchema(conditionsSchema),
    message: getMessageZodSchema(localeKeys, segmentKeys, attributes, {
      namespaceCharacter: projectConfig.namespaceCharacter,
      exportOverrideKeySeparator: projectConfig.exportOverrideKeySeparator,
    }),
    target: getTargetZodSchema(localeKeys),
    test: getTestZodSchema(messageKeys, segmentKeys, localeKeys, Object.keys(maps.target)),
  };
  const issues: EditorialValidationIssue[] = [];

  for (const type of entityTypes) {
    for (const [key, entity] of Object.entries(maps[type])) {
      const result = schemas[type].safeParse(entity);
      if (result.success) continue;
      for (const issue of result.error.issues) {
        issues.push({
          type,
          key,
          path: issue.path.filter((entry): entry is string | number => typeof entry !== "symbol"),
          message: issue.message,
        });
      }
    }
  }

  return { mutations, results, issues };
}

function replaceRecordKey<T>(record: Record<string, T> | undefined, from: string, to: string) {
  if (!record || !(from in record)) return record;
  const next: Record<string, T> = {};
  for (const [key, value] of Object.entries(record)) next[key === from ? to : key] = value;
  return next;
}

function mapStructuredString(value: string, map: (parsed: unknown) => unknown) {
  if (!(value.startsWith("{") || value.startsWith("["))) return value;
  try {
    return JSON.stringify(map(JSON.parse(value)));
  } catch {
    return value;
  }
}

function renameCondition(value: unknown, from: string, to: string): unknown {
  if (Array.isArray(value)) return value.map((entry) => renameCondition(entry, from, to));
  if (typeof value === "string")
    return mapStructuredString(value, (parsed) => renameCondition(parsed, from, to));
  if (!value || typeof value !== "object") return value;
  const condition = { ...(value as Record<string, unknown>) };
  if (typeof condition.attribute === "string") {
    const [root, ...rest] = condition.attribute.split(".");
    if (root === from) condition.attribute = [to, ...rest].join(".");
  }
  for (const operator of ["and", "or", "not"]) {
    if (operator in condition) condition[operator] = renameCondition(condition[operator], from, to);
  }
  return condition;
}

function renameGroupSegment(value: unknown, from: string, to: string): unknown {
  if (Array.isArray(value)) return value.map((entry) => renameGroupSegment(entry, from, to));
  if (typeof value === "string") {
    if (value === from) return to;
    return mapStructuredString(value, (parsed) => renameGroupSegment(parsed, from, to));
  }
  if (!value || typeof value !== "object") return value;
  const group = { ...(value as Record<string, unknown>) };
  for (const operator of ["and", "or", "not"]) {
    if (operator in group) group[operator] = renameGroupSegment(group[operator], from, to);
  }
  return group;
}

function replaceExactPattern(value: string | string[] | undefined, from: string, to: string) {
  if (typeof value === "string") return value === from ? to : value;
  return value?.map((entry) => (entry === from ? to : entry));
}

function renameReferences(
  renamedType: EntityType,
  entityType: EntityType,
  entity: unknown,
  from: string,
  to: string,
): unknown {
  const next = { ...(entity as Record<string, any>) };
  delete next.key;

  if (renamedType === "locale" && entityType === "locale") {
    if (next.inheritFormatsFrom === from) next.inheritFormatsFrom = to;
    if (next.inheritTranslationsFrom === from) next.inheritTranslationsFrom = to;
    if (next.mergeExamplesFrom === from) next.mergeExamplesFrom = to;
  }
  if (entityType === "message") {
    if (renamedType === "locale") {
      next.translations = replaceRecordKey(next.translations, from, to);
      next.translationStates = replaceRecordKey(next.translationStates, from, to);
      next.examples = next.examples?.map((example: any) => ({
        ...example,
        locale: example.locale === from ? to : example.locale,
      }));
    }
    next.overrides = next.overrides?.map((override: any) => ({
      ...override,
      conditions:
        renamedType === "attribute"
          ? renameCondition(override.conditions, from, to)
          : override.conditions,
      segments:
        renamedType === "segment"
          ? renameGroupSegment(override.segments, from, to)
          : override.segments,
      translations:
        renamedType === "locale"
          ? replaceRecordKey(override.translations, from, to)
          : override.translations,
      translationStates:
        renamedType === "locale"
          ? replaceRecordKey(override.translationStates, from, to)
          : override.translationStates,
    }));
  }
  if (renamedType === "attribute" && entityType === "segment") {
    next.conditions = renameCondition(next.conditions, from, to);
  }
  if (entityType === "target") {
    if (renamedType === "locale") {
      next.locales = next.locales?.map((locale: string) => (locale === from ? to : locale));
      next.formats = replaceRecordKey(next.formats, from, to);
    }
    if (renamedType === "attribute") next.context = replaceRecordKey(next.context, from, to);
    if (renamedType === "message") {
      next.includeMessages = replaceExactPattern(next.includeMessages, from, to);
      next.excludeMessages = replaceExactPattern(next.excludeMessages, from, to);
    }
  }
  if (entityType === "locale" && renamedType === "message") {
    next.examples = next.examples?.map((example: any) => ({
      ...example,
      message: example.message === from ? to : example.message,
    }));
  }
  if (entityType === "test") {
    const rewrite = (value: unknown, parentKey?: string): unknown => {
      if (Array.isArray(value)) return value.map((entry) => rewrite(entry, parentKey));
      if (!value || typeof value !== "object") return value;
      const result: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        const nextKey =
          renamedType === "attribute" && parentKey === "context" && key === from ? to : key;
        result[nextKey] = key === renamedType && child === from ? to : rewrite(child, key);
      }
      return result;
    };
    return rewrite(next);
  }
  return next;
}

function hasChanged(before: unknown, after: unknown) {
  return JSON.stringify(before) !== JSON.stringify(after);
}

export async function renameEntity(
  projectConfig: ProjectConfig,
  datasource: Datasource,
  type: EntityType,
  from: string,
  to: string,
  options: RenameEntityOptions = {},
): Promise<RenameEntityResult> {
  if (from === to)
    throw new MessagevisorCLIError("Source and destination entity keys must be different.", {
      code: "conflicting_options",
      details: { from, to },
    });
  if (await datasource.entityExists(type, to)) {
    throw new MessagevisorCLIError(`${type} "${to}" already exists.`, {
      code: "entity_already_exists",
      details: { type, key: to },
    });
  }

  const source = await datasource.readEntityDocument(type, from);
  const documents: EntityDocument<unknown>[] = [];
  for (const candidateType of entityTypes) {
    for (const key of await datasource.listEntities(candidateType)) {
      if (candidateType === type && key === from) continue;
      documents.push(await datasource.readEntityDocument(candidateType, key));
    }
  }

  const mutations: EntityMutation[] = [
    { operation: "delete", type, key: from, expectedVersion: source.version },
    {
      operation: "write",
      type,
      key: to,
      expectedVersion: null,
      entity: renameReferences(type, type, source.entity, from, to),
    },
  ];
  for (const document of documents) {
    const renamed = renameReferences(type, document.type, document.entity, from, to);
    if (!hasChanged(document.entity, renamed)) continue;
    mutations.push({
      operation: "write",
      type: document.type,
      key: document.key,
      entity: renamed,
      expectedVersion: document.version,
    });
  }

  const preview = await previewEntityMutations(projectConfig, datasource, mutations);
  if (!options.dryRun && (options.allowInvalid || preview.issues.length === 0)) {
    const results = await datasource.applyEntityMutations(mutations);
    return { ...preview, results, applied: true };
  }
  return { ...preview, applied: false };
}
