import * as React from "react";

import type {
  EvaluationOptions,
  TranslateOptions,
  MessagePrimitiveValue,
  Messagevisor,
} from "@messagevisor/sdk";
import type { MessageKey } from "@messagevisor/types";

import { useRichText, type ReactMessageValues, type ReactRichMessageValues } from "./useRichText";
import { useSdk } from "./useSdk";

const BOUND_METHODS = [
  "formatNumber",
  "formatNumberToParts",
  "formatDate",
  "formatDateToParts",
  "formatTime",
  "formatTimeToParts",
  "formatDateTimeRange",
  "formatRelativeTime",
  "formatPlural",
  "formatList",
  "formatListToParts",
  "formatDisplayName",
  "setLocale",
  "getLocale",
  "getDirection",
  "setContext",
  "getContext",
  "setCurrency",
  "getCurrency",
  "setTimeZone",
  "getTimeZone",
  "setDatafile",
  "getRevision",
] as const satisfies readonly (keyof Messagevisor)[];

export const MESSAGEVISOR_METHODS = ["t", "formatMessage", ...BOUND_METHODS] as const;

type ReactTranslationMethod = {
  (
    messageKey: MessageKey,
    values?: Record<string, MessagePrimitiveValue>,
    options?: TranslateOptions,
  ): string;
  (
    messageKey: MessageKey,
    values: ReactRichMessageValues,
    options?: TranslateOptions,
  ): React.ReactNode;
};

type ReactFormatMessageMethod = {
  (
    message: string,
    values?: Record<string, MessagePrimitiveValue>,
    options?: EvaluationOptions,
  ): string;
  (message: string, values: ReactRichMessageValues, options?: EvaluationOptions): React.ReactNode;
};

export type MessagevisorApi = {
  t: ReactTranslationMethod;
  formatMessage: ReactFormatMessageMethod;
} & Pick<Messagevisor, (typeof BOUND_METHODS)[number]>;

function bindMethod<K extends keyof Messagevisor>(instance: Messagevisor, key: K): Messagevisor[K] {
  return (instance[key] as (...args: never[]) => unknown).bind(instance) as Messagevisor[K];
}

export function useMessagevisor(): MessagevisorApi {
  const sdk = useSdk();
  const richText = useRichText();

  return React.useMemo(() => {
    const result = {
      t: ((messageKey, values, options) => {
        const message = sdk.getRawTranslation(messageKey, options);
        const translation = sdk.translate<React.ReactNode>(
          messageKey,
          richText.mergeValues(values as ReactMessageValues, message),
          options,
        );

        return richText.wrapResult(
          richText.runModules(translation, {
            source: "translation",
            messageKey,
          }),
        );
      }) as ReactTranslationMethod,
      formatMessage: ((message, values, options) => {
        const translation = sdk.formatMessage(
          message,
          richText.mergeValues(values as ReactMessageValues, message),
          options,
        );

        return richText.wrapResult(
          richText.runModules(translation, {
            source: "formatMessage",
          }),
        );
      }) as ReactFormatMessageMethod,
    } as MessagevisorApi;

    for (const key of BOUND_METHODS) {
      result[key] = bindMethod(sdk, key) as never;
    }

    return result;
  }, [sdk, richText]);
}
