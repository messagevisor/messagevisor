import { spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import type { Message, TranslationState } from "@messagevisor/types";

import type { Plugin } from "../cli";
import { getProjectConfig, type ProjectConfig } from "../config";
import { Datasource } from "../datasource";
import { MessagevisorCLIError } from "../error";

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

export interface MessageDiffResult {
  from: string;
  to: string;
  changes: MessageDiffChange[];
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
    throw new MessagevisorCLIError(`Unknown Git branch or ref "${ref}".`);
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

function compareMessage(
  changes: MessageDiffChange[],
  set: string,
  messageKey: string,
  before?: Message,
  after?: Message,
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

  const beforeOverrides = new Map(
    (before?.overrides || []).map((override) => [override.key, override]),
  );
  const afterOverrides = new Map(
    (after?.overrides || []).map((override) => [override.key, override]),
  );
  const overrideKeys = Array.from(
    new Set([...Array.from(beforeOverrides.keys()), ...Array.from(afterOverrides.keys())]),
  ).sort();

  for (const override of overrideKeys) {
    const beforeOverride = beforeOverrides.get(override);
    const afterOverride = afterOverrides.get(override);
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
    for (const set of sets) {
      const beforeMessages = fromSets.includes(set)
        ? await readMessages(fromView, set)
        : new Map<string, Message>();
      const afterMessages = toSets.includes(set)
        ? await readMessages(toView, set)
        : new Map<string, Message>();
      const messageKeys = Array.from(
        new Set([...Array.from(beforeMessages.keys()), ...Array.from(afterMessages.keys())]),
      ).sort();
      for (const key of messageKeys) {
        compareMessage(changes, set, key, beforeMessages.get(key), afterMessages.get(key));
      }
    }

    const summary = { added: 0, removed: 0, modified: 0, workflow: 0, total: changes.length };
    for (const change of changes) summary[change.kind] += 1;
    return { from, to, changes, summary };
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
    `Comparing \`${result.from}\` → \`${result.to}\` (${result.summary.total} change${result.summary.total === 1 ? "" : "s"}).`,
    "",
  ];
  if (!result.changes.length) return `${lines.join("\n")}No translation or workflow changes.\n`;

  lines.push(
    "| Set | Message | Override | Locale | Change | Before | After | Workflow |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
  );
  for (const change of result.changes) {
    lines.push(
      `| ${escapeMarkdown(change.set)} | ${escapeMarkdown(change.message)} | ${escapeMarkdown(change.override)} | ${escapeMarkdown(change.locale)} | ${change.kind} | ${escapeMarkdown(change.before)} | ${escapeMarkdown(change.after)} | ${escapeMarkdown(stateLabel(change.beforeState))} → ${escapeMarkdown(stateLabel(change.afterState))} |`,
    );
  }
  return `${lines.join("\n")}\n`;
}

export function formatMessageDiffTerminal(result: MessageDiffResult) {
  const lines = [`Comparing ${result.from} → ${result.to}`, ""];
  if (!result.changes.length) return `${lines.join("\n")}No translation or workflow changes.\n`;

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
  lines.push(
    `${result.summary.total} change${result.summary.total === 1 ? "" : "s"}: ${result.summary.added} added, ${result.summary.removed} removed, ${result.summary.modified} modified, ${result.summary.workflow} workflow`,
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
  ],
};
