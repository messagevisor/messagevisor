import type { CatalogIndex, EntitySummary, EntityType } from "./types";

export const LAYERED_CATALOG_INDEX_FORMAT_VERSION = 3;

export type CatalogIndexLayer = "core" | "descriptions" | "display";

const ENTITY_TYPES: EntityType[] = ["locale", "message", "attribute", "segment", "target"];

const CORE_COLUMNS: Record<EntityType, readonly string[]> = {
  locale: ["key", "targets", "locales", "archived", "deprecated"],
  message: ["key", "targets", "locales", "overrideLocales", "archived", "deprecated"],
  attribute: ["key", "targets", "archived", "deprecated"],
  segment: ["key", "targets", "archived", "deprecated"],
  target: ["key", "archived", "deprecated"],
};

const DESCRIPTION_COLUMNS = ["description"] as const;
const DISPLAY_COLUMNS = [
  "overrideCount",
  "messageCount",
  "usedInMessageCount",
  "usedInSegmentCount",
  "lastModified",
] as const;

interface CatalogIndexDictionaries {
  targets: string[];
  locales: string[];
  commits: string[];
  authors: string[];
}

interface EncodedEntityCollection {
  columns: readonly string[];
  rows: unknown[][];
}

export interface EncodedCatalogIndexLayer {
  formatVersion: number;
  entities: Partial<Record<EntityType, EncodedEntityCollection>>;
}

export interface EncodedCatalogIndexMeta {
  set: string;
  formatVersion: number;
  counts: Record<EntityType, number>;
  dictionaries: CatalogIndexDictionaries;
  layers: Record<CatalogIndexLayer, string>;
  types: Record<EntityType, { count: number }>;
}

export interface EncodedLayeredCatalogIndex {
  meta: EncodedCatalogIndexMeta;
  core: EncodedCatalogIndexLayer;
  descriptions: EncodedCatalogIndexLayer;
  display: EncodedCatalogIndexLayer;
}

export type DecodedCatalogIndexLayer = Partial<Record<EntityType, Array<Partial<EntitySummary>>>>;

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

function collectLastModifiedValues(entities: Record<EntityType, EntitySummary[]>) {
  const commits = new Set<string>();
  const authors = new Set<string>();

  for (const summaries of Object.values(entities)) {
    for (const summary of summaries) {
      if (summary.lastModified) {
        commits.add(summary.lastModified.commit);
        authors.add(summary.lastModified.author);
      }
    }
  }

  return {
    commits: Array.from(commits).sort((left, right) => left.localeCompare(right)),
    authors: Array.from(authors).sort((left, right) => left.localeCompare(right)),
  };
}

function encodeIndexedList(
  values: string[] | undefined,
  dictionary: string[],
  dictionaryIndexes: Map<string, number>,
) {
  if (typeof values === "undefined") {
    return null;
  }

  const indexes = Array.from(new Set(values))
    .sort((left, right) => left.localeCompare(right))
    .map((value) => dictionaryIndexes.get(value))
    .filter((value): value is number => typeof value === "number");

  if (dictionary.length <= 31) {
    return indexes.reduce((mask, index) => mask | (2 ** index), 0);
  }

  return indexes;
}

function encodeLastModified(
  value: EntitySummary["lastModified"],
  dictionaryIndexes: { commits: Map<string, number>; authors: Map<string, number> },
) {
  if (!value) {
    return null;
  }

  return [
    dictionaryIndexes.commits.get(value.commit),
    dictionaryIndexes.authors.get(value.author),
    value.timestamp,
  ];
}

function encodeColumn(
  summary: EntitySummary,
  column: string,
  dictionaries: CatalogIndexDictionaries,
  dictionaryIndexes: {
    targets: Map<string, number>;
    locales: Map<string, number>;
    commits: Map<string, number>;
    authors: Map<string, number>;
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
    case "lastModified":
      return encodeLastModified(summary.lastModified, {
        commits: dictionaryIndexes.commits,
        authors: dictionaryIndexes.authors,
      });
    default:
      return typeof summary[column as keyof EntitySummary] === "undefined"
        ? null
        : summary[column as keyof EntitySummary];
  }
}

function sortedSummaries(index: CatalogIndex, type: EntityType) {
  return [...(index.entities[type] || [])].sort((left, right) => left.key.localeCompare(right.key));
}

function encodeLayer(
  index: CatalogIndex,
  layer: CatalogIndexLayer,
  dictionaries: CatalogIndexDictionaries,
  dictionaryIndexes: {
    targets: Map<string, number>;
    locales: Map<string, number>;
    commits: Map<string, number>;
    authors: Map<string, number>;
  },
): EncodedCatalogIndexLayer {
  const entities: Partial<Record<EntityType, EncodedEntityCollection>> = {};

  for (const type of ENTITY_TYPES) {
    const columns =
      layer === "core"
        ? CORE_COLUMNS[type]
        : layer === "descriptions"
          ? DESCRIPTION_COLUMNS
          : DISPLAY_COLUMNS;
    const summaries = sortedSummaries(index, type);

    entities[type] = {
      columns,
      rows: summaries.map((summary) =>
        columns.map((column) => encodeColumn(summary, column, dictionaries, dictionaryIndexes)),
      ),
    };
  }

  return {
    formatVersion: LAYERED_CATALOG_INDEX_FORMAT_VERSION,
    entities,
  };
}

export function encodeLayeredCatalogIndex(index: CatalogIndex): EncodedLayeredCatalogIndex {
  const lastModified = collectLastModifiedValues(index.entities);
  const dictionaries: CatalogIndexDictionaries = {
    targets: collectDictionaryValues(index.entities, "targets"),
    locales: collectDictionaryValues(index.entities, "locales"),
    commits: lastModified.commits,
    authors: lastModified.authors,
  };
  const dictionaryIndexes = {
    targets: new Map(dictionaries.targets.map((value, index) => [value, index])),
    locales: new Map(dictionaries.locales.map((value, index) => [value, index])),
    commits: new Map(dictionaries.commits.map((value, index) => [value, index])),
    authors: new Map(dictionaries.authors.map((value, index) => [value, index])),
  };

  return {
    meta: {
      set: index.set,
      formatVersion: LAYERED_CATALOG_INDEX_FORMAT_VERSION,
      counts: index.counts,
      dictionaries,
      layers: {
        core: "index/core.json",
        descriptions: "index/descriptions.json",
        display: "index/display.json",
      },
      types: Object.fromEntries(
        ENTITY_TYPES.map((type) => [type, { count: index.entities[type]?.length || 0 }]),
      ) as Record<EntityType, { count: number }>,
    },
    core: encodeLayer(index, "core", dictionaries, dictionaryIndexes),
    descriptions: encodeLayer(index, "descriptions", dictionaries, dictionaryIndexes),
    display: encodeLayer(index, "display", dictionaries, dictionaryIndexes),
  };
}

export function isLayeredCatalogIndex(value: unknown): value is EncodedCatalogIndexMeta {
  return Boolean(
    value &&
    typeof value === "object" &&
    (value as { formatVersion?: unknown }).formatVersion === LAYERED_CATALOG_INDEX_FORMAT_VERSION,
  );
}

export function decodeLayeredCatalogIndexMeta(input: unknown): EncodedCatalogIndexMeta {
  if (!isLayeredCatalogIndex(input)) {
    throw new Error("Invalid layered Catalog index metadata.");
  }

  const value = input as Partial<EncodedCatalogIndexMeta>;

  if (
    !value.dictionaries ||
    !Array.isArray(value.dictionaries.targets) ||
    !Array.isArray(value.dictionaries.locales) ||
    !Array.isArray(value.dictionaries.commits) ||
    !Array.isArray(value.dictionaries.authors) ||
    !value.layers ||
    typeof value.layers.core !== "string" ||
    typeof value.layers.descriptions !== "string" ||
    typeof value.layers.display !== "string"
  ) {
    throw new Error("Invalid layered Catalog index metadata.");
  }

  return value as EncodedCatalogIndexMeta;
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

function decodeLastModified(
  encoded: unknown,
  dictionaries: CatalogIndexDictionaries,
): EntitySummary["lastModified"] | undefined {
  if (!Array.isArray(encoded) || encoded.length !== 3) {
    return undefined;
  }

  const [commitIndex, authorIndex, timestamp] = encoded;
  if (
    typeof commitIndex !== "number" ||
    typeof authorIndex !== "number" ||
    typeof timestamp !== "string"
  ) {
    return undefined;
  }

  const commit = dictionaries.commits[commitIndex];
  const author = dictionaries.authors[authorIndex];
  if (typeof commit !== "string" || typeof author !== "string") {
    return undefined;
  }

  return { commit, author, timestamp };
}

function decodeColumn(
  summary: Partial<EntitySummary>,
  column: string,
  encoded: unknown,
  dictionaries: CatalogIndexDictionaries,
) {
  switch (column) {
    case "targets":
      summary.targets = decodeIndexedList(encoded, dictionaries.targets);
      return;
    case "locales":
      summary.locales = decodeIndexedList(encoded, dictionaries.locales);
      return;
    case "overrideLocales":
      summary.overrideLocales = decodeIndexedList(encoded, dictionaries.locales);
      return;
    case "lastModified":
      summary.lastModified = decodeLastModified(encoded, dictionaries);
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
  }
}

export function decodeLayeredCatalogIndexLayer(
  input: unknown,
  meta: EncodedCatalogIndexMeta,
): DecodedCatalogIndexLayer {
  if (!input || typeof input !== "object") {
    throw new Error("Invalid layered Catalog index layer.");
  }

  const value = input as Partial<EncodedCatalogIndexLayer>;
  if (value.formatVersion !== LAYERED_CATALOG_INDEX_FORMAT_VERSION) {
    throw new Error("Invalid layered Catalog index layer format version.");
  }

  const entities: DecodedCatalogIndexLayer = {};
  for (const type of ENTITY_TYPES) {
    const collection = value.entities?.[type];
    if (!collection) {
      entities[type] = [];
      continue;
    }

    if (!Array.isArray(collection.columns) || !Array.isArray(collection.rows)) {
      throw new Error(`Invalid layered Catalog index entity collection: ${type}.`);
    }

    entities[type] = collection.rows.map((row) => {
      const summary: Partial<EntitySummary> = {};
      collection.columns.forEach((column, index) =>
        decodeColumn(summary, column, row[index], meta.dictionaries),
      );

      if (typeof summary.key === "string") {
        summary.href = `entities/${type}/${encodeURIComponent(summary.key)}.json`;
      }

      return summary;
    });
  }

  return entities;
}

export function createCatalogIndexFromLayer(
  meta: EncodedCatalogIndexMeta,
  layer: DecodedCatalogIndexLayer,
): CatalogIndex {
  const entities = {} as CatalogIndex["entities"];

  for (const type of ENTITY_TYPES) {
    entities[type] = (layer[type] || []).map((summary) => {
      if (typeof summary.key !== "string") {
        throw new Error(`Layered Catalog core row for ${type} is missing a key.`);
      }

      return {
        ...summary,
        key: summary.key,
        href: summary.href || `entities/${type}/${encodeURIComponent(summary.key)}.json`,
      } as EntitySummary;
    });
  }

  return {
    set: meta.set,
    counts: meta.counts,
    entities,
  };
}

export function mergeCatalogIndexLayer(
  index: CatalogIndex,
  layer: DecodedCatalogIndexLayer,
): CatalogIndex {
  const entities = {} as CatalogIndex["entities"];

  for (const type of ENTITY_TYPES) {
    const overlays = layer[type] || [];
    entities[type] = (index.entities[type] || []).map((summary, rowIndex) => ({
      ...summary,
      ...(overlays[rowIndex] || {}),
    }));
  }

  return { ...index, entities };
}
