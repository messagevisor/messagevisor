import type { CatalogIndex, EntitySummary, EntityType } from "./types";

export const CATALOG_INDEX_FORMAT_VERSION = 2;

const INDEX_COLUMNS = [
  "key",
  "description",
  "targets",
  "locales",
  "overrideLocales",
  "overrideCount",
  "messageCount",
  "usedInMessageCount",
  "usedInSegmentCount",
  "archived",
  "deprecated",
  "lastModified",
] as const;

type IndexColumn = (typeof INDEX_COLUMNS)[number];

interface CatalogIndexDictionaries {
  targets: string[];
  locales: string[];
}

interface EncodedEntityCollection {
  columns: readonly string[];
  rows: unknown[][];
}

export interface EncodedCatalogIndex {
  set: string;
  formatVersion: number;
  counts: Record<EntityType, number>;
  dictionaries: CatalogIndexDictionaries;
  entities: Partial<Record<EntityType, EncodedEntityCollection>>;
}

function collectDictionaryValues(
  entities: Record<EntityType, EntitySummary[]>,
  field: "targets" | "locales",
) {
  const values = new Set<string>();

  for (const summaries of Object.values(entities)) {
    for (const summary of summaries) {
      for (const value of summary[field] || []) {
        values.add(value);
      }

      if (field === "locales") {
        for (const value of summary.overrideLocales || []) {
          values.add(value);
        }
      }
    }
  }

  return Array.from(values).sort((left, right) => left.localeCompare(right));
}

function encodeIndexedList(
  values: string[] | undefined,
  dictionary: string[],
  dictionaryIndexes: Map<string, number>,
) {
  if (typeof values === "undefined") {
    return null;
  }

  const indexes = values
    .slice()
    .sort((left, right) => left.localeCompare(right))
    .map((value) => dictionaryIndexes.get(value))
    .filter((value): value is number => typeof value === "number");

  if (dictionary.length <= 31) {
    return indexes.reduce((mask, index) => mask + 2 ** index, 0);
  }

  return indexes;
}

function encodeColumn(
  summary: EntitySummary,
  column: IndexColumn,
  dictionaries: CatalogIndexDictionaries,
  dictionaryIndexes: {
    targets: Map<string, number>;
    locales: Map<string, number>;
  },
) {
  switch (column) {
    case "targets":
      return encodeIndexedList(summary.targets, dictionaries.targets, dictionaryIndexes.targets);
    case "locales":
      return encodeIndexedList(summary.locales, dictionaries.locales, dictionaryIndexes.locales);
    case "overrideLocales":
      return encodeIndexedList(
        summary.overrideLocales,
        dictionaries.locales,
        dictionaryIndexes.locales,
      );
    default:
      return typeof summary[column] === "undefined" ? null : summary[column];
  }
}

export function encodeCatalogIndex(index: CatalogIndex): EncodedCatalogIndex {
  const dictionaries: CatalogIndexDictionaries = {
    targets: collectDictionaryValues(index.entities, "targets"),
    locales: collectDictionaryValues(index.entities, "locales"),
  };
  const dictionaryIndexes = {
    targets: new Map(dictionaries.targets.map((value, index) => [value, index])),
    locales: new Map(dictionaries.locales.map((value, index) => [value, index])),
  };
  const entities: Partial<Record<EntityType, EncodedEntityCollection>> = {};

  for (const type of Object.keys(index.entities) as EntityType[]) {
    const summaries = [...(index.entities[type] || [])].sort((left, right) =>
      left.key.localeCompare(right.key),
    );

    entities[type] = {
      columns: INDEX_COLUMNS,
      rows: summaries.map((summary) =>
        INDEX_COLUMNS.map((column) =>
          encodeColumn(summary, column, dictionaries, dictionaryIndexes),
        ),
      ),
    };
  }

  return {
    set: index.set,
    formatVersion: CATALOG_INDEX_FORMAT_VERSION,
    counts: index.counts,
    dictionaries,
    entities,
  };
}

function decodeIndexedList(encoded: unknown, dictionary: string[]): string[] | undefined {
  if (encoded === null || typeof encoded === "undefined") {
    return undefined;
  }

  if (Array.isArray(encoded)) {
    return encoded
      .filter((index): index is number => typeof index === "number")
      .map((index) => dictionary[index])
      .filter((value): value is string => typeof value === "string");
  }

  if (typeof encoded !== "number") {
    return undefined;
  }

  const values: string[] = [];

  for (let index = 0; index < dictionary.length; index += 1) {
    if (encoded >= 2 ** index && Math.floor(encoded / 2 ** index) % 2 === 1) {
      values.push(dictionary[index]);
    }
  }

  return values;
}

function decodeColumn(
  summary: EntitySummary,
  column: string,
  encoded: unknown,
  dictionaries: CatalogIndexDictionaries,
) {
  switch (column) {
    case "targets":
      {
        const values = decodeIndexedList(encoded, dictionaries.targets);
        if (values) summary.targets = values;
      }
      return;
    case "locales":
      {
        const values = decodeIndexedList(encoded, dictionaries.locales);
        if (values) summary.locales = values;
      }
      return;
    case "overrideLocales":
      {
        const values = decodeIndexedList(encoded, dictionaries.locales);
        if (values) summary.overrideLocales = values;
      }
      return;
    case "key":
      if (typeof encoded === "string") summary.key = encoded;
      return;
    case "description":
      if (typeof encoded === "string") summary.description = encoded;
      return;
    case "overrideCount":
      if (typeof encoded === "number") summary.overrideCount = encoded;
      return;
    case "messageCount":
      if (typeof encoded === "number") summary.messageCount = encoded;
      return;
    case "usedInMessageCount":
      if (typeof encoded === "number") summary.usedInMessageCount = encoded;
      return;
    case "usedInSegmentCount":
      if (typeof encoded === "number") summary.usedInSegmentCount = encoded;
      return;
    case "archived":
      if (typeof encoded === "boolean") summary.archived = encoded;
      return;
    case "deprecated":
      if (typeof encoded === "boolean") summary.deprecated = encoded;
      return;
    case "lastModified":
      if (encoded && typeof encoded === "object") {
        summary.lastModified = encoded as EntitySummary["lastModified"];
      }
  }
}

export function decodeCatalogIndex(input: unknown): CatalogIndex {
  if (!input || typeof input !== "object") {
    throw new Error("Invalid Catalog index.");
  }

  const value = input as Partial<EncodedCatalogIndex> & { formatVersion?: unknown };

  if (typeof value.formatVersion === "undefined") {
    return input as CatalogIndex;
  }

  if (value.formatVersion !== CATALOG_INDEX_FORMAT_VERSION) {
    throw new Error(
      `Catalog index was generated by an unsupported format version (${String(value.formatVersion)}). Upgrade the Catalog UI.`,
    );
  }

  const dictionaries = value.dictionaries;
  if (
    !dictionaries ||
    !Array.isArray(dictionaries.targets) ||
    !Array.isArray(dictionaries.locales)
  ) {
    throw new Error("Invalid Catalog index dictionaries.");
  }

  const entities = {} as CatalogIndex["entities"];

  for (const type of Object.keys(value.entities || {}) as EntityType[]) {
    const collection = value.entities?.[type];
    if (!collection || !Array.isArray(collection.columns) || !Array.isArray(collection.rows)) {
      throw new Error(`Invalid Catalog index entity collection: ${type}.`);
    }

    entities[type] = collection.rows.map((row) => {
      const summary = {} as EntitySummary;
      collection.columns.forEach((column, index) =>
        decodeColumn(summary, column, row[index], dictionaries),
      );

      if (!summary.key) {
        throw new Error(`Invalid Catalog index ${type} row: missing key.`);
      }

      summary.href = `entities/${type}/${encodeURIComponent(summary.key)}.json`;
      return summary;
    });
  }

  return {
    set: String(value.set || ""),
    counts: value.counts as Record<EntityType, number>,
    entities,
  };
}
