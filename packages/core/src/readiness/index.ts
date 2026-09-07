import type { Locale, Message, TranslationStatus } from "@messagevisor/types";
import type { Datasource } from "../datasource";
import type { ProjectConfig } from "../config";
import type { Plugin } from "../cli";
import { resolveLocaleValue } from "../localeResolution";
import { getProjectSetExecutions } from "../sets";
import { getTranslationStateIssues, type TranslationGroup } from "../translationWorkflow";
import {
  readTranslationSelection,
  type TranslationSelectionOptions,
} from "../translationWorkflow/selection";

export interface ReadinessGates {
  requireReviewed?: boolean;
  requireDirect?: boolean;
  maxMissing?: number;
  maxStale?: number;
}

export interface ReadinessEntry {
  messageKey: string;
  overrideKey?: string;
  locale: string;
  target?: string;
  resolution: "direct" | "inherited" | "missing";
  resolvedLocale?: string;
  status: TranslationStatus | "untracked" | "missing";
  reviewed: boolean;
  sourceAvailable: boolean;
  reviewRequired: boolean;
  stale: boolean;
  issues: string[];
}

export interface ReadinessReport {
  entries: ReadinessEntry[];
  summary: {
    total: number;
    direct: number;
    inherited: number;
    missing: number;
    reviewed: number;
    unreviewed: number;
    stale: number;
    missingSource: number;
  };
  passed: boolean;
  failures: string[];
}

export function evaluateReadinessGates(
  entries: ReadinessEntry[],
  gates: ReadinessGates = {},
): ReadinessReport {
  for (const key of ["maxMissing", "maxStale"] as const) {
    if (gates[key] !== undefined && (!Number.isInteger(gates[key]) || gates[key]! < 0))
      throw new Error(`${key} must be a nonnegative integer.`);
  }
  const summary = {
    total: entries.length,
    direct: entries.filter((entry) => entry.resolution === "direct").length,
    inherited: entries.filter((entry) => entry.resolution === "inherited").length,
    missing: entries.filter((entry) => entry.resolution === "missing").length,
    reviewed: entries.filter((entry) => entry.reviewed).length,
    unreviewed: entries.filter(
      (entry) => entry.reviewRequired && entry.resolution !== "missing" && !entry.reviewed,
    ).length,
    stale: entries.filter((entry) => entry.stale).length,
    missingSource: entries.filter((entry) => entry.issues.includes("missing_source_translation"))
      .length,
  };
  const failures: string[] = [];
  if (summary.missing > (gates.maxMissing ?? 0)) failures.push("missing_translations");
  if (summary.stale > (gates.maxStale ?? 0)) failures.push("stale_translations");
  if (summary.missingSource) failures.push("missing_source_translation");
  if (gates.requireDirect && summary.inherited) failures.push("inherited_translations");
  if (gates.requireReviewed && summary.unreviewed) failures.push("unreviewed_translations");
  if (gates.requireReviewed && entries.some((entry) => !entry.sourceAvailable))
    failures.push("review_source_unavailable");
  return { entries, summary, failures, passed: failures.length === 0 };
}

export function reportTranslationReadiness(
  messages: Record<string, Message>,
  locales: Record<string, Locale>,
  options: {
    sourceLocale?: string;
    localeKeys?: string[];
    target?: string;
    gates?: ReadinessGates;
  } = {},
): ReadinessReport {
  const entries: ReadinessEntry[] = [];
  const localeKeys =
    options.localeKeys ??
    Object.keys(locales)
      .filter((locale) => locale !== options.sourceLocale)
      .sort();
  for (const locale of localeKeys)
    if (!Object.hasOwn(locales, locale)) throw new Error(`Unknown locale "${locale}".`);
  for (const messageKey of Object.keys(messages).sort()) {
    const message = messages[messageKey];
    if (message.archived) continue;
    const addGroup = (group: TranslationGroup, overrideKey?: string) => {
      const source = options.sourceLocale
        ? resolveLocaleValue(group.translations, options.sourceLocale, locales)?.value
        : undefined;
      for (const locale of localeKeys) {
        const resolved = resolveLocaleValue(group.translations, locale, locales);
        const state = resolved ? group.translationStates?.[resolved.sourceLocale] : undefined;
        const issues = resolved
          ? getTranslationStateIssues(resolved.value, state, source).map(
              (issue) => issue.code as string,
            )
          : [];
        if (source === undefined && options.sourceLocale) issues.push("missing_source_translation");
        const stale = issues.some((issue) => issue !== "missing_source_translation");
        entries.push({
          messageKey,
          ...(overrideKey === undefined ? {} : { overrideKey }),
          locale,
          ...(options.target === undefined ? {} : { target: options.target }),
          resolution: resolved ? (resolved.direct ? "direct" : "inherited") : "missing",
          ...(resolved ? { resolvedLocale: resolved.sourceLocale } : {}),
          status: resolved ? (state?.status ?? "untracked") : "missing",
          reviewed:
            !!resolved &&
            source !== undefined &&
            state?.status === "reviewed" &&
            issues.length === 0,
          sourceAvailable: source !== undefined,
          reviewRequired: locale !== options.sourceLocale,
          stale,
          issues,
        });
      }
    };
    addGroup(message);
    message.overrides?.forEach((override) => addGroup(override, override.key));
  }
  return evaluateReadinessGates(entries, options.gates);
}

export interface ReadinessProjectOptions extends TranslationSelectionOptions, ReadinessGates {}

export async function reportProjectReadiness(
  projectConfig: ProjectConfig,
  datasource: Datasource,
  options: ReadinessProjectOptions = {},
) {
  const { locales, scopes } = await readTranslationSelection(datasource, options);
  return evaluateReadinessGates(
    scopes.flatMap(
      (scope) =>
        reportTranslationReadiness(scope.messages, locales, {
          sourceLocale: projectConfig.sourceLocale,
          localeKeys: scope.localeKeys.filter(
            (locale) => options.locale !== undefined || locale !== projectConfig.sourceLocale,
          ),
          target: scope.target,
        }).entries,
    ),
    options,
  );
}

export const readinessPlugin: Plugin = {
  command: "readiness",
  handler: async ({ projectConfig, datasource, parsed }) => {
    const results = [];
    for (const execution of await getProjectSetExecutions(projectConfig, datasource, parsed.set))
      results.push({
        set: execution.set,
        ...(await reportProjectReadiness(
          execution.projectConfig,
          execution.datasource,
          parsed as ReadinessProjectOptions,
        )),
      });
    if (parsed.json)
      console.log(JSON.stringify(results.length === 1 ? results[0] : results, null, 2));
    else
      for (const report of results) {
        console.log(
          `Readiness${report.set ? ` (${report.set})` : ""}: ${report.passed ? "PASS" : "FAIL"}`,
        );
        console.log(
          `${report.summary.total} translations: ${report.summary.direct} direct, ${report.summary.inherited} inherited, ${report.summary.missing} missing, ${report.summary.reviewed} reviewed, ${report.summary.stale} stale.`,
        );
        if (report.failures.length) console.log(`Failed gates: ${report.failures.join(", ")}`);
      }
    return results.every((report) => report.passed);
  },
  examples: [
    {
      command: "readiness --requireReviewed --json",
      description: "report translation readiness and enforce review gates",
    },
  ],
};
