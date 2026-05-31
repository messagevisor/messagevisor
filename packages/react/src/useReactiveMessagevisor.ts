import * as React from "react";

import type {
  EvaluationOptions,
  TranslateOptions,
  MessagePrimitiveValue,
  Messagevisor,
} from "@messagevisor/sdk";
import type {
  Context,
  FormatDateTimePresetOptions,
  FormatNumberPresetOptions,
  FormatRelativeTimePresetOptions,
  LocaleDirection,
  LocaleKey,
  MessageKey,
} from "@messagevisor/types";

import { useMessagevisorSnapshot } from "./useMessagevisorSnapshot";
import { useRichText, type ReactMessageValues, type ReactRichMessageValues } from "./useRichText";
import { useSdk } from "./useSdk";

export interface LocaleInfo {
  locale: LocaleKey | null;
  direction: LocaleDirection | undefined;
}

function useReactiveSdk() {
  const sdk = useSdk();
  useMessagevisorSnapshot();

  return sdk;
}

export function useLocale(): LocaleKey | null {
  return useMessagevisorSnapshot().locale;
}

export function useDirection(): LocaleDirection | undefined {
  return useMessagevisorSnapshot().direction;
}

export function useLocaleInfo(): LocaleInfo {
  const snapshot = useMessagevisorSnapshot();

  return React.useMemo(
    () => ({
      locale: snapshot.locale,
      direction: snapshot.direction,
    }),
    [snapshot.locale, snapshot.direction],
  );
}

export function useMessagevisorContext(): Context {
  return useMessagevisorSnapshot().context;
}

export function useCurrency(): string | undefined {
  return useMessagevisorSnapshot().currency;
}

export function useTimeZone(): string | undefined {
  return useMessagevisorSnapshot().timeZone;
}

export function useTranslation(
  messageKey: MessageKey,
  values?: Record<string, MessagePrimitiveValue>,
  options?: TranslateOptions,
): string;
export function useTranslation(
  messageKey: MessageKey,
  values: ReactRichMessageValues,
  options?: TranslateOptions,
): React.ReactNode;
export function useTranslation(
  messageKey: MessageKey,
  values?: ReactMessageValues,
  options?: TranslateOptions,
): string | React.ReactNode {
  const sdk = useReactiveSdk();
  const richText = useRichText();
  const message = sdk.getRawTranslation(messageKey, options);
  const translation = sdk.translate<React.ReactNode>(
    messageKey,
    richText.mergeValues(values, message),
    options,
  );

  return richText.wrapResult(
    richText.runModules(translation, {
      source: "translation",
      messageKey,
    }),
  ) as React.ReactNode;
}

export function useFormatMessage(
  message: string,
  values?: Record<string, MessagePrimitiveValue>,
  options?: EvaluationOptions,
): string;
export function useFormatMessage(
  message: string,
  values: ReactRichMessageValues,
  options?: EvaluationOptions,
): React.ReactNode;
export function useFormatMessage(
  message: string,
  values?: ReactMessageValues,
  options?: EvaluationOptions,
): string | React.ReactNode {
  const sdk = useReactiveSdk();
  const richText = useRichText();
  const translation = sdk.formatMessage(message, richText.mergeValues(values, message), options);

  return richText.wrapResult(
    richText.runModules(translation, {
      source: "formatMessage",
    }),
  ) as React.ReactNode;
}

export function useFormatNumber(
  value: number,
  presetOrOptions?: string | FormatNumberPresetOptions,
  options?: EvaluationOptions,
) {
  return useReactiveSdk().formatNumber(value, presetOrOptions, options);
}

export function useFormatNumberToParts(
  value: number,
  presetOrOptions?: string | FormatNumberPresetOptions,
  options?: EvaluationOptions,
) {
  return useReactiveSdk().formatNumberToParts(value, presetOrOptions, options);
}

export function useFormatDate(
  value: Date | number | string,
  presetOrOptions?: string | FormatDateTimePresetOptions,
  options?: EvaluationOptions,
) {
  return useReactiveSdk().formatDate(value, presetOrOptions, options);
}

export function useFormatDateToParts(
  value: Date | number | string,
  presetOrOptions?: string | FormatDateTimePresetOptions,
  options?: EvaluationOptions,
) {
  return useReactiveSdk().formatDateToParts(value, presetOrOptions, options);
}

export function useFormatTime(
  value: Date | number | string,
  presetOrOptions?: string | FormatDateTimePresetOptions,
  options?: EvaluationOptions,
) {
  return useReactiveSdk().formatTime(value, presetOrOptions, options);
}

export function useFormatTimeToParts(
  value: Date | number | string,
  presetOrOptions?: string | FormatDateTimePresetOptions,
  options?: EvaluationOptions,
) {
  return useReactiveSdk().formatTimeToParts(value, presetOrOptions, options);
}

export function useFormatDateTimeRange(
  start: Date | number | string,
  end: Date | number | string,
  presetOrOptions?: string | FormatDateTimePresetOptions,
  options?: EvaluationOptions,
) {
  return useReactiveSdk().formatDateTimeRange(start, end, presetOrOptions, options);
}

export function useFormatRelativeTime(
  value: number,
  unit: Intl.RelativeTimeFormatUnit,
  presetOrOptions?: string | FormatRelativeTimePresetOptions,
  options?: EvaluationOptions,
) {
  return useReactiveSdk().formatRelativeTime(value, unit, presetOrOptions, options);
}

export function useFormatPlural(value: number, options?: Intl.PluralRulesOptions) {
  return useReactiveSdk().formatPlural(value, options);
}

export function useFormatList(values: string[], options?: any) {
  return useReactiveSdk().formatList(values, options);
}

export function useFormatListToParts(values: string[], options?: any) {
  return useReactiveSdk().formatListToParts(values, options);
}

export function useFormatDisplayName(value: string, options?: any) {
  return useReactiveSdk().formatDisplayName(value, options);
}

export type ReactiveMessagevisorApi = Pick<
  Messagevisor,
  | "translate"
  | "formatMessage"
  | "formatNumber"
  | "formatNumberToParts"
  | "formatDate"
  | "formatDateToParts"
  | "formatTime"
  | "formatTimeToParts"
  | "formatDateTimeRange"
  | "formatRelativeTime"
  | "formatPlural"
  | "formatList"
  | "formatListToParts"
  | "formatDisplayName"
>;
