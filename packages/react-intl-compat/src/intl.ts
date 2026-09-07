import * as React from "react";

import {
  type EvaluationOptions,
  type TranslateOptions,
  type MessageFormatResult,
  type MessagePrimitiveValue,
  type MessageValue,
  type MessageValues,
  type MessagevisorConsumer,
} from "@messagevisor/sdk";
import type {
  FormatDateTimePresetOptions,
  FormatNumberPresetOptions,
  FormatPresets,
  FormatRelativeTimePresetOptions,
  LocaleKey,
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
  messagevisor: MessagevisorConsumer;
  formatMessageWithValues(
    descriptor: MessageDescriptor,
    prepareValues: (source: string) => IntlMessageValues | undefined,
    options?: TranslateOptions,
  ): MessageFormatResult<React.ReactNode>;
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
  messagevisor: MessagevisorConsumer,
  config: Partial<Pick<IntlShape, "locale" | "messages" | "formats" | "timeZone">> = {},
): IntlShape {
  const locale = config.locale ?? messagevisor.getLocale() ?? "";
  const timeZone = config.timeZone ?? messagevisor.getTimeZone();
  const evaluationOptions = (options: TranslateOptions = {}): TranslateOptions => ({
    ...options,
    locale: options.locale ?? locale,
    timeZone: options.timeZone ?? timeZone,
    formats: mergeFormats(config.formats, options.formats),
  });

  const requireICUModule = (message: string) => {
    if (/[<{]/.test(message) && !messagevisor.hasFormatModule())
      throw new Error(
        "Message formatting requires a Messagevisor instance configured with createICUModule().",
      );
  };

  const formatMessageWithValues = (
    descriptor: MessageDescriptor,
    prepareValues: (source: string) => IntlMessageValues | undefined,
    options?: TranslateOptions,
  ) => {
    const translationOptions = evaluationOptions(
      typeof descriptor.defaultMessage !== "undefined" &&
        typeof options?.defaultTranslation === "undefined"
        ? { ...options, defaultTranslation: descriptor.defaultMessage }
        : options,
    );
    const prepare = (message: string) => {
      requireICUModule(message);
      return prepareValues(message);
    };
    if (
      descriptor.id &&
      !Object.prototype.hasOwnProperty.call(config.messages || {}, descriptor.id)
    ) {
      return messagevisor.translateWithValues(descriptor.id, prepare, translationOptions);
    }
    const message = descriptor.id
      ? config.messages![descriptor.id]
      : (descriptor.defaultMessage ?? "");
    return messagevisor.formatMessage(
      message,
      prepare(message) as IntlMessageValues,
      translationOptions,
    );
  };

  return {
    locale,
    messages: config.messages ?? messagevisor.getDefaultTranslations(locale),
    formats: config.formats ?? messagevisor.getDefaultFormats(locale),
    timeZone,
    messagevisor,
    formatMessage: ((descriptor, values, options) =>
      formatMessageWithValues(descriptor, () => values, options)) as IntlShape["formatMessage"],
    formatMessageWithValues,
    formatDate: (value, format, options) =>
      messagevisor.formatDate(value, format as any, evaluationOptions(options)),
    formatDateToParts: (value, format, options) =>
      messagevisor.formatDateToParts(value, format as any, evaluationOptions(options)),
    formatTime: (value, format, options) =>
      messagevisor.formatTime(value, format as any, evaluationOptions(options)),
    formatTimeToParts: (value, format, options) =>
      messagevisor.formatTimeToParts(value, format as any, evaluationOptions(options)),
    formatNumber: (value, format, options) =>
      messagevisor.formatNumber(value, format as any, evaluationOptions(options)),
    formatNumberToParts: (value, format, options) =>
      messagevisor.formatNumberToParts(value, format as any, evaluationOptions(options)),
    formatRelativeTime: (value, unit, format, options) =>
      messagevisor.formatRelativeTime(value, unit, format as any, evaluationOptions(options)),
    formatPlural: (value, options) => messagevisor.formatPlural(value, { locale, ...options }),
    formatList: (values, options) => messagevisor.formatList(values, { locale, ...options }),
    formatListToParts: (values, options) =>
      messagevisor.formatListToParts(values, { locale, ...options }),
    formatDisplayName: (value, options) =>
      messagevisor.formatDisplayName(value, { locale, ...options }),
  };
}

function mergeFormats(base?: FormatPresets, overrides?: FormatPresets): FormatPresets | undefined {
  if (!base) return overrides;
  if (!overrides) return base;
  const result = { ...base };
  for (const type of Object.keys(overrides) as Array<keyof FormatPresets>) {
    const family: Record<string, object> = { ...base[type] };
    for (const preset of Object.keys(overrides[type] || {})) {
      Object.defineProperty(family, preset, {
        enumerable: true,
        configurable: true,
        writable: true,
        value: {
          ...(Object.prototype.hasOwnProperty.call(family, preset) ? family[preset] : {}),
          ...overrides[type]![preset],
        },
      });
    }
    Object.defineProperty(result, type, {
      value: family,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return result;
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
    if (Object.prototype.hasOwnProperty.call(defaults, match[1])) {
      Object.defineProperty(matchingDefaults, match[1], {
        value: defaults[match[1]],
        enumerable: true,
        configurable: true,
      });
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
