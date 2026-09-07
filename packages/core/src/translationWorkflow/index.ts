import { createHash } from "crypto";
import type {
  Locale,
  TranslationState,
  TranslationStates,
  TranslationStatus,
} from "@messagevisor/types";
import { resolveLocaleValue } from "../localeResolution";

export interface TranslationGroup {
  translations: Record<string, string>;
  translationStates?: TranslationStates;
}

export interface TranslationMutation {
  locale: string;
  /** Omit for a state change, pass undefined explicitly to remove direct copy. */
  value?: string;
  status?: TranslationStatus;
}

export interface TranslationWorkflowOptions {
  sourceLocale?: string;
  locales?: Record<string, Locale>;
}

/** Hash exact UTF8 text, including whitespace and Unicode representation. */
export function getTranslationSourceHash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export const getTranslationTargetHash = getTranslationSourceHash;

/** Reconcile copy and state as a single immutable value before persistence. */
export function reconcileTranslationGroup<T extends TranslationGroup>(
  previous: TranslationGroup | undefined,
  next: T,
): T {
  const states: TranslationStates = {};
  for (const [locale, state] of Object.entries(next.translationStates || {})) {
    const text = next.translations[locale];
    if (typeof text === "undefined" || !state) continue;
    const changed = previous?.translations[locale] !== text;
    const invalidTarget =
      state.targetHash !== undefined && state.targetHash !== getTranslationTargetHash(text);
    states[locale] =
      changed || invalidTarget
        ? { status: state.status === "draft" ? "draft" : "translated" }
        : { ...state };
  }
  const result = { ...next, translations: { ...next.translations } };
  if (Object.keys(states).length) result.translationStates = states;
  else delete result.translationStates;
  return result;
}

/** All copy updates precede review hashing, independent of operation order. */
export function applyTranslationMutations<T extends TranslationGroup>(
  group: T,
  mutations: TranslationMutation[],
  options: TranslationWorkflowOptions = {},
): T {
  const translations = { ...group.translations };
  const seen = new Set<string>();
  for (const mutation of mutations) {
    if (seen.has(mutation.locale))
      throw new Error(`Duplicate translation mutation for "${mutation.locale}".`);
    seen.add(mutation.locale);
    if (options.locales && !Object.hasOwn(options.locales, mutation.locale)) {
      throw new Error(`Unknown locale "${mutation.locale}".`);
    }
    if (Object.hasOwn(mutation, "value")) {
      if (mutation.value === undefined) delete translations[mutation.locale];
      else translations[mutation.locale] = mutation.value;
    }
  }
  const result = reconcileTranslationGroup(group, { ...group, translations });
  const states = { ...result.translationStates };
  const source = options.sourceLocale
    ? resolveLocaleValue(translations, options.sourceLocale, options.locales || {})?.value
    : undefined;
  for (const { locale, status } of mutations) {
    if (!status) continue;
    if (translations[locale] === undefined)
      throw new Error(`Cannot set state without direct translation for "${locale}".`);
    if (status === "reviewed" && source === undefined)
      throw new Error("Review requires an effective source translation and sourceLocale.");
    states[locale] = {
      status,
      ...(source !== undefined ? { sourceHash: getTranslationSourceHash(source) } : {}),
      ...(status === "reviewed"
        ? { targetHash: getTranslationTargetHash(translations[locale]) }
        : {}),
    };
  }
  if (Object.keys(states).length) result.translationStates = states;
  return result;
}

export interface TranslationStateIssue {
  code:
    | "stale_translation"
    | "reviewed_translation_missing_source_hash"
    | "reviewed_translation_missing_target_hash"
    | "reviewed_translation_changed";
  field: "sourceHash" | "targetHash";
}

export function getTranslationStateIssues(
  translation: string,
  state: TranslationState | undefined,
  source: string | undefined,
): TranslationStateIssue[] {
  const issues: TranslationStateIssue[] = [];
  if (
    state?.sourceHash &&
    source !== undefined &&
    state.sourceHash !== getTranslationSourceHash(source)
  ) {
    issues.push({ code: "stale_translation", field: "sourceHash" });
  }
  if (state?.status === "reviewed") {
    if (!state.sourceHash)
      issues.push({ code: "reviewed_translation_missing_source_hash", field: "sourceHash" });
    if (!state.targetHash)
      issues.push({ code: "reviewed_translation_missing_target_hash", field: "targetHash" });
    else if (state.targetHash !== getTranslationTargetHash(translation))
      issues.push({ code: "reviewed_translation_changed", field: "targetHash" });
  }
  return issues;
}
