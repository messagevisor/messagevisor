import type {
  MessagePrimitiveValue,
  MessageValue,
  MessagevisorTranslationSource,
} from "@messagevisor/sdk";
import type { MessageKey } from "@messagevisor/types";
import { Fragment, h, isRef } from "vue";

import type {
  MessagevisorVueContextValue,
  VueMessageChunk,
  VueRichTextElementHandler,
} from "./MessagevisorContext";

export type VueMessageValues = Record<string, MessageValue<VueMessageChunk>>;
export type VueRichMessageValues = Record<
  string,
  MessagePrimitiveValue | VueRichTextElementHandler
>;

const RICH_TAG_NAME_PATTERN = /<([A-Za-z][A-Za-z0-9_-]*)\b[^>]*>/g;

function getRichTagNames(message: string) {
  const tags = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = RICH_TAG_NAME_PATTERN.exec(message))) {
    tags.add(match[1]);
  }

  return tags;
}

function maybeResolveRecordEntry(value: unknown) {
  if (isRef(value)) {
    return value.value;
  }

  if (typeof value === "function" && value.length === 0) {
    return (value as () => unknown)();
  }

  return value;
}

export function resolveRecord<TRecord extends Record<string, unknown>>(
  value?: TRecord | (() => TRecord),
) {
  const record = typeof value === "function" ? value() : value;

  if (!record) {
    return record;
  }

  return Object.fromEntries(
    Object.entries(record).map(([key, entry]) => [key, maybeResolveRecordEntry(entry)]),
  ) as TRecord;
}

export function createRichTextTools(context: MessagevisorVueContextValue) {
  function mergeValues(values?: VueMessageValues, message?: string) {
    const defaults = context.defaultRichTextElements;
    const defaultKeys = Object.keys(defaults);

    if (!message || defaultKeys.length === 0) {
      return values;
    }

    const tagNames = getRichTagNames(message);
    const matchingDefaults = Object.fromEntries(
      defaultKeys.filter((key) => tagNames.has(key)).map((key) => [key, defaults[key]]),
    ) as VueMessageValues;

    if (Object.keys(matchingDefaults).length === 0) {
      return values;
    }

    return {
      ...matchingDefaults,
      ...(values || {}),
    };
  }

  function wrapResult<T>(result: T) {
    if (!context.wrapRichTextChunksInFragment || !Array.isArray(result)) {
      return result;
    }

    return h(
      Fragment,
      null,
      result.map((chunk, index) => h(Fragment, { key: index }, [chunk])),
    );
  }

  function runModules<TTranslation>(
    translation: TTranslation,
    payload: {
      source: MessagevisorTranslationSource;
      messageKey?: MessageKey;
    },
  ) {
    let currentTranslation = translation as VueMessageChunk;
    const locale = context.instance.getLocale();

    if (!locale) {
      return translation;
    }

    for (const module of context.modules) {
      const nextTranslation = module.transform?.({
        translation: currentTranslation,
        locale,
        ...payload,
      });

      if (typeof nextTranslation !== "undefined") {
        currentTranslation = nextTranslation;
      }
    }

    return currentTranslation;
  }

  return {
    mergeValues,
    runModules,
    wrapResult,
  };
}
