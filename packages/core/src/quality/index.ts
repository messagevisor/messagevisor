import { parse, TYPE, type MessageFormatElement } from "@formatjs/icu-messageformat-parser";
import type { TranslatorContext } from "@messagevisor/types";
import type { ProjectConfig } from "../config";
import type { Datasource } from "../datasource";
import type { Plugin } from "../cli";
import { resolveLocaleValue } from "../localeResolution";
import { getProjectSetExecutions } from "../sets";
import {
  readTranslationSelection,
  type TranslationSelectionOptions,
} from "../translationWorkflow/selection";

export interface PseudoLocalisationOptions {
  mode?: "accent" | "rtl";
  /** Additional literal graphemes as a fraction, from zero to three. */
  expansion?: number;
}

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
export function countGraphemes(value: string): number {
  let count = 0;
  const iterator = graphemes.segment(value)[Symbol.iterator]();
  while (!iterator.next().done) count++;
  return count;
}

function quoteLiteral(value: string, inPlural: boolean): string {
  const escaped = value.replace(/'/g, "''");
  // One quoted span avoids adjacent quote delimiters becoming a literal apostrophe.
  return escaped.replace(inPlural ? /[{}<#][\s\S]*/ : /[{}<][\s\S]*/, (tail) => `'${tail}'`);
}

/** Transform literal AST spans only, retaining original ICU structure and styles. */
export function pseudoLocaliseIcu(value: string, options: PseudoLocalisationOptions = {}): string {
  const expansion = options.expansion ?? 0.3;
  if (!Number.isFinite(expansion) || expansion < 0 || expansion > 3)
    throw new Error("expansion must be between 0 and 3.");
  const mode = options.mode ?? "accent";
  if (mode !== "accent" && mode !== "rtl") throw new Error("pseudo mode must be accent or rtl.");
  const edits: Array<{ start: number; end: number; value: string }> = [];
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const accents = "áƀçďëƒğħïĵķľɱñôƥɋřšŧüṽŵẋÿžÁƁÇĎËƑĞĦÏĴĶĽṀÑÔƤɊŘŠŦÜṼŴẊŸŽ";
  function visit(elements: MessageFormatElement[], inPlural = false) {
    for (const element of elements) {
      const location = element.location!;
      if (element.type === TYPE.literal) {
        let transformed = [...element.value]
          .map((character) => {
            const index = alphabet.indexOf(character);
            return index < 0 ? character : accents[index];
          })
          .join("");
        if (mode === "rtl")
          transformed = transformed
            .split(/([\u2066-\u2069])/u)
            .map((span) =>
              [...graphemes.segment(span)]
                .map((part) => part.segment)
                .reverse()
                .join(""),
            )
            .join("");
        if (/\S/u.test(element.value))
          transformed += "~".repeat(Math.ceil(countGraphemes(element.value) * expansion));
        edits.push({
          start: location.start.offset,
          end: location.end.offset,
          value: quoteLiteral(transformed, inPlural),
        });
      } else if (
        mode === "rtl" &&
        (element.type === TYPE.argument ||
          element.type === TYPE.number ||
          element.type === TYPE.date ||
          element.type === TYPE.time ||
          element.type === TYPE.pound)
      ) {
        edits.push({
          start: location.start.offset,
          end: location.end.offset,
          value: `\u2068${value.slice(location.start.offset, location.end.offset)}\u2069`,
        });
      }
      if (element.type === TYPE.tag) visit(element.children, inPlural);
      else if (element.type === TYPE.plural || element.type === TYPE.select)
        for (const option of Object.values(element.options))
          visit(option.value, element.type === TYPE.plural);
    }
  }
  visit(parse(value, { captureLocation: true }));
  const chunks: string[] = [];
  let offset = 0;
  for (const edit of edits.sort((a, b) => a.start - b.start)) {
    chunks.push(value.slice(offset, edit.start), edit.value);
    offset = edit.end;
  }
  chunks.push(value.slice(offset));
  let output = chunks.join("");
  output = mode === "rtl" ? `\u2067${output}\u2069` : `[${output}]`;
  parse(output);
  return output;
}

export interface TranslationQualityIssue {
  code:
    | "invalid_icu"
    | "bidi_unsafe_control"
    | "bidi_unbalanced_isolate"
    | "bidi_unisolated_argument"
    | "bidi_unknown_direction"
    | "grapheme_limit"
    | "forbidden_terminology";
  message: string;
  offset?: number;
  argument?: string;
}

export function checkBidiSafety(
  value: string,
  options: { direction?: "ltr" | "rtl"; translatorContext?: TranslatorContext } = {},
): TranslationQualityIssue[] {
  const issues: TranslationQualityIssue[] = [];
  let ast: MessageFormatElement[];
  try {
    ast = parse(value, { captureLocation: true });
  } catch (error) {
    return [{ code: "invalid_icu", message: String(error) }];
  }
  for (const match of value.matchAll(/[\u202a-\u202e\u206a-\u206f]/gu))
    issues.push({
      code: "bidi_unsafe_control",
      message: "Use directional isolates instead of embedding or override controls.",
      offset: match.index,
    });
  const add = (
    code: TranslationQualityIssue["code"],
    message: string,
    element: MessageFormatElement,
    argument?: string,
  ) =>
    issues.push({
      code,
      message,
      offset: element.location?.start.offset,
      ...(argument ? { argument } : {}),
    });
  function walk(elements: MessageFormatElement[], stack: string[], floor = 0): string[] {
    for (const element of elements) {
      if (element.type === TYPE.literal) {
        for (const character of element.value) {
          if (/[\u2066-\u2068]/u.test(character)) stack.push(character);
          if (character === "\u2069") {
            if (stack.length <= floor)
              add(
                "bidi_unbalanced_isolate",
                "Directional isolate closes without an opener in this branch.",
                element,
              );
            else stack.pop();
          }
        }
      } else if (element.type === TYPE.tag) {
        stack = walk(element.children, stack, floor);
      } else if (element.type === TYPE.plural || element.type === TYPE.select) {
        for (const option of Object.values(element.options)) {
          const end = walk(option.value, [...stack], stack.length);
          if (JSON.stringify(end) !== JSON.stringify(stack))
            add(
              "bidi_unbalanced_isolate",
              "Each ICU branch must balance its own directional isolates.",
              element,
            );
        }
      } else if (options.direction === "rtl") {
        const name = element.type === TYPE.pound ? "#" : element.value;
        const direction = options.translatorContext?.placeholders?.[name]?.direction;
        if (direction !== "rtl" && stack.at(-1) !== "\u2066" && stack.at(-1) !== "\u2068")
          add(
            "bidi_unisolated_argument",
            `Interpolated value "${name}" needs LRI or FSI isolation in RTL copy.`,
            element,
            name,
          );
      }
    }
    return stack;
  }
  if (walk(ast, []).length)
    issues.push({
      code: "bidi_unbalanced_isolate",
      message: "Directional isolate remains open at the end of the message.",
    });
  return issues;
}

export function checkTranslationQuality(
  value: string,
  options: {
    bidi?: boolean;
    direction?: "ltr" | "rtl";
    translatorContext?: TranslatorContext;
  } = {},
): TranslationQualityIssue[] {
  const issues = options.bidi ? checkBidiSafety(value, options) : [];
  let ast: MessageFormatElement[];
  try {
    ast = parse(value);
  } catch (error) {
    return issues.some((issue) => issue.code === "invalid_icu")
      ? issues
      : [...issues, { code: "invalid_icu", message: String(error) }];
  }
  const context = options.translatorContext;
  function longestLiteralPath(elements: MessageFormatElement[]): number {
    return elements.reduce(
      (count, element) =>
        count +
        (element.type === TYPE.literal
          ? countGraphemes(element.value)
          : element.type === TYPE.tag
            ? longestLiteralPath(element.children)
            : element.type === TYPE.select || element.type === TYPE.plural
              ? Object.values(element.options).reduce(
                  (longest, option) => Math.max(longest, longestLiteralPath(option.value)),
                  0,
                )
              : 0),
      0,
    );
  }
  // Dynamic values need rendered examples; this budget covers the longest literal path.
  if (context?.maxGraphemes !== undefined && longestLiteralPath(ast) > context.maxGraphemes)
    issues.push({
      code: "grapheme_limit",
      message: `A possible literal path exceeds ${context.maxGraphemes} graphemes.`,
    });
  for (const term of new Set(context?.terminology?.forbidden || [])) {
    if (!term) continue;
    // Track prefix matches, not complete rendered strings. Branch unions are
    // bounded by the term length rather than the number of possible sentences.
    const prefix = new Array<number>(term.length).fill(0);
    for (let i = 1, length = 0; i < term.length; i++) {
      while (length && term[i] !== term[length]) length = prefix[length - 1];
      if (term[i] === term[length]) length++;
      prefix[i] = length;
    }
    let found = false;
    const walk = (elements: MessageFormatElement[], incoming: Set<number>): Set<number> => {
      let states = new Set(incoming);
      for (const element of elements) {
        if (found) break;
        if (element.type === TYPE.literal) {
          const next = new Set<number>();
          for (let state of states) {
            for (let i = 0; i < element.value.length; i++) {
              const character = element.value[i];
              while (state && term[state] !== character) state = prefix[state - 1];
              if (term[state] === character) state++;
              if (state === term.length) {
                found = true;
                break;
              }
            }
            next.add(state);
          }
          states = next;
        } else if (element.type === TYPE.tag) states = walk(element.children, states);
        else if (element.type === TYPE.select || element.type === TYPE.plural) {
          const branches = new Set<number>();
          for (const option of Object.values(element.options))
            for (const state of walk(option.value, states)) branches.add(state);
          states = branches;
        } else {
          // Runtime substitutions are unknown boundaries, not empty strings.
          states = new Set([0]);
        }
      }
      return states;
    };
    walk(ast, new Set([0]));
    if (found)
      issues.push({ code: "forbidden_terminology", message: `Forbidden terminology: ${term}` });
  }
  return issues;
}

/** Explicit project metadata wins; otherwise use the host's locale direction data. */
export function resolveQualityDirection(locale: string, direction?: "ltr" | "rtl") {
  if (direction) return direction;
  try {
    const info = new Intl.Locale(locale) as Intl.Locale & {
      getTextInfo?: () => { direction: "ltr" | "rtl" };
      textInfo?: { direction: "ltr" | "rtl" };
    };
    return info.getTextInfo?.().direction ?? info.textInfo?.direction;
  } catch {
    return undefined;
  }
}

export interface QualityProjectOptions extends TranslationSelectionOptions {
  pseudo?: "accent" | "rtl";
  expansion?: number;
  bidi?: boolean;
}

export async function reportProjectQuality(
  projectConfig: ProjectConfig,
  datasource: Datasource,
  options: QualityProjectOptions = {},
) {
  const { locales, scopes } = await readTranslationSelection(datasource, options);
  const entries: Array<{
    messageKey: string;
    overrideKey?: string;
    locale: string;
    target?: string;
    resolvedLocale: string;
    pseudo?: string;
    issues: TranslationQualityIssue[];
  }> = [];
  for (const scope of scopes)
    for (const messageKey of Object.keys(scope.messages).sort()) {
      const message = scope.messages[messageKey];
      for (const group of [message, ...(message.overrides || [])])
        for (const locale of scope.localeKeys) {
          const resolved = resolveLocaleValue(group.translations, locale, locales);
          if (!resolved) continue;
          const direction = resolveQualityDirection(locale, locales[locale]?.direction);
          const issues = checkTranslationQuality(resolved.value, {
            bidi: options.bidi,
            direction,
            translatorContext: group.translatorContext ?? message.translatorContext,
          });
          if (options.bidi && !direction)
            issues.push({
              code: "bidi_unknown_direction",
              message: `Cannot determine direction for locale "${locale}". Set its direction explicitly to complete bidi checks.`,
            });
          let pseudo: string | undefined;
          if (options.pseudo && !issues.some((issue) => issue.code === "invalid_icu"))
            pseudo = pseudoLocaliseIcu(resolved.value, {
              mode: options.pseudo,
              expansion: options.expansion,
            });
          entries.push({
            messageKey,
            ...(group !== message ? { overrideKey: group.key } : {}),
            locale,
            target: scope.target,
            resolvedLocale: resolved.sourceLocale,
            ...(pseudo === undefined ? {} : { pseudo }),
            issues,
          });
        }
    }
  return {
    entries,
    passed: entries.every((entry) => entry.issues.length === 0),
    summary: {
      total: entries.length,
      issues: entries.reduce((count, entry) => count + entry.issues.length, 0),
    },
  };
}

export const qualityPlugin: Plugin = {
  command: "quality",
  handler: async ({ projectConfig, datasource, parsed }) => {
    const results = [];
    for (const execution of await getProjectSetExecutions(projectConfig, datasource, parsed.set))
      results.push({
        set: execution.set,
        ...(await reportProjectQuality(
          execution.projectConfig,
          execution.datasource,
          parsed as QualityProjectOptions,
        )),
      });
    if (parsed.json)
      console.log(JSON.stringify(results.length === 1 ? results[0] : results, null, 2));
    else
      for (const report of results) {
        console.log(
          `Quality${report.set ? ` (${report.set})` : ""}: ${report.passed ? "PASS" : "FAIL"}, ${report.summary.total} translations, ${report.summary.issues} issues.`,
        );
        for (const entry of report.entries) {
          const identity = `${entry.messageKey}${entry.overrideKey ? ` (${entry.overrideKey})` : ""} [${entry.locale}]`;
          if (entry.pseudo !== undefined) console.log(`${identity}: ${entry.pseudo}`);
          for (const issue of entry.issues)
            console.log(`${identity}: ${issue.code}: ${issue.message}`);
        }
      }
    return results.every((report) => report.passed);
  },
  examples: [
    {
      command: "quality --pseudo=rtl --bidi --json",
      description: "preview pseudo translations and check bidi safety",
    },
  ],
};
