import { parse, TYPE, type MessageFormatElement } from "@formatjs/icu-messageformat-parser";
import type { Locale, Message } from "@messagevisor/types";
import { visitIcuElements } from "../icuStyleReferences";
import { resolveLocaleValue } from "../localeResolution";
import { getTranslationStateIssues, type TranslationGroup } from "../translationWorkflow";
import type { LintError } from "./index";

export { getTranslationSourceHash, getTranslationTargetHash } from "../translationWorkflow";

export interface IcuArgumentContract {
  arguments: Record<string, string[]>;
  selectors: string[];
  tags: string[];
}

/** Plain interpolation is unconstrained; plural categories belong to each language. */
export function collectMessageContract(message: string): IcuArgumentContract {
  const ast = parse(message);
  const argumentsByName = new Map<string, Set<string>>();
  const selectors = new Set<string>();
  const tags = new Set<string>();
  visitIcuElements(ast, (element) => {
    if (element.type >= TYPE.argument && element.type <= TYPE.plural) {
      const name = (element as { value: string }).value;
      const kinds = argumentsByName.get(name) || new Set<string>();
      kinds.add(
        element.type === TYPE.argument
          ? "value"
          : element.type === TYPE.date || element.type === TYPE.time
            ? "datetime"
            : element.type === TYPE.select
              ? "string"
              : "number",
      );
      argumentsByName.set(name, kinds);
    }
    if (element.type === TYPE.select) {
      selectors.add(JSON.stringify([element.value, "select", Object.keys(element.options).sort()]));
    }
    if (element.type === TYPE.plural) {
      selectors.add(
        JSON.stringify([
          element.value,
          element.pluralType,
          element.offset,
          Object.keys(element.options)
            .filter((key) => key.startsWith("="))
            .sort(),
        ]),
      );
    }
  });
  function visitTags(elements: MessageFormatElement[], ancestors: string[]) {
    for (const element of elements) {
      if (element.type === TYPE.tag) {
        const nesting = [...ancestors, element.value];
        tags.add(JSON.stringify(nesting));
        visitTags(element.children, nesting);
      } else if (element.type === TYPE.select || element.type === TYPE.plural) {
        Object.values(element.options).forEach((option) => visitTags(option.value, ancestors));
      }
    }
  }
  visitTags(ast, []);
  return {
    arguments: Object.fromEntries(
      [...argumentsByName]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, kinds]) => [name, [...kinds].sort()]),
    ),
    selectors: [...selectors].sort(),
    tags: [...tags].sort(),
  };
}

export function compareMessageContracts(
  expected: IcuArgumentContract,
  actual: IcuArgumentContract,
): string[] {
  const differences: string[] = [];
  const names = new Set([...Object.keys(expected.arguments), ...Object.keys(actual.arguments)]);
  for (const name of names) {
    const source = expected.arguments[name];
    const target = actual.arguments[name];
    if (!source || !target) differences.push(`arguments.${name}`);
    else {
      const sourceKinds = source.filter((kind) => kind !== "value");
      const targetKinds = target.filter((kind) => kind !== "value");
      if (
        sourceKinds.length &&
        targetKinds.length &&
        targetKinds.some((kind) => !sourceKinds.includes(kind))
      )
        differences.push(`arguments.${name}.type`);
    }
  }
  // New linguistic branching is allowed. Existing source selectors remain invariant.
  for (const selector of expected.selectors) {
    if (!actual.selectors.includes(selector))
      differences.push(`selectors.${JSON.parse(selector)[0]}`);
  }
  for (const selector of actual.selectors) {
    const [name, kind] = JSON.parse(selector);
    if (
      expected.selectors.some((entry) => {
        const [sourceName, sourceKind] = JSON.parse(entry);
        return name === sourceName && kind === sourceKind;
      }) &&
      !expected.selectors.includes(selector)
    )
      differences.push(`selectors.${name}`);
  }
  if (JSON.stringify(expected.tags) !== JSON.stringify(actual.tags)) differences.push("tags");
  return [...new Set(differences)];
}

export interface TranslationContractLintOptions {
  checkMessageContract: boolean;
  /** Supply locale entities to resolve the effective source translation. */
  locales?: Record<string, Locale>;
}

export function lintTranslationContracts(
  messagesByKey: Record<string, Message>,
  sourceLocale: string,
  getMessageFilePath: (key: string) => string,
  options: TranslationContractLintOptions,
) {
  const errors: LintError[] = [];
  for (const [messageKey, message] of Object.entries(messagesByKey)) {
    const lintGroup = (group: TranslationGroup, basePath: (string | number)[]) => {
      const add = (code: string, path: (string | number)[], text: string, value?: unknown) =>
        errors.push({
          level: "error",
          filePath: getMessageFilePath(messageKey),
          entityType: "message",
          entityKey: messageKey,
          code,
          path: [...basePath, ...path],
          message: text,
          ...(value === undefined ? {} : { value }),
        });
      const source = resolveLocaleValue(
        group.translations,
        sourceLocale,
        options.locales || {},
      )?.value;
      if (source === undefined)
        add(
          "missing_source_translation",
          ["translations", sourceLocale],
          `Missing source-locale translation "${sourceLocale}".`,
        );
      let sourceContract: IcuArgumentContract | undefined;
      if (options.checkMessageContract && source !== undefined) {
        try {
          sourceContract = collectMessageContract(source);
        } catch {
          /* Syntax belongs to ICU lint. */
        }
      }
      for (const [locale, translation] of Object.entries(group.translations)) {
        if (locale !== sourceLocale && sourceContract) {
          try {
            const actual = collectMessageContract(translation);
            const differences = compareMessageContracts(sourceContract, actual);
            if (differences.length)
              add(
                "translation_contract_mismatch",
                ["translations", locale],
                `Translation for locale "${locale}" changes the source ICU contract: ${differences.join(", ")}.`,
                { expected: sourceContract, actual, differences },
              );
          } catch {
            /* Syntax belongs to ICU lint, without suppressing review checks. */
          }
        }
        for (const issue of getTranslationStateIssues(
          translation,
          group.translationStates?.[locale],
          source,
        )) {
          add(
            issue.code,
            ["translationStates", locale, issue.field],
            `Translation for locale "${locale}" has an invalid review invariant: ${issue.code}.`,
          );
        }
      }
      for (const locale of Object.keys(group.translationStates || {})) {
        if (group.translations[locale] === undefined)
          add(
            "orphan_translation_state",
            ["translationStates", locale],
            `Translation state for locale "${locale}" requires direct copy.`,
          );
      }
    };
    lintGroup(message, []);
    message.overrides?.forEach((override, index) => lintGroup(override, ["overrides", index]));
  }
  return errors;
}
