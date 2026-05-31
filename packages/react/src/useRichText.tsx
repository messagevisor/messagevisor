import * as React from "react";

import type {
  MessagePrimitiveValue,
  MessageValue,
  MessagevisorTranslationSource,
} from "@messagevisor/sdk";
import type { MessageKey } from "@messagevisor/types";

import { MessagevisorContext } from "./MessagevisorContext";

export type ReactMessageValues = Record<string, MessageValue<React.ReactNode>>;
export type ReactRichMessageValues = Record<
  string,
  MessagePrimitiveValue | ((chunks: React.ReactNode[]) => React.ReactNode)
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

export function useRichText() {
  const context = React.useContext(MessagevisorContext);

  if (!context) {
    throw new Error("useSdk must be used within MessagevisorProvider.");
  }

  return React.useMemo(() => {
    function mergeValues(values?: ReactMessageValues, message?: string) {
      const defaults = context.defaultRichTextElements;
      const defaultKeys = Object.keys(defaults);

      if (!message || defaultKeys.length === 0) {
        return values;
      }

      const tagNames = getRichTagNames(message);
      const matchingDefaults = Object.fromEntries(
        defaultKeys.filter((key) => tagNames.has(key)).map((key) => [key, defaults[key]]),
      );

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

      return (
        <React.Fragment>
          {result.map((chunk, index) => (
            <React.Fragment key={index}>{chunk}</React.Fragment>
          ))}
        </React.Fragment>
      );
    }

    function runModules<TTranslation>(
      translation: TTranslation,
      payload: {
        source: MessagevisorTranslationSource;
        messageKey?: MessageKey;
      },
    ) {
      let currentTranslation = translation as React.ReactNode;
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
      wrapResult,
      runModules,
    };
  }, [
    context.modules,
    context.instance,
    context.defaultRichTextElements,
    context.wrapRichTextChunksInFragment,
  ]);
}
