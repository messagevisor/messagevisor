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
}

const MESSAGE_FORMAT_CACHE_LIMIT = 100;

function createEmptyRecord<T>() {
  return {} as Record<string, T>;
}

function createICUModuleCache(): ICUModuleCache {
  return {
    messageFormat: createEmptyRecord<IntlMessageFormat>(),
    order: [],
  };
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
  return canonicalJson({
    locale: payload.locale,
    translation: payload.translation,
    formats: payload.formats,
    ignoreTags,
  });
}

function getCachedIntlMessageFormat<T>(
  cache: ICUModuleCache,
  payload: MessagevisorFormatPayload,
  ignoreTags: boolean,
) {
  const cacheKey = getCacheKey(payload, ignoreTags);

  if (!cache.messageFormat[cacheKey]) {
    if (cache.order.length >= MESSAGE_FORMAT_CACHE_LIMIT) {
      delete cache.messageFormat[cache.order.shift() as string];
    }
    cache.order.push(cacheKey);
    cache.messageFormat[cacheKey] = new IntlMessageFormat(
      String(payload.translation),
      payload.locale,
      {
        number: payload.formats.number,
        date: payload.formats.date,
        time: payload.formats.time,
      } as any,
      {
        ignoreTag: ignoreTags,
      },
    );
  }

  return cache.messageFormat[cacheKey];
}

export function createICUModule(options: ICUModuleOptions = {}): MessagevisorModule {
  const cache = createICUModuleCache();
  const name = options.name || "icu";

  return {
    name,
    format(payload: MessagevisorFormatPayload) {
      const moduleOptions = payload.moduleOptions?.[name] as { ignoreTags?: boolean } | undefined;
      const ignoreTags = moduleOptions?.ignoreTags ?? options.ignoreTags ?? true;

      return getCachedIntlMessageFormat(cache, payload, ignoreTags).format(payload.values as any);
    },
  };
}
