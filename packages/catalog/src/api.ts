import type {
  CatalogManifest,
  EntityDetail,
  EntityType,
  HistoryPage,
  LocaleDuplicates,
} from "./types";
import { decodeCatalogIndex } from "./indexFormat";
import {
  createCatalogIndexFromLayer,
  decodeLayeredCatalogIndexLayer,
  decodeLayeredCatalogIndexMeta,
  isLayeredCatalogIndex,
  type CatalogIndexLayer,
  type DecodedCatalogIndexLayer,
  type EncodedCatalogIndexMeta,
} from "./layeredIndex";
import { createBlockCache, findBlockHash } from "./blockReader";
import { getVirtualBucket } from "./utils/hashEntityKey";
import { encodeRouteSegment, getDataBasePath } from "./entityTypes";

let routerMode: CatalogManifest["router"] = "browser";
let catalogManifestCache: CatalogManifest | undefined;
let catalogManifestPromise: Promise<CatalogManifest> | undefined;

const _catalogRangeCache = new Map<string, Promise<CatalogRangeTable>>();
const _catalogBlockCache = createBlockCache<Promise<Record<string, EntityDetail>>>(16);
const _catalogIndexMetaCache = new Map<string, Promise<EncodedCatalogIndexMeta | undefined>>();
const _catalogIndexLayerCache = new Map<string, Promise<DecodedCatalogIndexLayer | undefined>>();
const _catalogIndexInputCache = new Map<string, unknown>();

function singleFlight<T>(store: Map<string, Promise<T>>, cacheKey: string, load: () => Promise<T>) {
  const existing = store.get(cacheKey);
  if (existing) return existing;

  const promise = Promise.resolve()
    .then(load)
    .catch((error) => {
      store.delete(cacheKey);
      throw error;
    });

  store.set(cacheKey, promise);
  return promise;
}

interface CatalogRangeTable {
  layoutVersion: number;
  vbucketBits: number;
  blockSize: number;
  blocks: Array<[number, string]>;
}

export class CatalogResourceNotFoundError extends Error {
  constructor(
    public readonly url: string,
    public readonly status: number,
  ) {
    super(`Unable to load ${url}`);
    this.name = "CatalogResourceNotFoundError";
  }
}

export class CatalogBlockKeyMissingError extends Error {
  constructor(
    public readonly type: EntityType,
    public readonly key: string,
  ) {
    super(`Catalog block does not contain ${type} "${key}".`);
    this.name = "CatalogBlockKeyMissingError";
  }
}

function getDataUrl(path: string) {
  const normalizedPath = path.replace(/^\//, "");

  return routerMode === "browser" ? `/${normalizedPath}` : normalizedPath;
}

export function setCatalogRouterMode(mode: CatalogManifest["router"]) {
  routerMode = mode || "browser";
}

export async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new CatalogResourceNotFoundError(url, response.status);
  }

  return response.json() as Promise<T>;
}

export function fetchManifest() {
  if (catalogManifestPromise) return catalogManifestPromise;

  catalogManifestPromise = Promise.resolve()
    .then(() => fetchJson<CatalogManifest>(getDataUrl("data/manifest.json")))
    .catch(() => fetchJson<CatalogManifest>("/data/manifest.json"))
    .then((manifest) => {
      catalogManifestCache = manifest;
      _catalogRangeCache.clear();
      _catalogBlockCache.clear();
      _catalogIndexMetaCache.clear();
      _catalogIndexLayerCache.clear();
      _catalogIndexInputCache.clear();
      return manifest;
    })
    .catch((error) => {
      catalogManifestPromise = undefined;
      throw error;
    });

  return catalogManifestPromise;
}

export function __resetCatalogApiCaches() {
  catalogManifestCache = undefined;
  catalogManifestPromise = undefined;
  _catalogRangeCache.clear();
  _catalogBlockCache.clear();
  _catalogIndexMetaCache.clear();
  _catalogIndexLayerCache.clear();
  _catalogIndexInputCache.clear();
  _translationShardCache.clear();
}

async function fetchIndexMeta(setKey?: string) {
  const cacheKey = setKey || "__root__";
  return singleFlight(_catalogIndexMetaCache, cacheKey, async () => {
    const input = await fetchJson<unknown>(getDataUrl(`${getDataBasePath(setKey)}/index.json`));
    _catalogIndexInputCache.set(cacheKey, input);
    return isLayeredCatalogIndex(input) ? decodeLayeredCatalogIndexMeta(input) : undefined;
  });
}

async function loadIndexLayer(setKey: string | undefined, layer: CatalogIndexLayer) {
  const cacheKey = `${setKey || "__root__"}:${layer}`;
  return singleFlight(_catalogIndexLayerCache, cacheKey, async () => {
    const meta = await fetchIndexMeta(setKey);
    if (!meta) {
      return undefined;
    }

    const input = await fetchJson<unknown>(
      getDataUrl(`${getDataBasePath(setKey)}/${meta.layers[layer]}`),
    );
    return decodeLayeredCatalogIndexLayer(input, meta);
  });
}

export async function fetchIndex(setKey?: string) {
  const meta = await fetchIndexMeta(setKey);
  if (!meta) {
    const input = _catalogIndexInputCache.get(setKey || "__root__");
    return decodeCatalogIndex(input);
  }

  const core = await loadIndexLayer(setKey, "core");
  return createCatalogIndexFromLayer(meta, core || {});
}

export async function fetchIndexLayer(
  layer: CatalogIndexLayer,
  setKey?: string,
): Promise<DecodedCatalogIndexLayer | undefined> {
  return loadIndexLayer(setKey, layer);
}

function fetchEntityDetailFile(type: EntityType, key: string, setKey?: string) {
  return fetchJson<EntityDetail>(
    getDataUrl(`${getDataBasePath(setKey)}/entities/${type}/${encodeRouteSegment(key)}.json`),
  );
}

function getCatalogLayout() {
  const layout = catalogManifestCache?.layout;

  if (!layout) {
    return undefined;
  }

  if (layout.version !== 1) {
    throw new Error(
      `Catalog data was generated by a newer Messagevisor version (layout v${layout.version}). Upgrade the Catalog UI.`,
    );
  }

  if (!Array.isArray(layout.blockedTypes)) {
    throw new Error("Catalog data has an invalid blocked entity type list.");
  }

  if (layout.vbucketBits !== 16) {
    throw new Error(
      `Catalog data uses an unsupported virtual bucket layout (${layout.vbucketBits} bits). Upgrade the Catalog UI.`,
    );
  }

  return layout;
}

async function fetchCatalogRanges(type: EntityType, setKey?: string) {
  const cacheKey = `${setKey || "__root__"}:${type}`;
  return singleFlight(_catalogRangeCache, cacheKey, () =>
    fetchJson<CatalogRangeTable>(
      getDataUrl(`${getDataBasePath(setKey)}/blocks/${type}/ranges.json`),
    ),
  );
}

async function fetchCatalogBlock(type: EntityType, hash: string, setKey?: string) {
  const cacheKey = `${setKey || "__root__"}:${type}:${hash}`;
  const cached = _catalogBlockCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const promise = fetchJson<Record<string, EntityDetail>>(
    getDataUrl(`${getDataBasePath(setKey)}/blocks/${type}/${hash}.json`),
  ).catch((error) => {
    _catalogBlockCache.delete(cacheKey);
    throw error;
  });
  _catalogBlockCache.set(cacheKey, promise);
  return promise;
}

export async function fetchEntityDetail(type: EntityType, key: string, setKey?: string) {
  const layout = getCatalogLayout();

  if (!layout?.blockedTypes.includes(type)) {
    return fetchEntityDetailFile(type, key, setKey);
  }

  try {
    const ranges = await fetchCatalogRanges(type, setKey);
    if (ranges.layoutVersion !== layout.version || ranges.vbucketBits !== layout.vbucketBits) {
      throw new Error("Catalog block ranges do not match the Catalog manifest layout.");
    }
    const hash = findBlockHash(ranges, getVirtualBucket(key));
    const block = await fetchCatalogBlock(type, hash, setKey);
    const detail = block[key];

    if (!detail) {
      throw new CatalogBlockKeyMissingError(type, key);
    }

    return detail;
  } catch (error) {
    // Preserve compatibility with mixed exports where a blocked type has no
    // range table yet, while allowing ordinary entity errors to surface.
    if (
      error instanceof CatalogResourceNotFoundError &&
      error.url.endsWith(`/blocks/${type}/ranges.json`)
    ) {
      return fetchEntityDetailFile(type, key, setKey);
    }

    throw error;
  }
}

export function fetchHistoryPage(path: string, page: number) {
  const url = getDataUrl(`${path}/page-${page}.json`);
  const emptyHistoryPage: HistoryPage = {
    page: 1,
    pageSize: 50,
    totalPages: 1,
    entries: [],
  };

  return fetch(url).then((response) => {
    if (response.ok) {
      const contentType = response.headers.get("content-type") || "";

      if (contentType.includes("text/html")) {
        if (page === 1) {
          return emptyHistoryPage;
        }

        throw new Error(`Unable to load ${url}`);
      }

      return response.json() as Promise<HistoryPage>;
    }

    if (response.status === 404 && page === 1) {
      return emptyHistoryPage;
    }

    throw new Error(`Unable to load ${url}`);
  });
}

export function fetchLocaleDuplicates(localeKey: string, setKey?: string) {
  return fetchJson<LocaleDuplicates>(
    getDataUrl(
      `${getDataBasePath(setKey)}/duplicates/locales/${encodeRouteSegment(localeKey)}.json`,
    ),
  );
}

export type TranslationShard = Record<string, string[]>;

const _translationShardCache = new Map<string, Promise<TranslationShard>>();

function prefixToFilename(prefix: string): string {
  return Array.from(new TextEncoder().encode(prefix))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function fetchTranslationShard(prefix: string, setKey?: string): Promise<TranslationShard> {
  const cacheKey = `${setKey ?? "__root__"}:${prefix}`;
  return singleFlight(_translationShardCache, cacheKey, () =>
    fetchJson<TranslationShard>(
      getDataUrl(`${getDataBasePath(setKey)}/translations/${prefixToFilename(prefix)}.json`),
    ),
  ).catch(() => ({}));
}
