import { spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import type { GroupSegment, Locale, Message, Segment, TranslationState } from "@messagevisor/types";

import type { Plugin } from "../cli";
import { getProjectConfig, type ProjectConfig } from "../config";
import { Datasource } from "../datasource";
import { MessagevisorCLIError } from "../error";
import { resolveLocaleValue } from "../localeResolution";

const tar: any = require("tar");

export type MessageDiffKind = "added" | "removed" | "modified" | "workflow";

export interface MessageDiffChange {
  set?: string;
  message: string;
  override?: string;
  locale: string;
  kind: MessageDiffKind;
  before?: string;
  after?: string;
  beforeState?: TranslationState;
  afterState?: TranslationState;
}

export type MessageRoutingDiffKind =
  | "override_added"
  | "override_removed"
  | "override_order"
  | "conditions"
  | "segments"
  | "segment_definition"
  | "deprecation";

export interface MessageRoutingDiffChange {
  set?: string;
  message: string;
  override?: string;
  segment?: string;
  kind: MessageRoutingDiffKind;
  before?: unknown;
  after?: unknown;
}

export interface ResolvedMessageDiffChange {
  set?: string;
  message: string;
  override?: string;
  locale: string;
  kind: Exclude<MessageDiffKind, "workflow">;
  before?: string;
  after?: string;
  beforeSourceLocale?: string;
  afterSourceLocale?: string;
}

export interface MessageDiffResult {
  from: string;
  to: string;
  changes: MessageDiffChange[];
  routingChanges: MessageRoutingDiffChange[];
  resolvedChanges?: ResolvedMessageDiffChange[];
  summary: Record<MessageDiffKind, number> & { total: number };
}

interface ProjectView {
  config: ProjectConfig;
  datasource: Datasource;
  cleanup?: () => Promise<void>;
}

interface DiffProjectOptions {
  rootDirectoryPath: string;
  projectConfig: ProjectConfig;
  datasource: Datasource;
  from?: string;
  to?: string;
  sets?: string[];
  resolved?: boolean;
}

function toArray(value: unknown): string[] {
  if (typeof value === "undefined") return [];
  return (Array.isArray(value) ? value : [value]).map(String);
}

async function run(
  command: string,
  args: string[],
  cwd: string,
  options: { allowFailure?: boolean } = {},
) {
  return new Promise<{ stdout: string; stderr: string; code: number }>((resolve, reject) => {
    const child = spawn(command, args, { cwd });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => (stdout += String(chunk)));
    child.stderr.on("data", (chunk) => (stderr += String(chunk)));
    child.on("error", reject);
    child.on("close", (code) => {
      const result = { stdout: stdout.trim(), stderr: stderr.trim(), code: code || 0 };
      if (result.code !== 0 && !options.allowFailure) {
        reject(new MessagevisorCLIError(result.stderr || `${command} exited with code ${code}.`));
        return;
      }
      resolve(result);
    });
  });
}

async function getGitRoot(rootDirectoryPath: string) {
  const result = await run("git", ["rev-parse", "--show-toplevel"], rootDirectoryPath);
  return result.stdout;
}

async function refExists(gitRoot: string, ref: string) {
  return (
    (
      await run("git", ["rev-parse", "--verify", `${ref}^{commit}`], gitRoot, {
        allowFailure: true,
      })
    ).code === 0
  );
}

async function isShallowRepository(gitRoot: string) {
  const result = await run("git", ["rev-parse", "--is-shallow-repository"], gitRoot, {
    allowFailure: true,
  });
  return result.stdout === "true";
}

async function getDefaultBranchRef(gitRoot: string) {
  for (const ref of ["main", "master", "origin/main", "origin/master"]) {
    if (await refExists(gitRoot, ref)) return ref;
  }

  throw new MessagevisorCLIError(
    "Could not find a default main or master branch. Pass --from=<branch-or-ref>.",
  );
}

async function hasProjectChanges(gitRoot: string, projectRelativePath: string) {
  const pathspec = projectRelativePath === "" ? "." : projectRelativePath;
  const result = await run(
    "git",
    ["status", "--porcelain", "--untracked-files=all", "--", pathspec],
    gitRoot,
  );
  return result.stdout.length > 0;
}

async function writeGitArchive(gitRoot: string, ref: string, outputPath: string) {
  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const child = spawn("git", ["archive", "--format=tar", ref], { cwd: gitRoot });
    let stderr = "";
    let childClosed = false;
    let outputClosed = false;

    function finish() {
      if (childClosed && outputClosed) resolve();
    }

    child.stderr.on("data", (chunk) => (stderr += String(chunk)));
    child.on("error", reject);
    output.on("error", reject);
    output.on("close", () => {
      outputClosed = true;
      finish();
    });
    child.stdout.pipe(output);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new MessagevisorCLIError(stderr.trim() || `Unable to read Git ref "${ref}".`));
        return;
      }
      childClosed = true;
      finish();
    });
  });
}

async function linkNodeModules(source: string, destination: string) {
  try {
    await fs.promises.access(source);
    await fs.promises.symlink(source, destination, "dir");
  } catch (error: any) {
    if (error?.code !== "ENOENT" && error?.code !== "EEXIST") throw error;
  }
}

async function createGitProjectView(
  gitRoot: string,
  projectRelativePath: string,
  ref: string,
): Promise<ProjectView> {
  if (!(await refExists(gitRoot, ref))) {
    const shallowHint = (await isShallowRepository(gitRoot))
      ? " This is a shallow checkout; fetch the required ref and history first (for GitHub Actions, use checkout with fetch-depth: 0)."
      : "";
    throw new MessagevisorCLIError(
      `Git branch or ref "${ref}" is not available in this checkout.${shallowHint}`,
    );
  }

  const tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-diff-"));
  const archivePath = path.join(tempRoot, "project.tar");
  const checkoutPath = path.join(tempRoot, "checkout");
  await fs.promises.mkdir(checkoutPath);

  try {
    await writeGitArchive(gitRoot, ref, archivePath);
    await tar.x({ file: archivePath, cwd: checkoutPath });
    await linkNodeModules(
      path.join(gitRoot, "node_modules"),
      path.join(checkoutPath, "node_modules"),
    );

    const projectPath = path.join(checkoutPath, projectRelativePath);
    const currentProjectPath = path.join(gitRoot, projectRelativePath);
    if (projectRelativePath) {
      await linkNodeModules(
        path.join(currentProjectPath, "node_modules"),
        path.join(projectPath, "node_modules"),
      );
    }

    if (!fs.existsSync(path.join(projectPath, "messagevisor.config.js"))) {
      throw new MessagevisorCLIError(`Messagevisor project does not exist at Git ref "${ref}".`);
    }
    const config = getProjectConfig(projectPath);
    return {
      config,
      datasource: new Datasource(config, projectPath),
      cleanup: () => fs.promises.rm(tempRoot, { recursive: true, force: true }),
    };
  } catch (error) {
    await fs.promises.rm(tempRoot, { recursive: true, force: true });
    throw error;
  }
}

async function getSetKeys(view: ProjectView) {
  return view.config.sets ? view.datasource.listSets() : Promise.resolve([""]);
}

async function readMessages(view: ProjectView, set: string) {
  const datasource = set ? view.datasource.forSet(set) : view.datasource;
  const messages = new Map<string, Message>();
  for (const key of await datasource.listMessages())
    messages.set(key, await datasource.readMessage(key));
  return messages;
}

async function readLocales(view: ProjectView, set: string) {
  const datasource = set ? view.datasource.forSet(set) : view.datasource;
  const locales: Record<string, Locale> = {};
  for (const key of await datasource.listLocales()) locales[key] = await datasource.readLocale(key);
  return locales;
}

async function readSegments(view: ProjectView, set: string) {
  const datasource = set ? view.datasource.forSet(set) : view.datasource;
  const segments = new Map<string, Segment>();
  for (const key of await datasource.listSegments())
    segments.set(key, await datasource.readSegment(key));
  return segments;
}

function equalState(a?: TranslationState, b?: TranslationState) {
  return a?.status === b?.status && a?.sourceHash === b?.sourceHash;
}

function addTranslationChanges(
  changes: MessageDiffChange[],
  identity: { set?: string; message: string; override?: string },
  beforeTranslations: Record<string, string> = {},
  afterTranslations: Record<string, string> = {},
  beforeStates: Partial<Record<string, TranslationState>> = {},
  afterStates: Partial<Record<string, TranslationState>> = {},
) {
  const locales = Array.from(
    new Set([
      ...Object.keys(beforeTranslations),
      ...Object.keys(afterTranslations),
      ...Object.keys(beforeStates),
      ...Object.keys(afterStates),
    ]),
  ).sort();

  for (const locale of locales) {
    const before = beforeTranslations[locale];
    const after = afterTranslations[locale];
    const beforeState = beforeStates[locale];
    const afterState = afterStates[locale];
    if (before === after && equalState(beforeState, afterState)) continue;

    const kind: MessageDiffKind =
      before === after
        ? "workflow"
        : typeof before === "undefined"
          ? "added"
          : typeof after === "undefined"
            ? "removed"
            : "modified";
    changes.push({
      ...identity,
      locale,
      kind,
      ...(typeof before === "undefined" ? {} : { before }),
      ...(typeof after === "undefined" ? {} : { after }),
      ...(beforeState ? { beforeState } : {}),
      ...(afterState ? { afterState } : {}),
    });
  }
}

function collectReferencedSegmentKeys(
  expression: GroupSegment | GroupSegment[] | "*" | undefined,
  result = new Set<string>(),
) {
  if (!expression || expression === "*") return result;
  if (typeof expression === "string") {
    const trimmed = expression.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        return collectReferencedSegmentKeys(JSON.parse(trimmed), result);
      } catch {
        // Treat invalid/string segment expressions as authored segment keys.
      }
    }
    result.add(expression);
    return result;
  }
  if (Array.isArray(expression)) {
    for (const child of expression) collectReferencedSegmentKeys(child, result);
    return result;
  }
  for (const operator of ["and", "or", "not"] as const) {
    const children = (expression as unknown as Record<string, GroupSegment[]>)[operator];
    if (children) {
      for (const child of children) collectReferencedSegmentKeys(child, result);
    }
  }
  return result;
}

function compareMessage(
  changes: MessageDiffChange[],
  routingChanges: MessageRoutingDiffChange[],
  set: string,
  messageKey: string,
  before?: Message,
  after?: Message,
  changedSegments: Set<string> = new Set(),
  beforeSegments: Map<string, Segment> = new Map(),
  afterSegments: Map<string, Segment> = new Map(),
) {
  const identity = { ...(set ? { set } : {}), message: messageKey };
  addTranslationChanges(
    changes,
    identity,
    before?.translations,
    after?.translations,
    before?.translationStates,
    after?.translationStates,
  );

  const beforeDeprecation = {
    deprecated: before?.deprecated,
    deprecationWarning: before?.deprecationWarning,
  };
  const afterDeprecation = {
    deprecated: after?.deprecated,
    deprecationWarning: after?.deprecationWarning,
  };
  if (canonicalJson(beforeDeprecation) !== canonicalJson(afterDeprecation)) {
    routingChanges.push({
      ...identity,
      kind: "deprecation",
      before: beforeDeprecation,
      after: afterDeprecation,
    });
  }

  const beforeOverrides = new Map(
    (before?.overrides || []).map((override) => [override.key, override]),
  );
  const afterOverrides = new Map(
    (after?.overrides || []).map((override) => [override.key, override]),
  );
  const overrideKeys = Array.from(
    new Set([...Array.from(beforeOverrides.keys()), ...Array.from(afterOverrides.keys())]),
  ).sort();

  const beforeOrder = (before?.overrides || []).map(({ key }) => key);
  const afterOrder = (after?.overrides || []).map(({ key }) => key);
  const commonKeys = new Set(beforeOrder.filter((key) => afterOverrides.has(key)));
  const beforeCommonOrder = beforeOrder.filter((key) => commonKeys.has(key));
  const afterCommonOrder = afterOrder.filter((key) => commonKeys.has(key));
  if (JSON.stringify(beforeCommonOrder) !== JSON.stringify(afterCommonOrder)) {
    routingChanges.push({
      ...identity,
      kind: "override_order",
      before: beforeCommonOrder,
      after: afterCommonOrder,
    });
  }

  for (const override of overrideKeys) {
    const beforeOverride = beforeOverrides.get(override);
    const afterOverride = afterOverrides.get(override);
    if (!beforeOverride || !afterOverride) {
      routingChanges.push({
        ...identity,
        override,
        kind: beforeOverride ? "override_removed" : "override_added",
      });
    } else {
      for (const field of ["conditions", "segments"] as const) {
        if (canonicalJson(beforeOverride[field]) !== canonicalJson(afterOverride[field])) {
          routingChanges.push({
            ...identity,
            override,
            kind: field,
            before: beforeOverride[field],
            after: afterOverride[field],
          });
        }
      }
    }

    const referencedSegments = new Set([
      ...Array.from(collectReferencedSegmentKeys(beforeOverride?.segments)),
      ...Array.from(collectReferencedSegmentKeys(afterOverride?.segments)),
    ]);
    for (const segment of Array.from(referencedSegments).sort()) {
      if (!changedSegments.has(segment)) continue;
      routingChanges.push({
        ...identity,
        override,
        segment,
        kind: "segment_definition",
        before: beforeSegments.get(segment),
        after: afterSegments.get(segment),
      });
    }
    addTranslationChanges(
      changes,
      { ...identity, override },
      beforeOverride?.translations,
      afterOverride?.translations,
      beforeOverride?.translationStates,
      afterOverride?.translationStates,
    );
  }
}

function canonicalJson(value: unknown): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return canonicalJson(JSON.parse(trimmed));
    } catch {
      // Segment keys and non-JSON strings are compared as authored values.
    }
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map(
        (key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`,
      )
      .join(",")}}`;
  }
  return typeof value === "undefined" ? "undefined" : JSON.stringify(value);
}

function addResolvedTranslationChanges(
  changes: ResolvedMessageDiffChange[],
  identity: { set?: string; message: string; override?: string },
  beforeTranslations: Record<string, string> | undefined,
  afterTranslations: Record<string, string> | undefined,
  beforeLocales: Record<string, Locale>,
  afterLocales: Record<string, Locale>,
) {
  const localeKeys = Array.from(
    new Set([...Object.keys(beforeLocales), ...Object.keys(afterLocales)]),
  ).sort();
  for (const locale of localeKeys) {
    const before = resolveLocaleValue(beforeTranslations, locale, beforeLocales);
    const after = resolveLocaleValue(afterTranslations, locale, afterLocales);
    if (before?.value === after?.value) continue;
    changes.push({
      ...identity,
      locale,
      kind: !before ? "added" : !after ? "removed" : "modified",
      ...(before ? { before: before.value, beforeSourceLocale: before.sourceLocale } : {}),
      ...(after ? { after: after.value, afterSourceLocale: after.sourceLocale } : {}),
    });
  }
}

function compareResolvedMessage(
  changes: ResolvedMessageDiffChange[],
  set: string,
  messageKey: string,
  beforeLocales: Record<string, Locale>,
  afterLocales: Record<string, Locale>,
  before?: Message,
  after?: Message,
) {
  const identity = { ...(set ? { set } : {}), message: messageKey };
  addResolvedTranslationChanges(
    changes,
    identity,
    before?.translations,
    after?.translations,
    beforeLocales,
    afterLocales,
  );
  const beforeOverrides = new Map(
    (before?.overrides || []).map((override) => [override.key, override]),
  );
  const afterOverrides = new Map(
    (after?.overrides || []).map((override) => [override.key, override]),
  );
  for (const override of Array.from(
    new Set([...Array.from(beforeOverrides.keys()), ...Array.from(afterOverrides.keys())]),
  ).sort()) {
    addResolvedTranslationChanges(
      changes,
      { ...identity, override },
      beforeOverrides.get(override)?.translations,
      afterOverrides.get(override)?.translations,
      beforeLocales,
      afterLocales,
    );
  }
}

export async function diffProject(options: DiffProjectOptions): Promise<MessageDiffResult> {
  const projectRoot = await fs.promises.realpath(options.rootDirectoryPath);
  const gitRoot = await fs.promises.realpath(await getGitRoot(projectRoot));
  const projectRelativePath = path.relative(gitRoot, projectRoot);
  if (projectRelativePath.startsWith("..") || path.isAbsolute(projectRelativePath)) {
    throw new MessagevisorCLIError("The Messagevisor project must be inside its Git repository.");
  }

  const dirty = await hasProjectChanges(gitRoot, projectRelativePath);
  const from = options.from || (dirty ? "HEAD" : await getDefaultBranchRef(gitRoot));
  const to = options.to || "working-tree";
  const currentView: ProjectView = {
    config: options.projectConfig,
    datasource: options.datasource,
  };
  const fromView =
    from === "working-tree"
      ? currentView
      : await createGitProjectView(gitRoot, projectRelativePath, from);
  const toView =
    to === "working-tree"
      ? currentView
      : await createGitProjectView(gitRoot, projectRelativePath, to);

  try {
    const fromSets = await getSetKeys(fromView);
    const toSets = await getSetKeys(toView);
    const availableSets = Array.from(new Set([...fromSets, ...toSets])).sort();
    const sets = options.sets?.length ? options.sets : availableSets;
    const unknownSets = sets.filter((set) => !availableSets.includes(set));
    if (unknownSets.length) {
      throw new MessagevisorCLIError(
        `Unknown set${unknownSets.length === 1 ? "" : "s"}: ${unknownSets.join(", ")}.`,
      );
    }

    const changes: MessageDiffChange[] = [];
    const routingChanges: MessageRoutingDiffChange[] = [];
    const resolvedChanges: ResolvedMessageDiffChange[] = [];
    for (const set of sets) {
      const beforeMessages = fromSets.includes(set)
        ? await readMessages(fromView, set)
        : new Map<string, Message>();
      const afterMessages = toSets.includes(set)
        ? await readMessages(toView, set)
        : new Map<string, Message>();
      const beforeLocales =
        options.resolved && fromSets.includes(set) ? await readLocales(fromView, set) : {};
      const afterLocales =
        options.resolved && toSets.includes(set) ? await readLocales(toView, set) : {};
      const beforeSegments = fromSets.includes(set)
        ? await readSegments(fromView, set)
        : new Map<string, Segment>();
      const afterSegments = toSets.includes(set)
        ? await readSegments(toView, set)
        : new Map<string, Segment>();
      const segmentKeys = new Set([
        ...Array.from(beforeSegments.keys()),
        ...Array.from(afterSegments.keys()),
      ]);
      const changedSegments = new Set(
        Array.from(segmentKeys).filter(
          (key) => canonicalJson(beforeSegments.get(key)) !== canonicalJson(afterSegments.get(key)),
        ),
      );
      const messageKeys = Array.from(
        new Set([...Array.from(beforeMessages.keys()), ...Array.from(afterMessages.keys())]),
      ).sort();
      for (const key of messageKeys) {
        compareMessage(
          changes,
          routingChanges,
          set,
          key,
          beforeMessages.get(key),
          afterMessages.get(key),
          changedSegments,
          beforeSegments,
          afterSegments,
        );
        if (options.resolved) {
          compareResolvedMessage(
            resolvedChanges,
            set,
            key,
            beforeLocales,
            afterLocales,
            beforeMessages.get(key),
            afterMessages.get(key),
          );
        }
      }
    }

    const summary = { added: 0, removed: 0, modified: 0, workflow: 0, total: changes.length };
    for (const change of changes) summary[change.kind] += 1;
    return {
      from,
      to,
      changes,
      routingChanges,
      ...(options.resolved ? { resolvedChanges } : {}),
      summary,
    };
  } finally {
    if (fromView !== currentView) await fromView.cleanup?.();
    if (toView !== currentView && toView !== fromView) await toView.cleanup?.();
  }
}

function escapeMarkdown(value: string | undefined) {
  if (typeof value === "undefined") return "—";
  return value.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}

function stateLabel(state?: TranslationState) {
  if (!state) return "—";
  return state.sourceHash ? `${state.status} (${state.sourceHash})` : state.status;
}

export function formatMessageDiffMarkdown(result: MessageDiffResult) {
  const lines = [
    `# Messagevisor copy diff`,
    "",
    `Comparing \`${result.from}\` → \`${result.to}\`.`,
    "",
  ];
  if (result.changes.length) {
    lines.push(
      "## Authored copy",
      "",
      "| Set | Message | Override | Locale | Change | Before | After | Workflow |",
      "| --- | --- | --- | --- | --- | --- | --- | --- |",
    );
    for (const change of result.changes) {
      lines.push(
        `| ${escapeMarkdown(change.set)} | ${escapeMarkdown(change.message)} | ${escapeMarkdown(change.override)} | ${escapeMarkdown(change.locale)} | ${change.kind} | ${escapeMarkdown(change.before)} | ${escapeMarkdown(change.after)} | ${escapeMarkdown(stateLabel(change.beforeState))} → ${escapeMarkdown(stateLabel(change.afterState))} |`,
      );
    }
    lines.push("");
  }
  if (result.routingChanges.length) {
    lines.push(
      "## Override routing",
      "",
      "| Set | Message | Override | Segment | Change | Before | After |",
      "| --- | --- | --- | --- | --- | --- | --- |",
    );
    for (const change of result.routingChanges) {
      lines.push(
        `| ${escapeMarkdown(change.set)} | ${escapeMarkdown(change.message)} | ${escapeMarkdown(change.override)} | ${escapeMarkdown(change.segment)} | ${change.kind} | ${escapeMarkdown(renderValue(change.before))} | ${escapeMarkdown(renderValue(change.after))} |`,
      );
    }
    lines.push("");
  }
  if (result.resolvedChanges) {
    lines.push(
      "## Resolved copy",
      "",
      ...(result.resolvedChanges.length
        ? [
            "| Set | Message | Override | Locale | Change | Before | After |",
            "| --- | --- | --- | --- | --- | --- | --- |",
            ...result.resolvedChanges.map(
              (change) =>
                `| ${escapeMarkdown(change.set)} | ${escapeMarkdown(change.message)} | ${escapeMarkdown(change.override)} | ${escapeMarkdown(change.locale)} | ${change.kind} | ${escapeMarkdown(resolvedValue(change.before, change.beforeSourceLocale))} | ${escapeMarkdown(resolvedValue(change.after, change.afterSourceLocale))} |`,
            ),
          ]
        : ["No resolved copy changes."]),
      "",
    );
  }
  if (!result.changes.length && !result.routingChanges.length && !result.resolvedChanges?.length)
    lines.push("No authored copy, workflow, override routing, or resolved copy changes.", "");
  return `${lines.join("\n")}\n`;
}

function renderValue(value: unknown) {
  return typeof value === "undefined" ? undefined : JSON.stringify(value);
}

function resolvedValue(value: string | undefined, sourceLocale: string | undefined) {
  return typeof value === "undefined" ? undefined : `${value} (${sourceLocale})`;
}

export function formatMessageDiffTerminal(result: MessageDiffResult) {
  const lines = [`Comparing ${result.from} → ${result.to}`, ""];
  for (const change of result.changes) {
    const location = [
      change.set ? `[${change.set}]` : "",
      change.message,
      change.override ? `override:${change.override}` : "base",
      change.locale,
    ]
      .filter(Boolean)
      .join(" · ");
    lines.push(`${change.kind.toUpperCase()} ${location}`);
    if (change.kind !== "workflow") {
      lines.push(`- ${typeof change.before === "undefined" ? "∅" : change.before}`);
      lines.push(`+ ${typeof change.after === "undefined" ? "∅" : change.after}`);
    }
    if (!equalState(change.beforeState, change.afterState)) {
      lines.push(
        `  workflow: ${stateLabel(change.beforeState)} → ${stateLabel(change.afterState)}`,
      );
    }
    lines.push("");
  }
  for (const change of result.routingChanges) {
    const location = [
      change.set ? `[${change.set}]` : "",
      change.message,
      change.override,
      change.segment ? `segment:${change.segment}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    lines.push(`ROUTING ${location} · ${change.kind}`);
    if (typeof change.before !== "undefined") lines.push(`- ${renderValue(change.before)}`);
    if (typeof change.after !== "undefined") lines.push(`+ ${renderValue(change.after)}`);
    lines.push("");
  }
  for (const change of result.resolvedChanges || []) {
    const location = [
      change.set ? `[${change.set}]` : "",
      change.message,
      change.override ? `override:${change.override}` : "base",
      change.locale,
    ]
      .filter(Boolean)
      .join(" · ");
    lines.push(`RESOLVED ${change.kind.toUpperCase()} ${location}`);
    lines.push(`- ${resolvedValue(change.before, change.beforeSourceLocale) || "∅"}`);
    lines.push(`+ ${resolvedValue(change.after, change.afterSourceLocale) || "∅"}`, "");
  }
  if (!result.changes.length && !result.routingChanges.length && !result.resolvedChanges?.length) {
    lines.push("No authored copy, workflow, override routing, or resolved copy changes.", "");
  }
  lines.push(
    `${result.summary.total} authored change${result.summary.total === 1 ? "" : "s"}: ${result.summary.added} added, ${result.summary.removed} removed, ${result.summary.modified} modified, ${result.summary.workflow} workflow`,
    `${result.routingChanges.length} override routing change${result.routingChanges.length === 1 ? "" : "s"}`,
    ...(result.resolvedChanges
      ? [
          `${result.resolvedChanges.length} resolved copy change${result.resolvedChanges.length === 1 ? "" : "s"}`,
        ]
      : []),
  );
  return `${lines.join("\n")}\n`;
}

export const diffPlugin: Plugin = {
  command: "diff",
  async handler({ rootDirectoryPath, projectConfig, datasource, parsed }) {
    const format = parsed.json ? "json" : parsed.format || "terminal";
    if (!["terminal", "markdown", "json"].includes(format)) {
      throw new MessagevisorCLIError("Invalid --format. Use terminal, markdown, or json.");
    }
    const result = await diffProject({
      rootDirectoryPath,
      projectConfig,
      datasource,
      from: parsed.from,
      to: parsed.to,
      sets: toArray(parsed.set),
      resolved: parsed.resolved === true,
    });
    console.log(
      format === "json"
        ? JSON.stringify(result, null, parsed.pretty ? 2 : 0)
        : format === "markdown"
          ? formatMessageDiffMarkdown(result).trimEnd()
          : formatMessageDiffTerminal(result).trimEnd(),
    );
  },
  examples: [
    { command: "diff", description: "review copy changes against Git" },
    {
      command: "diff --from=main --format=markdown",
      description: "render a PR-friendly copy diff",
    },
    { command: "diff --from=release --to=feature", description: "compare two branches or refs" },
    { command: "diff --resolved", description: "include inherited resolved-copy impact" },
  ],
};
