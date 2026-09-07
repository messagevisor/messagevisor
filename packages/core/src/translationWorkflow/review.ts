import type { Message, TranslationState, TranslationStatus } from "@messagevisor/types";
import { createHash } from "crypto";
import * as fs from "fs";
import * as path from "path";
import type { ProjectConfig } from "../config";
import type { Plugin } from "../cli";
import type { Datasource } from "../datasource";
import type { EntityMutation } from "../datasource/adapter";
import { MessagevisorCLIError } from "../error";
import { getProjectSetExecutions } from "../sets";
import { applyTranslationMutations, type TranslationGroup } from "./index";
import { readTranslationSelection, type TranslationSelectionOptions } from "./selection";
import { resolveLocaleValue } from "../localeResolution";

export interface ReviewProjectOptions extends TranslationSelectionOptions {
  status?: TranslationStatus;
  /** Omitted selects base copy and every override; explicit keys select overrides only. */
  override?: string | string[];
  apply?: boolean;
  input?: string;
  output?: string;
}

export interface ReviewPreview {
  version: 1;
  token: string;
  options: ReviewProjectOptions;
  context: string;
  status: TranslationStatus;
  mutations: EntityMutation[];
  entries: Array<{
    messageKey: string;
    overrideKey?: string;
    locale: string;
    sourceLocale?: string;
    resolvedSourceLocale?: string;
    source?: string;
    target: string;
    before?: TranslationState;
    after?: TranslationState;
  }>;
}

function fingerprint(value: unknown): string {
  return createHash("sha256")
    .update(
      JSON.stringify(value, (_key, entry) =>
        entry && typeof entry === "object" && !Array.isArray(entry)
          ? Object.fromEntries(
              Object.keys(entry)
                .sort()
                .map((key) => [key, entry[key]]),
            )
          : entry,
      ),
    )
    .digest("hex");
}

const selectionKeys = [
  "status",
  "locale",
  "target",
  "includeMessages",
  "excludeMessages",
  "override",
] as const;
function reviewOptions(options: ReviewProjectOptions): ReviewProjectOptions {
  return Object.fromEntries(
    selectionKeys.filter((key) => options[key] !== undefined).map((key) => [key, options[key]]),
  );
}

function conflict(): never {
  throw new MessagevisorCLIError(
    "Entity conflict: the saved review preview no longer matches this project. Create and inspect a new preview.",
    { code: "review_preview_conflict" },
  );
}

export async function previewTranslationReview(
  projectConfig: ProjectConfig,
  datasource: Datasource,
  options: ReviewProjectOptions = {},
): Promise<ReviewPreview> {
  options = reviewOptions(options);
  const status = options.status ?? "reviewed";
  if (!["draft", "translated", "reviewed"].includes(status))
    throw new MessagevisorCLIError("status must be draft, translated or reviewed.", {
      code: "invalid_review_status",
    });
  if (status === "reviewed" && !projectConfig.sourceLocale)
    throw new MessagevisorCLIError("Review requires sourceLocale in project configuration.", {
      code: "review_source_unavailable",
    });
  const { locales, scopes } = await readTranslationSelection(datasource, options);
  const selected = new Map<string, Map<string, Set<string>>>();
  for (const scope of scopes)
    for (const key of Object.keys(scope.messages)) {
      const groups = selected.get(key) || new Map<string, Set<string>>();
      for (const groupKey of [
        "",
        ...(scope.messages[key].overrides || []).map((override) => override.key),
      ]) {
        const selectedLocales = groups.get(groupKey) || new Set<string>();
        scope.localeKeys.forEach((locale) => {
          if (options.locale !== undefined || locale !== projectConfig.sourceLocale)
            selectedLocales.add(locale);
        });
        groups.set(groupKey, selectedLocales);
      }
      selected.set(key, groups);
    }
  const overrideKeys =
    options.override === undefined
      ? undefined
      : new Set(Array.isArray(options.override) ? options.override : [options.override]);
  const foundOverrides = new Set<string>();
  const mutations: EntityMutation[] = [];
  const entries: ReviewPreview["entries"] = [];
  for (const [messageKey, groups] of [...selected].sort(([a], [b]) => a.localeCompare(b))) {
    const document = await datasource.readEntityDocument<Message>("message", messageKey);
    const message = document.entity;
    const update = <T extends TranslationGroup>(group: T, overrideKey?: string): T => {
      const operations = [...(groups.get(overrideKey ?? "") || [])]
        .sort()
        .filter((locale) => Object.hasOwn(group.translations, locale))
        .map((locale) => ({ locale, status }));
      if (!operations.length) return group;
      const result = applyTranslationMutations(group, operations, {
        sourceLocale: projectConfig.sourceLocale,
        locales,
      });
      for (const { locale } of operations)
        if (
          JSON.stringify(group.translationStates?.[locale]) !==
          JSON.stringify(result.translationStates?.[locale])
        )
          entries.push({
            messageKey,
            ...(overrideKey === undefined ? {} : { overrideKey }),
            locale,
            sourceLocale: projectConfig.sourceLocale,
            resolvedSourceLocale: projectConfig.sourceLocale
              ? resolveLocaleValue(group.translations, projectConfig.sourceLocale, locales)
                  ?.sourceLocale
              : undefined,
            source: projectConfig.sourceLocale
              ? resolveLocaleValue(group.translations, projectConfig.sourceLocale, locales)?.value
              : undefined,
            target: group.translations[locale],
            before: group.translationStates?.[locale],
            after: result.translationStates?.[locale],
          });
      return result;
    };
    let result = overrideKeys === undefined ? update(message) : { ...message };
    if (message.overrides)
      result = {
        ...result,
        overrides: message.overrides.map((override) => {
          if (overrideKeys !== undefined && !overrideKeys.has(override.key)) return override;
          if (!groups.has(override.key)) return override;
          foundOverrides.add(override.key);
          return update(override, override.key);
        }),
      };
    if (JSON.stringify(result) !== JSON.stringify(message))
      mutations.push({
        operation: "write",
        type: "message",
        key: messageKey,
        entity: result,
        expectedVersion: document.version,
      });
  }
  for (const key of overrideKeys || [])
    if (!foundOverrides.has(key))
      throw new MessagevisorCLIError(`Unknown selected override "${key}".`, {
        code: "unknown_override",
      });
  await datasource.applyEntityMutations(mutations, { dryRun: true });
  const content = {
    version: 1 as const,
    options,
    context: fingerprint({
      directory: projectConfig.messagesDirectoryPath,
      set: datasource.getSet(),
      sourceLocale: projectConfig.sourceLocale,
      locales,
      scopes,
    }),
    status,
    mutations,
    entries,
  };
  return { ...content, token: fingerprint(content) };
}

/**
 * Validate saved copy, selection, locale inheritance and versions before applying.
 * The token is a content checksum, not a signature or an authorisation credential.
 * Message writes are atomic per set; concurrent locale graph edits are not part
 * of that transaction and must be coordinated by callers.
 */
export async function validateTranslationReview(datasource: Datasource, preview: ReviewPreview) {
  if (
    !preview ||
    preview.version !== 1 ||
    !preview.options ||
    Array.isArray(preview.options) ||
    typeof preview.options !== "object" ||
    typeof preview.token !== "string" ||
    selectionKeys.some((key) => {
      const value = preview.options[key];
      return (
        value !== undefined &&
        typeof value !== "string" &&
        (key === "status" ||
          !Array.isArray(value) ||
          value.some((item) => typeof item !== "string"))
      );
    })
  )
    conflict();
  const { token, ...content } = preview;
  if (fingerprint(content) !== token) conflict();
  const current = await previewTranslationReview(
    datasource.getConfig(),
    datasource,
    preview.options,
  );
  if (current.token !== token) conflict();
  return current;
}

export async function applyTranslationReview(datasource: Datasource, preview: ReviewPreview) {
  const current = await validateTranslationReview(datasource, preview);
  // Never execute mutations taken directly from an input file.
  return datasource.applyEntityMutations(current.mutations);
}

interface ReviewFile {
  version: 1;
  token: string;
  previews: Array<{ set: string; preview: ReviewPreview }>;
}

async function readReviewFile(file: string): Promise<ReviewFile> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of fs.createReadStream(file)) {
    size += chunk.length;
    if (size > 64 * 1024 * 1024)
      throw new MessagevisorCLIError("Review preview exceeds the 64 MiB input limit.", {
        code: "invalid_review_preview",
      });
    chunks.push(chunk);
  }
  try {
    const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (
      input?.version !== 1 ||
      typeof input.token !== "string" ||
      !Array.isArray(input.previews) ||
      !input.previews.length ||
      input.previews.some(
        (entry: any) => !entry || typeof entry.set !== "string" || !entry.preview,
      ) ||
      new Set(input.previews.map((entry: any) => entry.set)).size !== input.previews.length
    )
      throw new Error("Invalid preview envelope");
    const { token, ...content } = input;
    if (fingerprint(content) !== token) throw new Error("Modified preview envelope");
    return input;
  } catch {
    throw new MessagevisorCLIError("Invalid saved review preview.", {
      code: "invalid_review_preview",
    });
  }
}

export const reviewPlugin: Plugin = {
  command: "review",
  handler: async ({ rootDirectoryPath, projectConfig, datasource, parsed }) => {
    if (
      parsed.apply
        ? !parsed.input ||
          parsed.output ||
          parsed.set !== undefined ||
          selectionKeys.some((key) => parsed[key] !== undefined)
        : parsed.input
    )
      throw new MessagevisorCLIError(
        "Save a preview with review --output=<file>, then use review --apply --input=<file> without selection or status options.",
        { code: "invalid_review_options" },
      );
    const filePath = (file: string) => path.resolve(rootDirectoryPath, file);
    const input = parsed.apply ? await readReviewFile(filePath(parsed.input)) : undefined;
    const executions = input
      ? await Promise.all(
          input.previews.map(async ({ set }) => {
            if (projectConfig.sets && !set) conflict();
            const selected = await getProjectSetExecutions(
              projectConfig,
              datasource,
              set || undefined,
            );
            if (selected.length !== 1 || selected[0].set !== set) conflict();
            return selected[0];
          }),
        )
      : await getProjectSetExecutions(projectConfig, datasource, parsed.set);
    const previews = [];
    for (const execution of executions)
      previews.push({
        execution,
        preview: input
          ? await validateTranslationReview(
              execution.datasource,
              input.previews.find(({ set }) => set === execution.set)!.preview,
            )
          : await previewTranslationReview(
              execution.projectConfig,
              execution.datasource,
              parsed as ReviewProjectOptions,
            ),
      });
    if (parsed.output) {
      const body = {
        version: 1 as const,
        previews: previews.map(({ execution, preview }) => ({ set: execution.set, preview })),
      };
      const file: ReviewFile = { ...body, token: fingerprint(body) };
      const content = JSON.stringify(file, null, 2) + "\n";
      if (Buffer.byteLength(content) > 64 * 1024 * 1024)
        throw new MessagevisorCLIError(
          "Review preview exceeds 64 MiB. Select fewer messages or one set.",
          { code: "invalid_review_preview" },
        );
      // Exclusive creation avoids overwriting definitions or an earlier approval.
      await fs.promises.writeFile(filePath(parsed.output), content, { flag: "wx", mode: 0o600 });
    }
    const reports = [];
    for (const { execution, preview } of previews) {
      if (parsed.apply) await applyTranslationReview(execution.datasource, preview);
      reports.push({
        set: execution.set,
        apply: !!parsed.apply,
        status: preview.status,
        changedMessages: preview.mutations.length,
        token: preview.token,
        entries: preview.entries,
      });
    }
    if (parsed.json)
      console.log(JSON.stringify(reports.length === 1 ? reports[0] : reports, null, 2));
    else
      for (const report of reports) {
        console.log(
          `Review ${report.apply ? "applied" : "preview"}${report.set ? ` (${report.set})` : ""}: ${report.entries.length} translations in ${report.changedMessages} messages set to ${report.status}.`,
        );
        for (const entry of report.entries) {
          console.log(
            `${entry.messageKey}${entry.overrideKey ? ` (${entry.overrideKey})` : ""} [${entry.locale}]: ${entry.before?.status ?? "untracked"} -> ${entry.after?.status}`,
          );
          console.log(`  Source: ${JSON.stringify(entry.source ?? null)}`);
          console.log(`  Target: ${JSON.stringify(entry.target)}`);
        }
      }
    return true;
  },
  examples: [
    {
      command: "review --locale=nl --output=review.json",
      description: "save the exact Dutch copy and versions for human review",
    },
    {
      command: "review --apply --input=review.json",
      description: "apply only the saved, unchanged review preview",
    },
  ],
};
