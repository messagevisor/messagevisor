import type {
  EvaluationOptions,
  MessageFormatResult,
  MessagePrimitiveValue,
  MessageValues,
  Messagevisor,
  TranslateOptions,
} from "@messagevisor/sdk";
import type { MessageKey } from "@messagevisor/types";

import type { MessagevisorVueContextValue, VueMessageChunk } from "./MessagevisorContext";
import { createRichTextTools, type VueMessageValues, type VueRichMessageValues } from "./richText";

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

type VueTranslationMethod = {
  (
    messageKey: MessageKey,
    values?: Record<string, MessagePrimitiveValue>,
    options?: TranslateOptions,
  ): string;
  (
    messageKey: MessageKey,
    values: VueRichMessageValues,
    options?: TranslateOptions,
  ): MessageFormatResult<VueMessageChunk>;
};

type VueFormatMessageMethod = {
  (
    message: string,
    values?: Record<string, MessagePrimitiveValue>,
    options?: EvaluationOptions,
  ): string;
  (
    message: string,
    values: VueRichMessageValues,
    options?: EvaluationOptions,
  ): MessageFormatResult<VueMessageChunk>;
};

export type MessagevisorApi = {
  t: VueTranslationMethod;
  translate: VueTranslationMethod;
  formatMessage: VueFormatMessageMethod;
} & Pick<Messagevisor, (typeof BOUND_METHODS)[number]>;

function bindMethod<K extends keyof Messagevisor>(instance: Messagevisor, key: K): Messagevisor[K] {
  return (instance[key] as (...args: never[]) => unknown).bind(instance) as Messagevisor[K];
}

export function createMessagevisorApi(context: MessagevisorVueContextValue): MessagevisorApi {
  const sdk = context.instance;
  const richText = createRichTextTools(context);

  const translate = ((messageKey, values, options) => {
    const message = sdk.getRawTranslation(messageKey, options);
    const translation = sdk.translate<VueMessageChunk>(
      messageKey,
      richText.mergeValues(values as VueMessageValues, message) as MessageValues<VueMessageChunk>,
      options,
    );

    return richText.wrapResult(
      richText.runModules(translation, {
        source: "translation",
        messageKey,
      }),
    );
  }) as VueTranslationMethod;

  const result = {
    t: translate,
    translate,
    formatMessage: ((message, values, options) => {
      const translation = sdk.formatMessage<VueMessageChunk>(
        message,
        richText.mergeValues(values as VueMessageValues, message) as MessageValues<VueMessageChunk>,
        options,
      );

      return richText.wrapResult(
        richText.runModules(translation, {
          source: "formatMessage",
        }),
      );
    }) as VueFormatMessageMethod,
  } as MessagevisorApi;

  for (const key of BOUND_METHODS) {
    result[key] = bindMethod(sdk, key) as never;
  }

  return result;
}
