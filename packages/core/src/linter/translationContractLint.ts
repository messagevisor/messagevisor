import * as crypto from "crypto";

import type { Message, TranslationStates } from "@messagevisor/types";

import type { LintError } from "./index";

const IntlMessageFormat =
  require("intl-messageformat").default || require("intl-messageformat").IntlMessageFormat;

function sourceHash(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function collectMessageContract(message: string, locale: string) {
  const ast = new IntlMessageFormat(message, locale).getAst();
  const entries = new Set<string>();

  function visit(value: unknown) {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;

    const node = value as Record<string, unknown>;
    const type = node.type;
    const name = node.value;

    // FormatJS AST: 1=argument, 2=number, 3=date, 4=time,
    // 5=select, 6=plural/selectordinal, 8=rich-text tag.
    if (typeof name === "string" && typeof type === "number") {
      if (type >= 1 && type <= 6) entries.add(`argument:${name}:${type}`);
      if (type === 8) entries.add(`tag:${name}`);
    }

    Object.values(node).forEach(visit);
  }

  visit(ast);
  return Array.from(entries).sort();
}

function lintTranslationGroup(
  messageKey: string,
  filePath: string,
  sourceLocale: string,
  translations: Record<string, string>,
  states: TranslationStates | undefined,
  basePath: (string | number)[],
  checkMessageContract: boolean,
) {
  const errors: LintError[] = [];
  const source = translations[sourceLocale];

  if (typeof source === "undefined") {
    errors.push({
      level: "error",
      filePath,
      entityType: "message",
      entityKey: messageKey,
      message: `Missing source-locale translation "${sourceLocale}".`,
      path: [...basePath, "translations", sourceLocale],
      code: "missing_source_translation",
    });
    return errors;
  }

  let sourceContract: string[] = [];
  if (checkMessageContract) {
    try {
      sourceContract = collectMessageContract(source, sourceLocale);
    } catch {
      // ICU syntax diagnostics are owned by the ICU lint pass.
      return errors;
    }
  }

  const expectedHash = sourceHash(source);

  for (const [locale, translation] of Object.entries(translations)) {
    if (locale === sourceLocale) continue;

    try {
      if (!checkMessageContract) throw new Error("contract check disabled");
      const contract = collectMessageContract(translation, locale);
      if (JSON.stringify(contract) !== JSON.stringify(sourceContract)) {
        errors.push({
          level: "error",
          filePath,
          entityType: "message",
          entityKey: messageKey,
          message: `Translation for locale "${locale}" does not preserve the ICU arguments and rich-text tags from source locale "${sourceLocale}".`,
          path: [...basePath, "translations", locale],
          code: "translation_contract_mismatch",
          value: { expected: sourceContract, actual: contract },
        });
      }
    } catch {
      // ICU syntax diagnostics are owned by the ICU lint pass.
    }

    const state = states?.[locale];
    if (state?.sourceHash && state.sourceHash !== expectedHash) {
      errors.push({
        level: "error",
        filePath,
        entityType: "message",
        entityKey: messageKey,
        message: `Translation for locale "${locale}" is stale because its sourceHash does not match the current "${sourceLocale}" source translation.`,
        path: [...basePath, "translationStates", locale, "sourceHash"],
        code: "stale_translation",
        value: state.sourceHash,
      });
    }

    if (state?.status === "reviewed" && !state.sourceHash) {
      errors.push({
        level: "error",
        filePath,
        entityType: "message",
        entityKey: messageKey,
        message: `Reviewed translation for locale "${locale}" requires sourceHash.`,
        path: [...basePath, "translationStates", locale, "sourceHash"],
        code: "reviewed_translation_missing_source_hash",
      });
    }
  }

  return errors;
}

export function lintTranslationContracts(
  messagesByKey: Record<string, Message>,
  sourceLocale: string,
  getMessageFilePath: (key: string) => string,
  options: { checkMessageContract: boolean },
) {
  const errors: LintError[] = [];

  for (const [messageKey, message] of Object.entries(messagesByKey)) {
    const filePath = getMessageFilePath(messageKey);
    errors.push(
      ...lintTranslationGroup(
        messageKey,
        filePath,
        sourceLocale,
        message.translations,
        message.translationStates,
        [],
        options.checkMessageContract,
      ),
    );

    (message.overrides || []).forEach((override, index) => {
      errors.push(
        ...lintTranslationGroup(
          messageKey,
          filePath,
          sourceLocale,
          override.translations,
          override.translationStates,
          ["overrides", index],
          options.checkMessageContract,
        ),
      );
    });
  }

  return errors;
}

export { sourceHash as getTranslationSourceHash };
