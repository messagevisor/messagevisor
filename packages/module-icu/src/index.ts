/* eslint-disable @typescript-eslint/no-unused-vars */
import IntlMessageFormat from "intl-messageformat";

import type { MessagevisorFormatPayload, MessagevisorModule } from "@messagevisor/sdk";

export interface ICUModuleOptions {
  name?: string;
  ignoreTags?: boolean;
}

interface ICUModuleCache {
  messageFormat: Record<string, IntlMessageFormat>;
}

function createEmptyRecord<T>() {
  return {} as Record<string, T>;
}

function createICUModuleCache(): ICUModuleCache {
  return {
    messageFormat: createEmptyRecord<IntlMessageFormat>(),
  };
}

function getCacheKey(payload: MessagevisorFormatPayload, ignoreTags: boolean) {
  return JSON.stringify({
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
