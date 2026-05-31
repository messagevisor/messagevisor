import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { getProjectConfig } from "../config";
import { Datasource } from "../datasource";

import { prunePlugin, pruneProject } from "./index";

async function writeFile(root: string, relativePath: string, content: string) {
  const filePath = path.join(root, relativePath);
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, content);
}

async function createProject() {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-prune-"));

  await writeFile(root, "messagevisor.config.js", "module.exports = {};\n");
  await writeFile(
    root,
    "locales/en.yml",
    [
      "description: English",
      "formats:",
      "  number:",
      "    currency:",
      "      style: currency",
      "      currency: USD",
      "  date:",
      "    short:",
      "      year: numeric",
      "",
    ].join("\n"),
  );
  await writeFile(
    root,
    "locales/en-US.yml",
    [
      "description: English US",
      "inheritTranslationsFrom: en",
      "inheritFormatsFrom: en",
      "formats:",
      "  number:",
      "    currency:",
      "      style: currency",
      "      currency: USD",
      "    currencyCode:",
      "      style: currency",
      "      currency: USD",
      "      currencyDisplay: code",
      "  date:",
      "    short:",
      "      year: numeric",
      "",
    ].join("\n"),
  );
  await writeFile(
    root,
    "locales/en-AU.yml",
    [
      "description: English AU",
      "inheritTranslationsFrom: en-US",
      "inheritFormatsFrom: en-US",
      "",
    ].join("\n"),
  );
  await writeFile(
    root,
    "targets/web.yml",
    ["description: Web", "includeMessages:", "  - common*", "locales:", "  - en-US", ""].join("\n"),
  );
  await writeFile(
    root,
    "messages/common/welcome.yml",
    [
      "description: Welcome",
      "translations:",
      "  en: Welcome",
      "  en-US: Welcome",
      "  en-AU: Welcome",
      "overrides:",
      "  - key: pro",
      "    segments: '*'",
      "    translations:",
      "      en: Welcome pro",
      "      en-US: Welcome pro",
      "",
    ].join("\n"),
  );
  await writeFile(
    root,
    "messages/common/goodbye.yml",
    ["description: Goodbye", "translations:", "  en: Goodbye", "  en-US: Different", ""].join("\n"),
  );
  await writeFile(
    root,
    "messages/admin/secret.yml",
    ["description: Secret", "translations:", "  en: Secret", "  en-US: Secret", ""].join("\n"),
  );

  return root;
}

async function createSetsProject() {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-prune-sets-"));
  await writeFile(root, "messagevisor.config.js", "module.exports = { sets: true };\n");
  await writeFile(root, "sets/dev/locales/en.yml", "description: English\n");
  await writeFile(
    root,
    "sets/dev/locales/en-US.yml",
    ["description: English US", "inheritTranslationsFrom: en", ""].join("\n"),
  );
  await writeFile(
    root,
    "sets/dev/messages/common/welcome.yml",
    "description: Welcome\ntranslations:\n  en: Welcome\n  en-US: Welcome\n",
  );
  await writeFile(root, "sets/staging/locales/en.yml", "description: English\n");
  await writeFile(
    root,
    "sets/staging/locales/en-US.yml",
    ["description: English US", "inheritTranslationsFrom: en", ""].join("\n"),
  );
  await writeFile(
    root,
    "sets/staging/messages/common/welcome.yml",
    "description: Welcome\ntranslations:\n  en: Welcome\n  en-US: Welcome\n",
  );

  return root;
}

async function createRecursiveFormatsProject() {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-prune-formats-"));

  await writeFile(root, "messagevisor.config.js", "module.exports = {};\n");
  await writeFile(
    root,
    "locales/en.yml",
    [
      "description: English",
      "formats:",
      "  number:",
      "    money:",
      "      style: currency",
      "      currency: USD",
      "",
    ].join("\n"),
  );
  await writeFile(
    root,
    "locales/en-GB.yml",
    [
      "description: English GB",
      "inheritFormatsFrom: en",
      "formats:",
      "  number:",
      "    money:",
      "      currency: GBP",
      "",
    ].join("\n"),
  );
  await writeFile(
    root,
    "locales/en-GB-x-test.yml",
    [
      "description: English GB test",
      "inheritFormatsFrom: en-GB",
      "formats:",
      "  number:",
      "    money:",
      "      currency: GBP",
      "",
    ].join("\n"),
  );

  return root;
}

function getDatasource(root: string) {
  const projectConfig = getProjectConfig(root);
  const datasource = new Datasource(projectConfig, root);

  return { projectConfig, datasource };
}

describe("pruneProject", function () {
  it("reports and applies prune-able inherited message and override translations", async function () {
    const root = await createProject();
    const { projectConfig, datasource } = getDatasource(root);

    const preview = await pruneProject(projectConfig, datasource, {
      pruneMode: "translations",
      target: "web",
    });

    expect(preview.changedFiles).toEqual([]);
    expect(preview.entries).toEqual([
      expect.objectContaining({
        kind: "message",
        key: "common.welcome",
        locale: "en-US",
        inheritedFrom: "en",
      }),
      expect.objectContaining({
        kind: "override",
        key: "common.welcome",
        overrideKey: "pro",
        locale: "en-US",
        inheritedFrom: "en",
      }),
    ]);

    const applied = await pruneProject(projectConfig, datasource, {
      pruneMode: "translations",
      target: "web",
      apply: true,
    });

    expect(applied.changedFiles).toHaveLength(1);

    const updated = await datasource.readMessage("common.welcome");

    expect(updated.translations.en).toEqual("Welcome");
    expect(updated.translations["en-US"]).toBeUndefined();
    expect(updated.translations["en-AU"]).toEqual("Welcome");
    expect(updated.overrides?.[0].translations.en).toEqual("Welcome pro");
    expect(updated.overrides?.[0].translations["en-US"]).toBeUndefined();
  });

  it("prunes deep duplicate locale formats while preserving true overrides", async function () {
    const root = await createProject();
    const { projectConfig, datasource } = getDatasource(root);

    const preview = await pruneProject(projectConfig, datasource, {
      pruneMode: "formats",
      target: "web",
    });

    expect(preview.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "locale",
          key: "en-US",
          formatPath: "date.short.year",
          inheritedFrom: "en",
        }),
        expect.objectContaining({
          kind: "locale",
          key: "en-US",
          formatPath: "number.currency.currency",
          inheritedFrom: "en",
        }),
        expect.objectContaining({
          kind: "locale",
          key: "en-US",
          formatPath: "number.currency.style",
          inheritedFrom: "en",
        }),
      ]),
    );

    await pruneProject(projectConfig, datasource, {
      pruneMode: "formats",
      target: "web",
      apply: true,
    });

    const updated = await datasource.readLocale("en-US");

    expect(updated.formats).toEqual({
      number: {
        currencyCode: {
          style: "currency",
          currency: "USD",
          currencyDisplay: "code",
        },
      },
    });
  });

  it("respects nearest-parent precedence for recursive inherited formats", async function () {
    const root = await createRecursiveFormatsProject();
    const { projectConfig, datasource } = getDatasource(root);

    const preview = await pruneProject(projectConfig, datasource, {
      pruneMode: "formats",
      locale: "en-GB-x-test",
    });

    expect(preview.entries).toEqual([
      expect.objectContaining({
        kind: "locale",
        key: "en-GB-x-test",
        formatPath: "number.money.currency",
        inheritedFrom: "en-GB",
      }),
    ]);

    await pruneProject(projectConfig, datasource, {
      pruneMode: "formats",
      locale: "en-GB-x-test",
      apply: true,
    });

    const updated = await datasource.readLocale("en-GB-x-test");

    expect(updated.formats).toBeUndefined();
  });
});

describe("prunePlugin", function () {
  it("requires exactly one target", async function () {
    const root = await createProject();
    const { projectConfig, datasource } = getDatasource(root);

    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      await expect(
        prunePlugin.handler({
          projectConfig,
          datasource,
          parsed: {},
        }),
      ).resolves.toBe(false);

      await expect(
        prunePlugin.handler({
          projectConfig,
          datasource,
          parsed: {
            translations: true,
            formats: true,
          },
        }),
      ).resolves.toBe(false);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Pass exactly one of --translations or --formats.",
      );
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("runs across all sets by default in sets-enabled projects", async function () {
    const root = await createSetsProject();
    const { projectConfig, datasource } = getDatasource(root);
    const consoleLogSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      await prunePlugin.handler({
        projectConfig,
        datasource,
        parsed: {
          translations: true,
        },
      });

      const output = consoleLogSpy.mock.calls.flat().join("\n");

      expect(output).toContain('Set "dev":');
      expect(output).toContain('Set "staging":');
    } finally {
      consoleLogSpy.mockRestore();
    }
  });

  it("runs for the selected set only when --set is provided", async function () {
    const root = await createSetsProject();
    const { projectConfig, datasource } = getDatasource(root);

    await prunePlugin.handler({
      projectConfig,
      datasource,
      parsed: {
        translations: true,
        set: "dev",
        apply: true,
      },
    });

    const devDatasource = datasource.forSet("dev");
    const stagingDatasource = datasource.forSet("staging");
    const devMessage = await devDatasource.readMessage("common.welcome");
    const stagingMessage = await stagingDatasource.readMessage("common.welcome");

    expect(devMessage.translations["en-US"]).toBeUndefined();
    expect(stagingMessage.translations["en-US"]).toEqual("Welcome");
  });

  it("prints preview output with inherited source information", async function () {
    const root = await createProject();
    const { projectConfig, datasource } = getDatasource(root);
    const consoleLogSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      await prunePlugin.handler({
        projectConfig,
        datasource,
        parsed: {
          translations: true,
          target: "web",
        },
      });

      const output = consoleLogSpy.mock.calls.flat().join("\n");

      expect(output).toContain("Prune Messagevisor project");
      expect(output).toContain("common.welcome");
      expect(output).toContain("locale en-US duplicates inherited value from en");
    } finally {
      consoleLogSpy.mockRestore();
    }
  });
});
