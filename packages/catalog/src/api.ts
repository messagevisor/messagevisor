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

const _catalogRangeCache = new Map<string, CatalogRangeTable>();
const _catalogBlockCache = createBlockCache<Record<string, EntityDetail>>(16);
const _catalogIndexMetaCache = new Map<string, EncodedCatalogIndexMeta | null>();
const _catalogIndexLayerCache = new Map<string, DecodedCatalogIndexLayer>();
const _catalogIndexInputCache = new Map<string, unknown>();

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
  return fetchJson<CatalogManifest>(getDataUrl("data/manifest.json"))
    .catch(() => fetchJson<CatalogManifest>("/data/manifest.json"))
    .then((manifest) => {
      catalogManifestCache = manifest;
      _catalogRangeCache.clear();
      _catalogBlockCache.clear();
      _catalogIndexMetaCache.clear();
      _catalogIndexLayerCache.clear();
      _catalogIndexInputCache.clear();
      return manifest;
    });
}

export function __resetCatalogApiCaches() {
  catalogManifestCache = undefined;
  _catalogRangeCache.clear();
  _catalogBlockCache.clear();
  _catalogIndexMetaCache.clear();
  _catalogIndexLayerCache.clear();
  _catalogIndexInputCache.clear();
  _translationShardCache.clear();
}

async function fetchIndexMeta(setKey?: string) {
  const cacheKey = setKey || "__root__";
  if (_catalogIndexMetaCache.has(cacheKey)) {
    return _catalogIndexMetaCache.get(cacheKey) || undefined;
  }

  const input = _catalogIndexInputCache.has(cacheKey)
    ? _catalogIndexInputCache.get(cacheKey)
    : await fetchJson<unknown>(getDataUrl(`${getDataBasePath(setKey)}/index.json`));
  _catalogIndexInputCache.set(cacheKey, input);
  const meta = isLayeredCatalogIndex(input) ? decodeLayeredCatalogIndexMeta(input) : undefined;
  _catalogIndexMetaCache.set(cacheKey, meta || null);
  return meta;
}

async function loadIndexLayer(setKey: string | undefined, layer: CatalogIndexLayer) {
  const meta = await fetchIndexMeta(setKey);
  if (!meta) {
    return undefined;
  }

  const cacheKey = `${setKey || "__root__"}:${layer}`;
  const cached = _catalogIndexLayerCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const input = await fetchJson<unknown>(
    getDataUrl(`${getDataBasePath(setKey)}/${meta.layers[layer]}`),
  );
  const decoded = decodeLayeredCatalogIndexLayer(input, meta);
  _catalogIndexLayerCache.set(cacheKey, decoded);
  return decoded;
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

function fetchLegacyEntityDetail(type: EntityType, key: string, setKey?: string) {
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

  if (layout.mode !== "files" && layout.mode !== "blocks") {
    throw new Error(`Catalog data uses an unsupported layout mode (${String(layout.mode)}).`);
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
  const cached = _catalogRangeCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const ranges = await fetchJson<CatalogRangeTable>(
    getDataUrl(`${getDataBasePath(setKey)}/blocks/${type}/ranges.json`),
  );
  _catalogRangeCache.set(cacheKey, ranges);
  return ranges;
}

async function fetchCatalogBlock(type: EntityType, hash: string, setKey?: string) {
  const cacheKey = `${setKey || "__root__"}:${type}:${hash}`;
  const cached = _catalogBlockCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const block = await fetchJson<Record<string, EntityDetail>>(
    getDataUrl(`${getDataBasePath(setKey)}/blocks/${type}/${hash}.json`),
  );
  _catalogBlockCache.set(cacheKey, block);
  return block;
}

export async function fetchEntityDetail(type: EntityType, key: string, setKey?: string) {
  const layout = getCatalogLayout();

  if (layout?.mode !== "blocks" || !layout.blockedTypes.includes(type)) {
    return fetchLegacyEntityDetail(type, key, setKey);
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
    // A blocks manifest may cover a set that is below the block threshold and
    // therefore still has legacy entity files. Preserve that mixed-layout
    // compatibility while allowing ordinary entity errors to surface.
    if (
      error instanceof CatalogResourceNotFoundError &&
      error.url.endsWith(`/blocks/${type}/ranges.json`)
    ) {
      return fetchLegacyEntityDetail(type, key, setKey);
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

const _translationShardCache = new Map<string, TranslationShard>();

function prefixToFilename(prefix: string): string {
  return Array.from(new TextEncoder().encode(prefix))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function fetchTranslationShard(prefix: string, setKey?: string): Promise<TranslationShard> {
  const cacheKey = `${setKey ?? "__root__"}:${prefix}`;
  const cached = _translationShardCache.get(cacheKey);
  if (cached) return Promise.resolve(cached);
  return fetchJson<TranslationShard>(
    getDataUrl(`${getDataBasePath(setKey)}/translations/${prefixToFilename(prefix)}.json`),
  )
    .then((data) => {
      _translationShardCache.set(cacheKey, data);
      return data;
    })
    .catch(() => {
      const empty: TranslationShard = {};
      _translationShardCache.set(cacheKey, empty);
      return empty;
    });
}
