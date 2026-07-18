import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { getProjectConfig } from "../config";
import { Datasource } from "../datasource";
import { diffProject, formatMessageDiffMarkdown, formatMessageDiffTerminal } from "./index";

async function write(root: string, relativePath: string, content: string) {
  const filePath = path.join(root, relativePath);
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, content);
}

function git(root: string, ...args: string[]) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

async function createProject() {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-diff-test-"));
  await write(root, "messagevisor.config.js", "module.exports = {};\n");
  await write(root, "locales/en.yml", "description: English\n");
  await write(
    root,
    "messages/greeting.yml",
    [
      "translations:",
      "  en: Hello",
      "translationStates:",
      "  en:",
      "    status: draft",
      "overrides:",
      "  - key: formal",
      "    conditions: '*'",
      "    translations:",
      "      en: Good day",
      "",
    ].join("\n"),
  );
  git(root, "init", "-b", "main");
  git(root, "config", "user.email", "tests@messagevisor.com");
  git(root, "config", "user.name", "Messagevisor Tests");
  git(root, "add", ".");
  git(root, "commit", "-m", "initial");
  return root;
}

function runtime(root: string) {
  const projectConfig = getProjectConfig(root);
  return {
    rootDirectoryPath: root,
    projectConfig,
    datasource: new Datasource(projectConfig, root),
  };
}

describe("diffProject", function () {
  it("compares a dirty working tree with HEAD and includes base, override, and workflow changes", async function () {
    const root = await createProject();
    await write(
      root,
      "messages/greeting.yml",
      [
        "translations:",
        "  en: Hello there",
        "  nl: Hallo",
        "translationStates:",
        "  en:",
        "    status: reviewed",
        "overrides:",
        "  - key: formal",
        "    conditions: '*'",
        "    translations:",
        "      en: Greetings",
        "",
      ].join("\n"),
    );

    const result = await diffProject(runtime(root));

    expect(result.from).toEqual("HEAD");
    expect(result.to).toEqual("working-tree");
    expect(result.summary).toEqual({ added: 1, removed: 0, modified: 2, workflow: 0, total: 3 });
    expect(result.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "greeting",
          locale: "en",
          kind: "modified",
          before: "Hello",
          after: "Hello there",
        }),
        expect.objectContaining({
          message: "greeting",
          locale: "nl",
          kind: "added",
          after: "Hallo",
        }),
        expect.objectContaining({
          message: "greeting",
          override: "formal",
          locale: "en",
          kind: "modified",
          before: "Good day",
          after: "Greetings",
        }),
      ]),
    );
    expect(
      result.changes.find((change) => !change.override && change.locale === "en")?.afterState
        ?.status,
    ).toEqual("reviewed");
    await fs.promises.rm(root, { recursive: true, force: true });
  });

  it("compares a clean feature branch against main by default", async function () {
    const root = await createProject();
    git(root, "checkout", "-b", "feature/copy");
    await write(root, "messages/greeting.yml", "translations:\n  en: Welcome\n");
    git(root, "add", ".");
    git(root, "commit", "-m", "change copy");

    const result = await diffProject(runtime(root));

    expect(result.from).toEqual("main");
    expect(result.to).toEqual("working-tree");
    expect(result.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "greeting",
          locale: "en",
          before: "Hello",
          after: "Welcome",
        }),
        expect.objectContaining({
          message: "greeting",
          override: "formal",
          locale: "en",
          kind: "removed",
        }),
      ]),
    );
    await fs.promises.rm(root, { recursive: true, force: true });
  });

  it("accepts explicit branches and refs on both sides", async function () {
    const root = await createProject();
    git(root, "checkout", "-b", "release");
    await write(root, "messages/greeting.yml", "translations:\n  en: Released copy\n");
    git(root, "add", ".");
    git(root, "commit", "-m", "release copy");

    const result = await diffProject({ ...runtime(root), from: "main", to: "release" });

    expect(result.from).toEqual("main");
    expect(result.to).toEqual("release");
    expect(result.changes[0]).toEqual(
      expect.objectContaining({ message: "greeting", before: "Hello", after: "Released copy" }),
    );
    await fs.promises.rm(root, { recursive: true, force: true });
  });

  it("limits a sets project to repeatable selected sets", async function () {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-diff-sets-"));
    await write(root, "messagevisor.config.js", "module.exports = { sets: true };\n");
    for (const set of ["dev", "production"]) {
      await write(root, `sets/${set}/locales/en.yml`, "description: English\n");
      await write(root, `sets/${set}/messages/greeting.yml`, "translations:\n  en: Hello\n");
    }
    git(root, "init", "-b", "main");
    git(root, "config", "user.email", "tests@messagevisor.com");
    git(root, "config", "user.name", "Messagevisor Tests");
    git(root, "add", ".");
    git(root, "commit", "-m", "initial");
    await write(root, "sets/dev/messages/greeting.yml", "translations:\n  en: Dev copy\n");
    await write(
      root,
      "sets/production/messages/greeting.yml",
      "translations:\n  en: Production copy\n",
    );

    const result = await diffProject({ ...runtime(root), sets: ["dev"] });

    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]).toEqual(
      expect.objectContaining({ set: "dev", before: "Hello", after: "Dev copy" }),
    );
    await fs.promises.rm(root, { recursive: true, force: true });
  });
});

describe("message diff formatting", function () {
  const result = {
    from: "main",
    to: "working-tree",
    summary: { added: 0, removed: 0, modified: 1, workflow: 0, total: 1 },
    changes: [
      {
        message: "checkout.title",
        override: "returning",
        locale: "en",
        kind: "modified" as const,
        before: "Old | copy",
        after: "New\ncopy",
      },
    ],
  };

  it("renders readable terminal output", function () {
    expect(formatMessageDiffTerminal(result)).toContain(
      "MODIFIED checkout.title · override:returning · en",
    );
    expect(formatMessageDiffTerminal(result)).toContain("- Old | copy");
  });

  it("renders an escaped PR-friendly Markdown table", function () {
    const output = formatMessageDiffMarkdown(result);
    expect(output).toContain("| checkout.title | returning | en | modified |");
    expect(output).toContain("Old \\| copy");
    expect(output).toContain("New<br>copy");
  });
});
