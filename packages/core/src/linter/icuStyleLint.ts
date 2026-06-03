import type { FormatPresets, Locale, Message } from "@messagevisor/types";

import { mergeFormatPresets } from "../formats";
import type { LintError } from "./index";

const IntlMessageFormat =
  require("intl-messageformat").default || require("intl-messageformat").IntlMessageFormat;

type IcuFormatType = "number" | "date" | "time";

interface IcuStyleReference {
  type: IcuFormatType;
  style: string;
  isSkeleton: boolean;
}

export interface LintMessageIcuOptions {
  icuSkeleton: boolean;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolveLocaleFormatChain(localeKey: string, localesByKey: Record<string, Locale>) {
  const chain: string[] = [];
  const seen = new Set<string>();
  let currentKey: string | undefined = localeKey;

  while (currentKey && !seen.has(currentKey)) {
    seen.add(currentKey);
    chain.unshift(currentKey);
    currentKey = localesByKey[currentKey]?.inheritFormatsFrom;
  }

  return chain;
}

function resolveLocaleFormats(localeKey: string, localesByKey: Record<string, Locale>) {
  const chain = resolveLocaleFormatChain(localeKey, localesByKey);
  let formats: FormatPresets | undefined;

  for (const key of chain) {
    formats = mergeFormatPresets(formats, localesByKey[key]?.formats);
  }

  return formats;
}

function findMatchingBrace(value: string, openIndex: number) {
  let depth = 0;

  for (let index = openIndex; index < value.length; index++) {
    const character = value[index];

    if (character === "{") {
      depth++;
    }

    if (character === "}") {
      depth--;

      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function splitTopLevelCommas(value: string) {
  const parts: string[] = [];
  let depth = 0;
  let startIndex = 0;

  for (let index = 0; index < value.length; index++) {
    const character = value[index];

    if (character === "{") {
      depth++;
      continue;
    }

    if (character === "}") {
      depth--;
      continue;
    }

    if (character === "," && depth === 0) {
      parts.push(value.slice(startIndex, index).trim());
      startIndex = index + 1;
    }
  }

  parts.push(value.slice(startIndex).trim());

  return parts;
}

function normalizeStyle(style: string): { style: string; isSkeleton: boolean } {
  const trimmedStyle = style.trim();

  if (!trimmedStyle) {
    return { style: "", isSkeleton: false };
  }

  if (trimmedStyle.startsWith("::")) {
    return { style: trimmedStyle, isSkeleton: true };
  }

  return { style: trimmedStyle.split(/\s+/)[0], isSkeleton: false };
}

function extractIcuStyleReferences(value: string): IcuStyleReference[] {
  const references: IcuStyleReference[] = [];
  let index = 0;

  while (index < value.length) {
    const openIndex = value.indexOf("{", index);

    if (openIndex === -1) {
      break;
    }

    const closeIndex = findMatchingBrace(value, openIndex);

    if (closeIndex === -1) {
      break;
    }

    const content = value.slice(openIndex + 1, closeIndex);
    const parts = splitTopLevelCommas(content);
    const type = parts[1]?.trim();
    const styleReference = parts[2] ? normalizeStyle(parts[2]) : { style: "", isSkeleton: false };

    if ((type === "number" || type === "date" || type === "time") && styleReference.style) {
      references.push({ type, style: styleReference.style, isSkeleton: styleReference.isSkeleton });
    }

    references.push(...extractIcuStyleReferences(content));
    index = closeIndex + 1;
  }

  return references;
}

function hasFormatStyle(formats: FormatPresets | undefined, type: IcuFormatType, style: string) {
  return typeof formats?.[type]?.[style] !== "undefined";
}

function getTranslationErrors(
  messageKey: string,
  messageFilePath: string,
  translation: string,
  localeKey: string,
  path: (string | number)[],
  localesByKey: Record<string, Locale>,
  options: LintMessageIcuOptions,
): LintError[] {
  const errors: LintError[] = [];
  const formats = resolveLocaleFormats(localeKey, localesByKey);
  const reportedReferences = new Set<string>();

  try {
    new IntlMessageFormat(translation, localeKey);
  } catch (error) {
    errors.push({
      level: "error",
      filePath: messageFilePath,
      entityType: "message",
      entityKey: messageKey,
      message: `Invalid ICU syntax for locale "${localeKey}" in message "${messageKey}". Fix the ICU message syntax before building datafiles. Parser reported: ${error instanceof Error ? error.message : String(error)}`,
      path,
      code: "invalid_icu_syntax",
      value: translation,
    });

    return errors;
  }

  for (const reference of extractIcuStyleReferences(translation)) {
    const referenceKey = `${reference.type}:${reference.style}`;

    if (reportedReferences.has(referenceKey)) {
      continue;
    }

    reportedReferences.add(referenceKey);

    if (reference.isSkeleton) {
      if (!options.icuSkeleton) {
        errors.push({
          level: "error",
          filePath: messageFilePath,
          entityType: "message",
          entityKey: messageKey,
          message: `ICU skeleton style "${reference.style}" is not allowed for locale "${localeKey}" in message "${messageKey}" because messagevisor.config.js has icuSkeleton set to false. Use a named formats.${reference.type} preset instead, or enable icuSkeleton.`,
          path,
          code: "icu_skeleton_not_allowed",
          value: reference.style,
        });
      }

      continue;
    }

    if (hasFormatStyle(formats, reference.type, reference.style)) {
      continue;
    }

    errors.push({
      level: "error",
      filePath: messageFilePath,
      entityType: "message",
      entityKey: messageKey,
      message: `Missing ICU ${reference.type} format style "${reference.style}" for locale "${localeKey}" in message "${messageKey}". Add formats.${reference.type}.${reference.style} to locale "${localeKey}" or one of its inheritFormatsFrom ancestors.`,
      path,
      code: "missing_icu_format_style",
      value: reference.style,
    });
  }

  return errors;
}

export function lintMessageIcuFormatStyles(
  messagesByKey: Record<string, Message>,
  localesByKey: Record<string, Locale>,
  getMessageFilePath: (key: string) => string,
  options: LintMessageIcuOptions,
) {
  const errors: LintError[] = [];

  for (const messageKey of Object.keys(messagesByKey)) {
    const message = messagesByKey[messageKey];
    const messageFilePath = getMessageFilePath(messageKey);
    const translations = isPlainObject(message?.translations) ? message.translations : {};

    for (const localeKey of Object.keys(translations)) {
      const translation = translations[localeKey];

      if (typeof translation !== "string") {
        continue;
      }

      errors.push(
        ...getTranslationErrors(
          messageKey,
          messageFilePath,
          translation,
          localeKey,
          ["translations", localeKey],
          localesByKey,
          options,
        ),
      );
    }

    const overrides = Array.isArray(message?.overrides) ? message.overrides : [];

    for (let index = 0; index < overrides.length; index++) {
      const override = overrides[index];
      const overrideTranslations = isPlainObject(override?.translations)
        ? override.translations
        : {};

      for (const localeKey of Object.keys(overrideTranslations)) {
        const translation = overrideTranslations[localeKey];

        if (typeof translation !== "string") {
          continue;
        }

        errors.push(
          ...getTranslationErrors(
            messageKey,
            messageFilePath,
            translation,
            localeKey,
            ["overrides", index, "translations", localeKey],
            localesByKey,
            options,
          ),
        );
      }
    }
  }

  return errors;
}
