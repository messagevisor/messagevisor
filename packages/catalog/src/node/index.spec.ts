import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as childProcess from "child_process";

import { mergeFormats, resolveFormats } from "../../../core/src/builder";
import { getProjectConfig } from "../../../core/src/config";
import { Datasource } from "../../../core/src/datasource";
import { resolveExamples } from "../../../core/src/examples";
import { findDuplicateTranslations } from "../../../core/src/find-duplicates";
import { getProjectSetExecutions } from "../../../core/src/sets";
import { createCatalogApi, createCatalogPlugin, type CatalogRuntime } from "./index";

const catalogApi = createCatalogApi({
  mergeFormats,
  resolveFormats,
  getProjectSetExecutions,
  resolveExamples,
  findDuplicateTranslations,
});
const catalogRuntime: CatalogRuntime = {
  mergeFormats,
  resolveFormats,
  getProjectSetExecutions,
  resolveExamples,
  findDuplicateTranslations,
};

async function writeFile(root: string, relativePath: string, content: string) {
  const filePath = path.join(root, relativePath);

  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, content);
}

async function readJson<T>(root: string, relativePath: string): Promise<T> {
  return JSON.parse(await fs.promises.readFile(path.join(root, relativePath), "utf8"));
}

async function pathExists(root: string, relativePath: string) {
  try {
    await fs.promises.access(path.join(root, relativePath));
    return true;
  } catch {
    return false;
  }
}

function stripAnsi(value: string) {
  return value.replace(/\x1b\[[0-9;]*m/g, "").replace(/%s/g, "");
}

async function captureConsoleLog(callback: () => Promise<void>) {
  const logs: string[] = [];
  const spy = jest.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  });

  try {
    await callback();
  } finally {
    spy.mockRestore();
  }

  return stripAnsi(logs.join("\n"));
}

async function createProject() {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-catalog-"));
  const interpolationModulePath = path.join(
    path.resolve(__dirname, "../../../.."),
    "packages/module-interpolation/src/index.ts",
  );

  await writeFile(
    root,
    "messagevisor.config.js",
    [
      `const { createInterpolationModule } = require(${JSON.stringify(interpolationModulePath)});`,
      "module.exports = {",
      "  modules: [createInterpolationModule()],",
      "};",
      "",
    ].join("\n"),
  );
  await writeFile(
    root,
    "locales/en.yml",
    [
      "description: English",
      "direction: ltr",
      "formats:",
      "  number:",
      "    decimal:",
      "      maximumFractionDigits: 2",
      "    money:",
      "      style: currency",
      "      currency: USD",
      "examples:",
      "  - description: Simple text",
      "    rawMessage: Hello, world!",
      "  - description: Welcome on pro plan",
      "    message: common.welcome",
      "    context:",
      "      plan: pro",
      "",
    ].join("\n"),
  );
  await writeFile(
    root,
    "locales/en-US.yml",
    [
      "description: English US",
      "direction: ltr",
      "promotable: false",
      "inheritFormatsFrom: en",
      "inheritTranslationsFrom: en",
      "mergeExamplesFrom: en",
      "formats:",
      "  number:",
      "    money:",
      "      currencyDisplay: code",
      "examples:",
      "  - matrix:",
      "      name: [Taylor, Sam]",
      "    description: Welcome ${{ name }}",
      "    rawMessage: Hello, {name}!",
      "    values:",
      "      name: ${{ name }}",
      "",
    ].join("\n"),
  );
  await writeFile(root, "locales/nl.yml", "description: Dutch\n");
  await writeFile(root, "attributes/plan.yml", "description: Plan\ntype: string\n");
  await writeFile(
    root,
    "segments/pro.yml",
    "description: Pro\nconditions:\n  attribute: plan\n  operator: equals\n  value: pro\n",
  );
  await writeFile(
    root,
    "messages/common/welcome.yml",
    [
      "description: Welcome",
      "promotable: false",
      "examples:",
      "  - description: Default welcome",
      "    locale: en",
      "  - matrix:",
      "      locale: [en, en-US]",
      "      plan: [free, pro]",
      "    description: Welcome for ${{ locale }} plan ${{ plan }}",
      "    locale: ${{ locale }}",
      "    context:",
      "      plan: ${{ plan }}",
      "translations:",
      "  en: Welcome",
      "overrides:",
      "  - key: pro",
      "    segments: pro",
      "    translations:",
      "      en: Welcome Pro",
      "",
    ].join("\n"),
  );
  await writeFile(
    root,
    "messages/common/draft.yml",
    "description: Draft\ntranslations:\n  en: Welcome\n",
  );
  await writeFile(
    root,
    "targets/web.yml",
    [
      "includeMessages:",
      "  - common*",
      "locales:",
      "  - en-US",
      "formats:",
      "  en-US:",
      "    number:",
      "      money:",
      "        minimumFractionDigits: 2",
      "",
    ].join("\n"),
  );

  return root;
}

function git(root: string, args: string[]) {
  childProcess.execFileSync("git", ["-C", root, ...args], {
    stdio: ["ignore", "ignore", "ignore"],
  });
}

function gitCommit(root: string, message: string) {
  childProcess.execFileSync(
    "git",
    [
      "-C",
      root,
      "-c",
      "user.name=Catalog Tester",
      "-c",
      "user.email=catalog@example.com",
      "commit",
      "-m",
      message,
    ],
    {
      stdio: ["ignore", "ignore", "ignore"],
    },
  );
}

describe("catalog", function () {
  const roots: string[] = [];
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(function () {
    consoleLogSpy = jest.spyOn(console, "log").mockImplementation(function () {
      // Keep catalog unit tests focused on generated data.
    });
  });

  afterEach(async function () {
    consoleLogSpy.mockRestore();

    for (const root of roots) {
      await fs.promises.rm(root, { recursive: true, force: true });
    }
    roots.length = 0;
  });

  it("exports regular project catalog data with relationships, status, and computed formats", async function () {
    const root = await createProject();
    roots.push(root);
    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);

    const result = await catalogApi.exportCatalog(root, projectConfig, datasource, {
      outDir: "catalog-out",
      copyAssets: false,
    });

    expect(result.outputDirectoryPath).toBe(path.join(root, "catalog-out"));

    const manifest = await readJson<any>(root, "catalog-out/data/manifest.json");
    const index = await readJson<any>(root, "catalog-out/data/root/index.json");
    const locale = await readJson<any>(root, "catalog-out/data/root/entities/locale/en-US.json");
    const message = await readJson<any>(
      root,
      "catalog-out/data/root/entities/message/common.welcome.json",
    );
    const attribute = await readJson<any>(
      root,
      "catalog-out/data/root/entities/attribute/plan.json",
    );
    const segment = await readJson<any>(root, "catalog-out/data/root/entities/segment/pro.json");
    const target = await readJson<any>(root, "catalog-out/data/root/entities/target/web.json");
    const history = await readJson<any>(root, "catalog-out/data/project/history/page-1.json");

    expect(manifest.sets).toBe(false);
    expect(manifest.router).toBe("browser");
    expect(manifest.dev).toBeUndefined();
    expect(manifest.features).toEqual({ translationSearch: false, duplicates: false });
    expect(manifest.paths.root).toBe("data/root/index.json");
    await expect(pathExists(root, "catalog-out/data/root/translations/77656c.json")).resolves.toBe(
      false,
    );
    await expect(
      pathExists(root, "catalog-out/data/root/duplicates/locales/en-US.json"),
    ).resolves.toBe(false);
    await expect(
      pathExists(root, "catalog-out/data/root/history/message/common.welcome/page-1.json"),
    ).resolves.toBe(false);
    await expect(
      pathExists(root, "catalog-out/data/root/history/message/common.draft/page-1.json"),
    ).resolves.toBe(false);
    expect(index.counts.message).toBe(2);
    expect(
      index.entities.message.find((entry: any) => entry.key === "common.welcome").targets,
    ).toEqual(["web"]);
    expect(index.entities.locale.find((entry: any) => entry.key === "en-US").targets).toEqual([
      "web",
    ]);
    expect(index.entities.attribute.find((entry: any) => entry.key === "plan").targets).toEqual([
      "web",
    ]);
    expect(index.entities.segment.find((entry: any) => entry.key === "pro").targets).toEqual([
      "web",
    ]);
    expect(index.entities.target.find((entry: any) => entry.key === "web").messageCount).toBe(2);
    expect(locale.computedFormats.number.decimal).toEqual({ maximumFractionDigits: 2 });
    expect(locale.computedFormats.number.money).toEqual({ currencyDisplay: "code" });
    expect(locale.entity.examples).toHaveLength(1);
    expect(locale.entity.direction).toBe("ltr");
    expect(locale.entity.promotable).toBe(false);
    expect(locale.formatRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "number.decimal.maximumFractionDigits",
          value: 2,
          source: "inherited",
          from: "en",
          examplePreview: expect.any(String),
        }),
        expect.objectContaining({
          path: "number.money.currencyDisplay",
          value: "code",
          source: "direct",
          examplePreview: expect.any(String),
        }),
      ]),
    );
    expect(locale.evaluatedExamples).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          locale: "en-US",
          sourceLocale: "en",
          description: "Simple text",
          rawMessage: "Hello, world!",
          evaluatedTranslation: "Hello, world!",
        }),
        expect.objectContaining({
          locale: "en-US",
          sourceLocale: "en",
          description: "Welcome on pro plan",
          message: "common.welcome",
          originalTranslation: "Welcome",
          evaluatedTranslation: "Welcome Pro",
        }),
        expect.objectContaining({
          locale: "en-US",
          sourceLocale: "en-US",
          description: "Welcome Taylor",
          rawMessage: "Hello, {name}!",
          evaluatedTranslation: "Hello, Taylor!",
        }),
      ]),
    );
    expect(locale.targetFormats.web.number.money.minimumFractionDigits).toBe(2);
    expect(target.formatRowsByLocale["en-US"]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "number.money.minimumFractionDigits",
          value: 2,
          source: "target",
          from: "target",
          examplePreview: expect.any(String),
        }),
        expect.objectContaining({
          path: "number.decimal.maximumFractionDigits",
          value: 2,
          source: "inherited",
          from: "en",
          examplePreview: expect.any(String),
        }),
      ]),
    );
    expect(message.targets).toEqual(["web"]);
    expect(message.editLinks).toBeUndefined();
    expect(message.entity.promotable).toBe(false);
    expect(message.entity.examples).toHaveLength(2);
    expect(message.translations).toEqual(
      expect.arrayContaining([
        {
          locale: "en-US",
          value: "Welcome",
          source: "inherited",
          from: "en",
        },
      ]),
    );
    expect(message.localeDirections).toEqual({
      en: "ltr",
      "en-US": "ltr",
    });
    expect(message.evaluatedExamples).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          locale: "en",
          description: "Default welcome",
          evaluatedTranslation: "Welcome",
        }),
        expect.objectContaining({
          locale: "en-US",
          description: "Welcome for en-US plan pro",
          evaluatedTranslation: "Welcome Pro",
        }),
      ]),
    );
    expect(message.entity.overrides[0].usedSegments).toEqual(["pro"]);
    expect(attribute.usage.segments).toEqual(["pro"]);
    expect(segment.usage.messages).toEqual(["common.welcome"]);
    expect(target.messages).toEqual(["common.draft", "common.welcome"]);
    expect(history.entries).toEqual([]);
  });

  it("exports locale duplicate reports only when opted in", async function () {
    const root = await createProject();
    roots.push(root);
    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);

    await catalogApi.exportCatalog(root, projectConfig, datasource, {
      outDir: "catalog-out",
      copyAssets: false,
      withDuplicates: true,
    });

    const manifest = await readJson<any>(root, "catalog-out/data/manifest.json");
    const localeDuplicates = await readJson<any>(
      root,
      "catalog-out/data/root/duplicates/locales/en-US.json",
    );
    const emptyLocaleDuplicates = await readJson<any>(
      root,
      "catalog-out/data/root/duplicates/locales/nl.json",
    );

    expect(manifest.features).toEqual({ translationSearch: false, duplicates: true });
    expect(localeDuplicates).toEqual({
      locale: "en-US",
      summary: {
        duplicateValues: 1,
        duplicateMessageKeys: 2,
      },
      duplicateValues: [
        {
          value: "Welcome",
          messageKeys: ["common.draft", "common.welcome"],
          sources: [
            { messageKey: "common.draft", locale: "en" },
            { messageKey: "common.welcome", locale: "en" },
          ],
        },
      ],
    });
    expect(emptyLocaleDuplicates).toEqual({
      locale: "nl",
      summary: {
        duplicateValues: 0,
        duplicateMessageKeys: 0,
      },
      duplicateValues: [],
    });
  });

  it("exports translation search shards only when opted in", async function () {
    const root = await createProject();
    roots.push(root);
    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);

    await catalogApi.exportCatalog(root, projectConfig, datasource, {
      outDir: "catalog-out",
      copyAssets: false,
      withTranslationSearch: true,
    });

    const manifest = await readJson<any>(root, "catalog-out/data/manifest.json");
    const shard = await readJson<any>(root, "catalog-out/data/root/translations/77656c.json");

    expect(manifest.features).toEqual({ translationSearch: true, duplicates: false });
    expect(shard["common.welcome"]).toEqual(expect.arrayContaining(["welcome", "welcome pro"]));
    expect(shard["common.draft"]).toEqual(["welcome"]);
  });

  it("prints progress output for default catalog export", async function () {
    const root = await createProject();
    roots.push(root);
    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);

    const output = await captureConsoleLog(async () => {
      await catalogApi.exportCatalog(root, projectConfig, datasource, {
        outDir: "catalog-out",
        copyAssets: false,
      });
    });

    expect(output).toContain("Generating Messagevisor catalog");
    expect(output).toContain("Output: catalog-out");
    expect(output).toContain("Router: browser");
    expect(output).toContain("Features: none");
    expect(output).toContain("Preparing output directory");
    expect(output).toContain("Reading Git history");
    expect(output).toContain("Discovering project sets");
    expect(output).toContain("Writing project history");
    expect(output).toContain("Root catalog");
    expect(output).toContain("Processing entities");
    expect(output).toContain("Writing messages");
    expect(output).toContain("Writing message details");
    expect(output).toContain("Writing message history pages");
    expect(output).toContain("Writing manifest");
    expect(output).toContain("Catalog exported to catalog-out");
    expect(output).toContain("Time:");
    expect(output).not.toContain("Scanning duplicate translations");
    expect(output).not.toContain("Building translation search shards");
  });

  it("prints optional catalog progress only when feature work is enabled", async function () {
    const root = await createProject();
    roots.push(root);
    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);

    const output = await captureConsoleLog(async () => {
      await catalogApi.exportCatalog(root, projectConfig, datasource, {
        outDir: "catalog-out",
        copyAssets: false,
        withDuplicates: true,
        withTranslationSearch: true,
      });
    });

    expect(output).toContain("Features: translation search, duplicates");
    expect(output).toContain("Scanning duplicate translations");
    expect(output).toContain("Writing duplicate reports");
    expect(output).toContain("Building translation search shards");
  });

  it("exports many messages deterministically without empty history files", async function () {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-catalog-"));
    roots.push(root);

    await writeFile(root, "messagevisor.config.js", "module.exports = {};\n");
    await writeFile(root, "locales/en.yml", "description: English\n");

    const messageCount = 1200;
    await Promise.all(
      Array.from({ length: messageCount }, (_, index) => {
        const key = String(index).padStart(4, "0");
        return writeFile(
          root,
          `messages/bulk/${key}.yml`,
          `description: Bulk ${key}\ntranslations:\n  en: Bulk ${key}\n`,
        );
      }),
    );

    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);

    const output = await captureConsoleLog(async () => {
      await catalogApi.exportCatalog(root, projectConfig, datasource, {
        outDir: "catalog-out",
        copyAssets: false,
      });
    });

    const index = await readJson<any>(root, "catalog-out/data/root/index.json");
    const firstMessage = await readJson<any>(
      root,
      "catalog-out/data/root/entities/message/bulk.0000.json",
    );
    const lastMessage = await readJson<any>(
      root,
      "catalog-out/data/root/entities/message/bulk.1199.json",
    );

    expect(index.counts.message).toBe(messageCount);
    expect(index.entities.message.slice(0, 3).map((entry: any) => entry.key)).toEqual([
      "bulk.0000",
      "bulk.0001",
      "bulk.0002",
    ]);
    expect(firstMessage.sourcePath).toBe("messages/bulk/0000.yml");
    expect(lastMessage.translations).toEqual([
      { locale: "en", value: "Bulk 1199", source: "direct" },
    ]);
    await expect(
      pathExists(root, "catalog-out/data/root/history/message/bulk.0000/page-1.json"),
    ).resolves.toBe(false);
    expect(output).toContain("1200 messages");
    expect(output).toContain("1200 empty histories skipped");
  });

  it("streams Git history into project, entity, and last-modified catalog data", async function () {
    const root = await createProject();
    roots.push(root);
    git(root, ["init"]);
    git(root, ["add", "."]);
    gitCommit(root, "initial catalog fixtures");

    await writeFile(
      root,
      "tests/messages/common/welcome.spec.yml",
      "cases:\n  - description: Test only\n",
    );
    git(root, ["add", "."]);
    gitCommit(root, "test-only change");

    await writeFile(
      root,
      "messages/common/welcome.yml",
      ["description: Welcome updated", "translations:", "  en: Welcome back", ""].join("\n"),
    );
    await writeFile(
      root,
      "messages/common/with space.yml",
      "description: With space\ntranslations:\n  en: Spaced\n",
    );
    git(root, ["add", "."]);
    gitCommit(root, "message updates");

    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);

    await catalogApi.exportCatalog(root, projectConfig, datasource, {
      outDir: "catalog-out",
      copyAssets: false,
    });

    const projectHistory = await readJson<any>(
      root,
      "catalog-out/data/project/history/page-1.json",
    );
    const messageHistory = await readJson<any>(
      root,
      "catalog-out/data/root/history/message/common.welcome/page-1.json",
    );
    const spacedMessageHistory = await readJson<any>(
      root,
      "catalog-out/data/root/history/message/common.with%20space/page-1.json",
    );
    const index = await readJson<any>(root, "catalog-out/data/root/index.json");
    const message = await readJson<any>(
      root,
      "catalog-out/data/root/entities/message/common.welcome.json",
    );

    expect(projectHistory.entries).toHaveLength(2);
    expect(projectHistory.entries[0].entities).toEqual(
      expect.arrayContaining([
        { type: "message", key: "common.welcome" },
        { type: "message", key: "common.with space" },
      ]),
    );
    expect(projectHistory.entries).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entities: expect.arrayContaining([{ type: "test", key: "common.welcome" }]),
        }),
      ]),
    );
    expect(messageHistory.entries).toHaveLength(2);
    expect(messageHistory.entries[0].entities).toEqual([
      { type: "message", key: "common.welcome" },
    ]);
    expect(spacedMessageHistory.entries[0].entities).toEqual(
      [{ type: "message", key: "common.with space" }],
    );
    expect(message.lastModified).toMatchObject({
      author: "Catalog Tester",
      commit: projectHistory.entries[0].commit,
    });
    expect(
      index.entities.message.find((entry: any) => entry.key === "common.welcome").lastModified,
    ).toMatchObject({
      commit: projectHistory.entries[0].commit,
    });
  });

  it("keeps large commit entity lists out of per-entity history files", async function () {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-catalog-"));
    roots.push(root);

    await writeFile(root, "messagevisor.config.js", "module.exports = {};\n");
    await writeFile(root, "locales/en.yml", "description: English\n");

    const messageCount = 1200;
    await Promise.all(
      Array.from({ length: messageCount }, (_, index) => {
        const key = String(index).padStart(4, "0");
        return writeFile(
          root,
          `messages/bulk/${key}.yml`,
          `description: Bulk ${key}\ntranslations:\n  en: Bulk ${key}\n`,
        );
      }),
    );

    git(root, ["init"]);
    git(root, ["add", "."]);
    gitCommit(root, "large message import");

    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);

    await catalogApi.exportCatalog(root, projectConfig, datasource, {
      outDir: "catalog-out",
      copyAssets: false,
    });

    const projectHistory = await readJson<any>(
      root,
      "catalog-out/data/project/history/page-1.json",
    );
    const firstMessageHistory = await readJson<any>(
      root,
      "catalog-out/data/root/history/message/bulk.0000/page-1.json",
    );
    const lastMessageHistory = await readJson<any>(
      root,
      "catalog-out/data/root/history/message/bulk.1199/page-1.json",
    );

    expect(projectHistory.entries[0].entities).toHaveLength(messageCount + 1);
    expect(projectHistory.entries[0].entities).toEqual(
      expect.arrayContaining([
        { type: "locale", key: "en" },
        { type: "message", key: "bulk.0000" },
        { type: "message", key: "bulk.1199" },
      ]),
    );
    expect(firstMessageHistory.entries[0]).toMatchObject({
      commit: projectHistory.entries[0].commit,
      author: projectHistory.entries[0].author,
      timestamp: projectHistory.entries[0].timestamp,
      entities: [{ type: "message", key: "bulk.0000" }],
    });
    expect(lastMessageHistory.entries[0].entities).toEqual([
      { type: "message", key: "bulk.1199" },
    ]);
  });

  it("exports branch-aware repository links and hash router mode when requested", async function () {
    const root = await createProject();
    roots.push(root);
    git(root, ["init"]);
    git(root, ["checkout", "-b", "catalog-test"]);
    git(root, ["remote", "add", "origin", "git@github.com:messagevisor/messagevisor.git"]);
    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);

    await catalogApi.exportCatalog(root, projectConfig, datasource, {
      outDir: "catalog-out",
      copyAssets: false,
      browserRouter: false,
    });

    const manifest = await readJson<any>(root, "catalog-out/data/manifest.json");

    expect(manifest.router).toBe("hash");
    expect(manifest.links).toMatchObject({
      provider: "github",
      repository: "https://github.com/messagevisor/messagevisor",
      source: "https://github.com/messagevisor/messagevisor/blob/catalog-test/{{path}}",
      commit: "https://github.com/messagevisor/messagevisor/commit/{{hash}}",
    });
  });

  it("exports GitLab and Bitbucket repository links for known providers", async function () {
    const providers = [
      {
        remote: "git@gitlab.com:messagevisor/messagevisor.git",
        expected: {
          provider: "gitlab",
          repository: "https://gitlab.com/messagevisor/messagevisor",
          source: "https://gitlab.com/messagevisor/messagevisor/-/blob/catalog-test/{{path}}",
          commit: "https://gitlab.com/messagevisor/messagevisor/-/commit/{{hash}}",
        },
      },
      {
        remote: "git@bitbucket.org:messagevisor/messagevisor.git",
        expected: {
          provider: "bitbucket",
          repository: "https://bitbucket.org/messagevisor/messagevisor",
          source: "https://bitbucket.org/messagevisor/messagevisor/src/catalog-test/{{path}}",
          commit: "https://bitbucket.org/messagevisor/messagevisor/commits/{{hash}}",
        },
      },
    ];

    for (const provider of providers) {
      const root = await createProject();
      roots.push(root);
      git(root, ["init"]);
      git(root, ["checkout", "-b", "catalog-test"]);
      git(root, ["remote", "add", "origin", provider.remote]);
      const projectConfig = getProjectConfig(root);
      const datasource = new Datasource(projectConfig, root);

      await catalogApi.exportCatalog(root, projectConfig, datasource, {
        outDir: "catalog-out",
        copyAssets: false,
      });

      const manifest = await readJson<any>(root, "catalog-out/data/manifest.json");

      expect(manifest.links).toMatchObject(provider.expected);
    }
  });

  it("omits repository links for unknown Git providers", async function () {
    const root = await createProject();
    roots.push(root);
    git(root, ["init"]);
    git(root, ["checkout", "-b", "catalog-test"]);
    git(root, ["remote", "add", "origin", "git@example.com:messagevisor/messagevisor.git"]);
    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);

    await catalogApi.exportCatalog(root, projectConfig, datasource, {
      outDir: "catalog-out",
      copyAssets: false,
    });

    const manifest = await readJson<any>(root, "catalog-out/data/manifest.json");

    expect(manifest.links).toBeUndefined();
  });

  it("exports dev-only editor metadata and entity editor links when requested", async function () {
    const root = await createProject();
    roots.push(root);
    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);

    await catalogApi.exportCatalog(root, projectConfig, datasource, {
      outDir: "catalog-out",
      copyAssets: false,
      dev: true,
      devEditors: [{ id: "cursor", label: "Cursor", icon: "cursor" }],
    });

    const manifest = await readJson<any>(root, "catalog-out/data/manifest.json");
    const message = await readJson<any>(
      root,
      "catalog-out/data/root/entities/message/common.welcome.json",
    );

    expect(manifest.links).toBeUndefined();
    expect(manifest.dev).toEqual({
      editors: [{ id: "cursor", label: "Cursor", icon: "cursor" }],
    });
    expect(message.editLinks).toEqual({
      cursor: expect.stringMatching(/^cursor:\/\/file\/.+messages\/common\/welcome\.yml$/),
    });
  });

  it("exports repo-relative source paths for nested projects", async function () {
    const repositoryRoot = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "messagevisor-catalog-repo-"),
    );
    roots.push(repositoryRoot);
    const projectRoot = path.join(repositoryRoot, "projects", "shop");

    await fs.promises.mkdir(projectRoot, { recursive: true });
    await writeFile(projectRoot, "messagevisor.config.js", "module.exports = {};\n");
    await writeFile(projectRoot, "locales/en.yml", "description: English\n");
    await writeFile(
      projectRoot,
      "messages/common/welcome.yml",
      "description: Welcome\ntranslations:\n  en: Welcome\n",
    );

    git(repositoryRoot, ["init"]);
    git(repositoryRoot, ["checkout", "-b", "nested-catalog-test"]);
    git(repositoryRoot, [
      "remote",
      "add",
      "origin",
      "git@github.com:messagevisor/messagevisor.git",
    ]);

    const projectConfig = getProjectConfig(projectRoot);
    const datasource = new Datasource(projectConfig, projectRoot);

    await catalogApi.exportCatalog(projectRoot, projectConfig, datasource, {
      outDir: "catalog-out",
      copyAssets: false,
    });

    const message = await readJson<any>(
      projectRoot,
      "catalog-out/data/root/entities/message/common.welcome.json",
    );

    expect(message.sourcePath).toBe("projects/shop/messages/common/welcome.yml");
  });

  it("exports set project catalog data independently for each set", async function () {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-catalog-"));
    roots.push(root);

    await writeFile(root, "messagevisor.config.js", "module.exports = { sets: true };\n");

    for (const set of ["storefront", "admin"]) {
      await writeFile(root, `sets/${set}/locales/en.yml`, "description: English\n");
      await writeFile(
        root,
        `sets/${set}/messages/common/welcome.yml`,
        `description: Welcome\ntranslations:\n  en: ${set}\n`,
      );
      await writeFile(
        root,
        `sets/${set}/messages/common/duplicate.yml`,
        `description: Duplicate\ntranslations:\n  en: ${set}\n`,
      );
      await writeFile(
        root,
        `sets/${set}/targets/web.yml`,
        "includeMessages:\n  - common*\nlocales:\n  - en\n",
      );
    }

    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);

    await catalogApi.exportCatalog(root, projectConfig, datasource, {
      outDir: "catalog-out",
      copyAssets: false,
    });

    const manifest = await readJson<any>(root, "catalog-out/data/manifest.json");
    const storefront = await readJson<any>(root, "catalog-out/data/sets/storefront/index.json");
    const admin = await readJson<any>(root, "catalog-out/data/sets/admin/index.json");

    expect(manifest.sets).toBe(true);
    expect(manifest.features).toEqual({ translationSearch: false, duplicates: false });
    expect(manifest.setKeys).toEqual(["admin", "storefront"]);
    await expect(
      pathExists(root, "catalog-out/data/sets/storefront/translations/73746f.json"),
    ).resolves.toBe(false);
    await expect(
      pathExists(root, "catalog-out/data/sets/storefront/duplicates/locales/en.json"),
    ).resolves.toBe(false);

    expect(storefront.counts.message).toBe(2);
    expect(admin.counts.message).toBe(2);
    await expect(
      readJson<any>(root, "catalog-out/data/sets/storefront/entities/message/common.welcome.json"),
    ).resolves.toMatchObject({
      key: "common.welcome",
      entity: { translations: { en: "storefront" } },
    });

    await catalogApi.exportCatalog(root, projectConfig, datasource, {
      outDir: "catalog-with-duplicates",
      copyAssets: false,
      withDuplicates: true,
    });

    const optInManifest = await readJson<any>(root, "catalog-with-duplicates/data/manifest.json");
    const storefrontDuplicates = await readJson<any>(
      root,
      "catalog-with-duplicates/data/sets/storefront/duplicates/locales/en.json",
    );
    const adminDuplicates = await readJson<any>(
      root,
      "catalog-with-duplicates/data/sets/admin/duplicates/locales/en.json",
    );

    expect(optInManifest.features).toEqual({ translationSearch: false, duplicates: true });
    expect(storefrontDuplicates.duplicateValues).toEqual([
      {
        value: "storefront",
        messageKeys: ["common.duplicate", "common.welcome"],
        sources: [
          { messageKey: "common.duplicate", locale: "en" },
          { messageKey: "common.welcome", locale: "en" },
        ],
      },
    ]);
    expect(adminDuplicates.duplicateValues).toEqual([
      {
        value: "admin",
        messageKeys: ["common.duplicate", "common.welcome"],
        sources: [
          { messageKey: "common.duplicate", locale: "en" },
          { messageKey: "common.welcome", locale: "en" },
        ],
      },
    ]);
  });

  it("prints set names while exporting set project catalogs", async function () {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-catalog-"));
    roots.push(root);

    await writeFile(root, "messagevisor.config.js", "module.exports = { sets: true };\n");

    for (const set of ["storefront", "admin"]) {
      await writeFile(root, `sets/${set}/locales/en.yml`, "description: English\n");
      await writeFile(
        root,
        `sets/${set}/messages/common/welcome.yml`,
        `description: Welcome\ntranslations:\n  en: ${set}\n`,
      );
    }

    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);

    const output = await captureConsoleLog(async () => {
      await catalogApi.exportCatalog(root, projectConfig, datasource, {
        outDir: "catalog-out",
        copyAssets: false,
      });
    });

    expect(output).toContain("Sets:   enabled");
    expect(output).toContain("Discovering project sets");
    expect(output).toContain('Set "admin"');
    expect(output).toContain('Set "storefront"');
    expect(output).toContain("Processing entities");
  });

  it("exports set translation search shards when opted in", async function () {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-catalog-"));
    roots.push(root);

    await writeFile(root, "messagevisor.config.js", "module.exports = { sets: true };\n");

    for (const set of ["storefront", "admin"]) {
      await writeFile(root, `sets/${set}/locales/en.yml`, "description: English\n");
      await writeFile(
        root,
        `sets/${set}/messages/common/welcome.yml`,
        `description: Welcome\ntranslations:\n  en: ${set}\n`,
      );
    }

    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);

    await catalogApi.exportCatalog(root, projectConfig, datasource, {
      outDir: "catalog-out",
      copyAssets: false,
      withTranslationSearch: true,
    });

    const manifest = await readJson<any>(root, "catalog-out/data/manifest.json");
    const storefrontShard = await readJson<any>(
      root,
      "catalog-out/data/sets/storefront/translations/73746f.json",
    );
    const adminShard = await readJson<any>(
      root,
      "catalog-out/data/sets/admin/translations/61646d.json",
    );

    expect(manifest.features).toEqual({ translationSearch: true, duplicates: false });
    expect(storefrontShard).toEqual({ "common.welcome": ["storefront"] });
    expect(adminShard).toEqual({ "common.welcome": ["admin"] });
  });

  it("groups streamed Git history by set", async function () {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-catalog-"));
    roots.push(root);

    await writeFile(root, "messagevisor.config.js", "module.exports = { sets: true };\n");
    await writeFile(root, "sets/storefront/locales/en.yml", "description: English\n");
    await writeFile(
      root,
      "sets/storefront/messages/common/welcome.yml",
      "description: Storefront\ntranslations:\n  en: Storefront\n",
    );
    await writeFile(root, "sets/admin/locales/en.yml", "description: English\n");
    await writeFile(
      root,
      "sets/admin/messages/common/welcome.yml",
      "description: Admin\ntranslations:\n  en: Admin\n",
    );
    await writeFile(
      root,
      "sets/admin/tests/messages/common/welcome.spec.yml",
      "cases:\n  - description: Test only\n",
    );

    git(root, ["init"]);
    git(root, ["add", "."]);
    gitCommit(root, "initial sets");

    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);

    await catalogApi.exportCatalog(root, projectConfig, datasource, {
      outDir: "catalog-out",
      copyAssets: false,
    });

    const projectHistory = await readJson<any>(
      root,
      "catalog-out/data/project/history/page-1.json",
    );
    const storefrontHistory = await readJson<any>(
      root,
      "catalog-out/data/sets/storefront/history/page-1.json",
    );
    const adminHistory = await readJson<any>(
      root,
      "catalog-out/data/sets/admin/history/page-1.json",
    );
    const adminMessageHistory = await readJson<any>(
      root,
      "catalog-out/data/sets/admin/history/message/common.welcome/page-1.json",
    );

    expect(projectHistory.entries).toHaveLength(1);
    expect(storefrontHistory.entries).toHaveLength(1);
    expect(adminHistory.entries).toHaveLength(1);
    expect(adminMessageHistory.entries[0].entities).toEqual(
      expect.arrayContaining([{ type: "message", key: "common.welcome", set: "admin" }]),
    );
    expect(adminHistory.entries[0].entities).not.toEqual(
      expect.arrayContaining([{ type: "test", key: "common.welcome", set: "admin" }]),
    );
  });

  it("paginates many streamed Git history entries without loading one raw output blob", async function () {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-catalog-"));
    roots.push(root);
    await writeFile(root, "messagevisor.config.js", "module.exports = {};\n");
    await writeFile(root, "locales/en.yml", "description: English\n");
    await writeFile(
      root,
      "messages/common/welcome.yml",
      "description: Welcome\ntranslations:\n  en: Welcome\n",
    );
    await writeFile(
      root,
      "messages/common/with space.yml",
      "description: With space\ntranslations:\n  en: Spaced\n",
    );

    git(root, ["init"]);
    git(root, ["add", "."]);
    gitCommit(root, "initial catalog project");

    for (let index = 0; index < 60; index++) {
      await writeFile(
        root,
        "messages/common/welcome.yml",
        `description: Welcome ${index}\ntranslations:\n  en: Welcome ${index}\n`,
      );
      git(root, ["add", "."]);
      gitCommit(root, `message update ${index}`);
    }

    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);

    await catalogApi.exportCatalog(root, projectConfig, datasource, {
      outDir: "catalog-out",
      copyAssets: false,
    });

    const projectHistory = await readJson<any>(
      root,
      "catalog-out/data/project/history/page-1.json",
    );
    const messageHistory = await readJson<any>(
      root,
      "catalog-out/data/root/history/message/common.welcome/page-1.json",
    );

    expect(projectHistory.totalPages).toBe(2);
    expect(projectHistory.entries).toHaveLength(50);
    expect(projectHistory.entries[0].entities).toEqual([
      { type: "message", key: "common.welcome" },
    ]);
    expect(messageHistory.totalPages).toBe(2);
    expect(messageHistory.entries).toHaveLength(50);
  });

  it("uses root-relative asset paths for browser-router refresh safety", async function () {
    const viteConfigSource = await fs.promises.readFile(
      path.join(__dirname, "../../vite.config.ts"),
      "utf8",
    );

    expect(viteConfigSource).toContain('base: "/"');
  });
});

describe("catalog plugin", function () {
  let exportMock: jest.Mock;
  let serveMock: jest.Mock;

  beforeEach(function () {
    jest.useFakeTimers();
    exportMock = jest.fn().mockResolvedValue({
      outputDirectoryPath: "/tmp/catalog",
      manifest: {},
    });
    serveMock = jest.fn().mockResolvedValue({
      close: jest.fn(),
      triggerReload: jest.fn(),
    });
  });

  afterEach(function () {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  function createPlugin() {
    const plugin = createCatalogPlugin(catalogRuntime, {
      exportCatalog: exportMock,
      serveCatalog: serveMock,
    });
    const rootDirectoryPath = "/tmp/messagevisor-project";
    const projectConfig = {
      catalogDirectoryPath: path.join(rootDirectoryPath, "catalog"),
    };

    return {
      plugin,
      handler: (parsed: Record<string, unknown>) =>
        plugin.handler({
          rootDirectoryPath,
          projectConfig,
          datasource: {},
          parsed: parsed as any,
        }),
    };
  }

  it("forwards long and short port options for dev catalog mode", async function () {
    const { handler } = createPlugin();

    await handler({ _: ["catalog"], port: 3101 });
    expect(serveMock).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.any(Object),
      expect.objectContaining({ port: 3101, liveReload: true }),
    );

    await handler({ _: ["catalog"], p: 3102 });
    expect(serveMock).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.any(Object),
      expect.objectContaining({ port: 3102, liveReload: true }),
    );
  });

  it("forwards translation search option for dev catalog mode", async function () {
    const { handler } = createPlugin();

    await handler({ _: ["catalog"], withTranslationSearch: true });

    expect(exportMock).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.any(Object),
      expect.objectContaining({ withTranslationSearch: true, dev: true }),
    );
  });

  it("forwards duplicates option for dev catalog mode", async function () {
    const { handler } = createPlugin();

    await handler({ _: ["catalog"], withDuplicates: true });

    expect(exportMock).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.any(Object),
      expect.objectContaining({ withDuplicates: true, dev: true }),
    );
  });

  it("forwards translation search option for export subcommand", async function () {
    const { handler } = createPlugin();

    await handler({
      _: ["catalog", "export"],
      subcommand: "export",
      "with-translation-search": true,
    });

    expect(exportMock).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.any(Object),
      expect.objectContaining({ withTranslationSearch: true }),
    );
  });

  it("forwards duplicates option for export subcommand", async function () {
    const { handler } = createPlugin();

    await handler({
      _: ["catalog", "export"],
      subcommand: "export",
      "with-duplicates": true,
    });

    expect(exportMock).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.any(Object),
      expect.objectContaining({ withDuplicates: true }),
    );
  });

  it("forwards long and short port options for serve subcommand", async function () {
    const { handler } = createPlugin();

    await handler({
      _: ["catalog", "serve"],
      subcommand: "serve",
      port: 3103,
      "with-duplicates": true,
      "with-translation-search": true,
    });
    expect(serveMock).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.any(Object),
      expect.not.objectContaining({ withTranslationSearch: true }),
    );
    expect(serveMock).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.any(Object),
      expect.not.objectContaining({ withDuplicates: true }),
    );
    expect(serveMock).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.any(Object),
      expect.objectContaining({ port: 3103 }),
    );

    await handler({ _: ["catalog", "serve"], subcommand: "serve", p: 3104 });
    expect(serveMock).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.any(Object),
      expect.objectContaining({ port: 3104 }),
    );
  });

  it("lets serveCatalog apply its default port when no port option is provided", async function () {
    const { handler } = createPlugin();

    await handler({ _: ["catalog", "serve"], subcommand: "serve" });

    expect(serveMock).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.any(Object),
      expect.objectContaining({ port: undefined }),
    );
  });

  it("does not print catalog generation progress for serve subcommand", async function () {
    const { handler } = createPlugin();

    const output = await captureConsoleLog(async () => {
      await handler({ _: ["catalog", "serve"], subcommand: "serve" });
    });

    expect(output).not.toContain("Generating Messagevisor catalog");
    expect(output).not.toContain("Processing entities");
    expect(serveMock).toHaveBeenCalledTimes(1);
    expect(exportMock).not.toHaveBeenCalled();
  });
});
