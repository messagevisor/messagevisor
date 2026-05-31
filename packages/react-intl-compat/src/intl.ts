import * as React from "react";

import {
  type EvaluationOptions,
  type TranslateOptions,
  type MessageFormatResult,
  type MessagePrimitiveValue,
  type MessageValue,
  type MessageValues,
  type Messagevisor,
} from "@messagevisor/sdk";
import type {
  FormatDateTimePresetOptions,
  FormatNumberPresetOptions,
  FormatPresets,
  FormatRelativeTimePresetOptions,
  LocaleKey,
  MessageKey,
} from "@messagevisor/types";

export type IntlMessageValues = MessageValues<React.ReactNode>;
export type PrimitiveMessageValues = Record<string, MessagePrimitiveValue>;

export interface MessageDescriptor {
  id?: string;
  defaultMessage?: string;
  description?: string;
}

export function defineMessage<T extends MessageDescriptor>(message: T): T {
  return message;
}

export function defineMessages<T extends Record<string, MessageDescriptor>>(messages: T): T {
  return messages;
}

export interface IntlShape {
  locale: LocaleKey;
  messages?: Record<string, string>;
  formats?: FormatPresets;
  timeZone?: string;
  messagevisor: Messagevisor;
  formatMessage(
    descriptor: MessageDescriptor,
    values?: PrimitiveMessageValues,
    options?: TranslateOptions,
  ): string;
  formatMessage(
    descriptor: MessageDescriptor,
    values: IntlMessageValues,
    options?: TranslateOptions,
  ): MessageFormatResult<React.ReactNode>;
  formatDate(
    value: Date | number | string,
    format?: string | FormatDateTimePresetOptions,
    options?: EvaluationOptions,
  ): string;
  formatDateToParts(
    value: Date | number | string,
    format?: string | FormatDateTimePresetOptions,
    options?: EvaluationOptions,
  ): Intl.DateTimeFormatPart[];
  formatTime(
    value: Date | number | string,
    format?: string | FormatDateTimePresetOptions,
    options?: EvaluationOptions,
  ): string;
  formatTimeToParts(
    value: Date | number | string,
    format?: string | FormatDateTimePresetOptions,
    options?: EvaluationOptions,
  ): Intl.DateTimeFormatPart[];
  formatNumber(
    value: number,
    format?: string | FormatNumberPresetOptions,
    options?: EvaluationOptions,
  ): string;
  formatNumberToParts(
    value: number,
    format?: string | FormatNumberPresetOptions,
    options?: EvaluationOptions,
  ): Intl.NumberFormatPart[];
  formatRelativeTime(
    value: number,
    unit: Intl.RelativeTimeFormatUnit,
    format?: string | FormatRelativeTimePresetOptions,
    options?: EvaluationOptions,
  ): string;
  formatPlural(value: number, options?: Intl.PluralRulesOptions): string;
  formatList(values: string[], options?: any): string;
  formatListToParts(values: string[], options?: any): any[];
  formatDisplayName(value: string, options?: any): string | undefined;
}

export function createIntlFromMessagevisor(
  messagevisor: Messagevisor,
  config: Partial<Pick<IntlShape, "locale" | "messages" | "formats" | "timeZone">> = {},
): IntlShape {
  const locale = messagevisor.getLocale() || config.locale || "";

  const requireICUModule = (message: string, translation: MessageFormatResult<React.ReactNode>) => {
    if (translation !== message) {
      return translation;
    }

    if (!/[<{]/.test(message)) {
      return translation;
    }

    throw new Error(
      "Message formatting requires a Messagevisor instance configured with createICUModule().",
    );
  };

  const formatDescriptorMessage = (
    descriptor: MessageDescriptor,
    values?: MessageValues<React.ReactNode>,
    options?: TranslateOptions,
  ) => {
    const translationOptions =
      typeof descriptor.defaultMessage !== "undefined" &&
      typeof options?.defaultTranslation === "undefined"
        ? { ...options, defaultTranslation: descriptor.defaultMessage }
        : options;
    const resolved = descriptor.id
      ? messagevisor.getRawTranslation(descriptor.id as MessageKey, translationOptions)
      : (descriptor.defaultMessage ?? "");
    const message = resolved;

    const translation = messagevisor.formatMessage(
      message,
      values as MessageValues<React.ReactNode>,
      translationOptions,
    );

    return requireICUModule(message, translation);
  };

  return {
    locale,
    messages: messagevisor.getDefaultTranslations(locale) || config.messages,
    formats: messagevisor.getDefaultFormats(locale) || config.formats,
    timeZone: config.timeZone ?? messagevisor.getTimeZone(),
    messagevisor,
    formatMessage: formatDescriptorMessage as IntlShape["formatMessage"],
    formatDate: (value, format, options) => messagevisor.formatDate(value, format as any, options),
    formatDateToParts: (value, format, options) =>
      messagevisor.formatDateToParts(value, format as any, options),
    formatTime: (value, format, options) => messagevisor.formatTime(value, format as any, options),
    formatTimeToParts: (value, format, options) =>
      messagevisor.formatTimeToParts(value, format as any, options),
    formatNumber: (value, format, options) =>
      messagevisor.formatNumber(value, format as any, options),
    formatNumberToParts: (value, format, options) =>
      messagevisor.formatNumberToParts(value, format as any, options),
    formatRelativeTime: (value, unit, format, options) =>
      messagevisor.formatRelativeTime(value, unit, format as any, options),
    formatPlural: (value, options) => messagevisor.formatPlural(value, options),
    formatList: (values, options) => messagevisor.formatList(values, options),
    formatListToParts: (values, options) => messagevisor.formatListToParts(values, options),
    formatDisplayName: (value, options) => messagevisor.formatDisplayName(value, options),
  };
}

export type WithIntlProps = {
  intl: IntlShape;
};

export function mergeRichTextValues(
  defaults: Record<string, (chunks: React.ReactNode[]) => React.ReactNode> | undefined,
  values: Record<string, MessageValue<React.ReactNode>> | undefined,
  message: string | undefined,
) {
  if (!defaults || !message) {
    return values;
  }

  const tagPattern = /<([A-Za-z][A-Za-z0-9_-]*)\b[^>]*>/g;
  const matchingDefaults: Record<string, (chunks: React.ReactNode[]) => React.ReactNode> = {};
  let match: RegExpExecArray | null;

  while ((match = tagPattern.exec(message))) {
    if (defaults[match[1]]) {
      matchingDefaults[match[1]] = defaults[match[1]];
    }
  }

  const defaultKeys = Object.keys(matchingDefaults);

  if (defaultKeys.length === 0) {
    return values;
  }

  return {
    ...matchingDefaults,
    ...(values || {}),
  };
}
