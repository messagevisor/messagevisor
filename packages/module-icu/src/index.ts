/* eslint-disable @typescript-eslint/no-unused-vars */
// exports
import IntlMessageFormat from "intl-messageformat";

import type { MessagevisorFormatPayload, MessagevisorModule } from "@messagevisor/sdk";

export interface ICUModuleOptions {
  name?: string;
  ignoreTags?: boolean;
}

interface ICUModuleCache {
  messageFormat: Record<string, IntlMessageFormat>;
  order: string[];
  number: Map<string, Intl.NumberFormat>;
  dateTime: Map<string, Intl.DateTimeFormat>;
  plural: Map<string, Intl.PluralRules>;
}

const MESSAGE_FORMAT_CACHE_LIMIT = 100;

function createEmptyRecord<T>() {
  return Object.create(null) as Record<string, T>;
}

function createICUModuleCache(): ICUModuleCache {
  return {
    messageFormat: createEmptyRecord<IntlMessageFormat>(),
    order: [],
    number: new Map(),
    dateTime: new Map(),
    plural: new Map(),
  };
}

function cached<T>(cache: Map<string, T>, locale: unknown, options: unknown, create: () => T): T {
  const key = canonicalJson([locale, options]);
  const existing = cache.get(key);
  if (existing) return existing;
  const value = create();
  if (cache.size >= MESSAGE_FORMAT_CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  cache.set(key, value);
  return value;
}

function canonicalJson(value: any): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function getCacheKey(payload: MessagevisorFormatPayload, ignoreTags: boolean) {
  return (
    JSON.stringify([payload.locale, payload.translation, payload.timeZone, ignoreTags]) +
    canonicalJson([payload.formats.number, payload.formats.date, payload.formats.time])
  );
}

function getCachedIntlMessageFormat<T>(
  cache: ICUModuleCache,
  payload: MessagevisorFormatPayload,
  ignoreTags: boolean,
) {
  const cacheKey = getCacheKey(payload, ignoreTags);

  if (!cache.messageFormat[cacheKey]) {
    const formatter = new IntlMessageFormat(
      String(payload.translation),
      payload.locale,
      undefined,
      {
        ignoreTag: ignoreTags,
        formatters: {
          getNumberFormat: (locale, options) =>
            cached(
              cache.number,
              locale,
              options,
              () => new Intl.NumberFormat(locale, options as Intl.NumberFormatOptions),
            ),
          getPluralRules: (locale, options) =>
            cached(cache.plural, locale, options, () => new Intl.PluralRules(locale, options)),
          getDateTimeFormat: (locale, options) => {
            const resolved = { timeZone: payload.timeZone, ...options };
            return cached(
              cache.dateTime,
              locale,
              resolved,
              () => new Intl.DateTimeFormat(locale, resolved),
            );
          },
        },
      },
    );
    prepareAst(formatter.getAst(), payload);
    if (cache.order.length >= MESSAGE_FORMAT_CACHE_LIMIT) {
      delete cache.messageFormat[cache.order.shift() as string];
    }
    cache.order.push(cacheKey);
    cache.messageFormat[cacheKey] = formatter;
  }

  return cache.messageFormat[cacheKey];
}

function own<T>(record: Record<string, T> | undefined, key: string): T | undefined {
  return record && Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
}

function prepareAst(
  elements: ReturnType<IntlMessageFormat["getAst"]>,
  payload: MessagevisorFormatPayload,
) {
  for (const element of elements) {
    if (element.type === 2 || element.type === 3 || element.type === 4) {
      const family = element.type === 2 ? "number" : element.type === 3 ? "date" : "time";
      const name =
        typeof element.style === "string"
          ? element.style
          : element.type === 4 && !element.style
            ? "medium"
            : undefined;
      if (name !== undefined) {
        const preset = own(payload.formats[family] as Record<string, any>, name);
        const builtin = own(IntlMessageFormat.formats[family], name);
        const parsedOptions = { ...builtin, ...preset };
        // Resolved options bypass the dependency's prototype-sensitive named lookup.
        element.style =
          element.type === 2
            ? { type: 0, tokens: [], parsedOptions }
            : { type: 1, pattern: "", parsedOptions };
      }
    } else if (element.type === 5 || element.type === 6) {
      element.options = Object.assign(Object.create(null), element.options);
      for (const option of Object.values(element.options)) prepareAst(option.value, payload);
    } else if (element.type === 8) {
      prepareAst(element.children, payload);
    }
  }
}

export function createICUModule(options: ICUModuleOptions = {}): MessagevisorModule {
  const cache = createICUModuleCache();
  const name = options.name || "icu";

  return {
    name,
    format(payload: MessagevisorFormatPayload) {
      const moduleOptions = (
        payload.moduleOptions && Object.prototype.hasOwnProperty.call(payload.moduleOptions, name)
          ? payload.moduleOptions[name]
          : undefined
      ) as { ignoreTags?: boolean } | undefined;
      const ignoreTags = moduleOptions?.ignoreTags ?? options.ignoreTags ?? true;

      return getCachedIntlMessageFormat(cache, payload, ignoreTags).format(
        Object.assign(Object.create(null), payload.values),
      );
    },
  };
}
