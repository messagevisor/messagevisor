import type {
  CatalogIndex,
  CatalogManifest,
  EntityDetail,
  EntityType,
  HistoryPage,
  LocaleDuplicates,
} from "./types";
import { encodeRouteSegment, getDataBasePath } from "./entityTypes";

let routerMode: CatalogManifest["router"] = "browser";

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
    throw new Error(`Unable to load ${url}`);
  }

  return response.json() as Promise<T>;
}

export function fetchManifest() {
  return fetchJson<CatalogManifest>(getDataUrl("data/manifest.json")).catch(() =>
    fetchJson<CatalogManifest>("/data/manifest.json"),
  );
}

export function fetchIndex(setKey?: string) {
  return fetchJson<CatalogIndex>(getDataUrl(`${getDataBasePath(setKey)}/index.json`));
}

export function fetchEntityDetail(type: EntityType, key: string, setKey?: string) {
  return fetchJson<EntityDetail>(
    getDataUrl(`${getDataBasePath(setKey)}/entities/${type}/${encodeRouteSegment(key)}.json`),
  );
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
