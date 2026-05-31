import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { getProjectConfig } from "../config";
import { Datasource } from "../datasource";
import { findDuplicateTranslations, findDuplicatesPlugin } from "./index";

async function writeFile(root: string, relativePath: string, content: string) {
  const filePath = path.join(root, relativePath);
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, content);
}

async function createProject() {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-duplicates-"));

  await writeFile(root, "messagevisor.config.js", "module.exports = {};\n");
  await writeFile(root, "locales/en.yml", "description: English\n");
  await writeFile(
    root,
    "locales/en-US.yml",
    "description: English US\ninheritTranslationsFrom: en\n",
  );
  await writeFile(root, "locales/nl.yml", "description: Dutch\n");
  await writeFile(
    root,
    "messages/actions/save.yml",
    "description: Save action\ntranslations:\n  en: Save\n  nl: Opslaan\n",
  );
  await writeFile(
    root,
    "messages/common/save.yml",
    "description: Common save\ntranslations:\n  en: Save\n  en-US: Save\n  nl: Opslaan\n",
  );
  await writeFile(
    root,
    "messages/actions/cancel.yml",
    "description: Cancel action\ntranslations:\n  en: Cancel\n  nl: Annuleren\n",
  );
  await writeFile(
    root,
    "messages/override-only.yml",
    [
      "description: Override should not count",
      "translations:",
      "  en: Unique base",
      "overrides:",
      "  - key: duplicate",
      "    segments: '*'",
      "    translations:",
      "      en: Save",
      "",
    ].join("\n"),
  );
  await writeFile(
    root,
    "messages/empty/one.yml",
    "description: Empty one\ntranslations:\n  en: ''\n  nl: '   '\n",
  );
  await writeFile(
    root,
    "messages/empty/two.yml",
    "description: Empty two\ntranslations:\n  en: ''\n  nl: '   '\n",
  );
  await writeFile(
    root,
    "messages/archived/save.yml",
    "description: Archived save\narchived: true\ntranslations:\n  en: Save\n  nl: Opslaan\n",
  );

  return root;
}

async function createSetsProject() {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-duplicates-sets-"));

  await writeFile(root, "messagevisor.config.js", "module.exports = { sets: true };\n");

  for (const set of ["dev", "production"]) {
    await writeFile(root, `sets/${set}/locales/en.yml`, "description: English\n");
    await writeFile(
      root,
      `sets/${set}/messages/actions/save.yml`,
      `description: Save ${set}\ntranslations:\n  en: Save ${set}\n`,
    );
    await writeFile(
      root,
      `sets/${set}/messages/common/save.yml`,
      `description: Common save ${set}\ntranslations:\n  en: Save ${set}\n`,
    );
  }

  return root;
}

function getDatasource(root: string) {
  const projectConfig = getProjectConfig(root);
  const datasource = new Datasource(projectConfig, root);

  return { projectConfig, datasource };
}

function stripAnsi(value: string) {
  return value.replace(/\x1b\[[0-9;]*m/g, "");
}

describe("findDuplicateTranslations", function () {
  it("finds direct and inherited duplicate translations grouped by locale", async function () {
    const root = await createProject();
    const { projectConfig, datasource } = getDatasource(root);

    const result = await findDuplicateTranslations(projectConfig, datasource);

    expect(result.summary).toEqual({
      sets: 1,
      locales: 3,
      duplicateValues: 3,
      duplicateMessageKeys: 6,
    });
    expect(result.results[0].set).toEqual(null);
    expect(result.results[0].locales.map((entry) => entry.locale)).toEqual(["en", "en-US", "nl"]);

    const enUsDuplicate = result.results[0].locales
      .find((entry) => entry.locale === "en-US")
      ?.duplicateValues.find((entry) => entry.value === "Save");

    expect(enUsDuplicate).toEqual({
      value: "Save",
      messageKeys: ["actions.save", "common.save"],
      sources: [
        { messageKey: "actions.save", locale: "en" },
        { messageKey: "common.save", locale: "en-US" },
      ],
    });
  });

  it("ignores overrides, empty values, whitespace-only values, and archived messages", async function () {
    const root = await createProject();
    const { projectConfig, datasource } = getDatasource(root);

    const result = await findDuplicateTranslations(projectConfig, datasource, {
      locale: "en",
    });

    const values = result.results[0].locales[0].duplicateValues;

    expect(values).toHaveLength(1);
    expect(values[0].value).toEqual("Save");
    expect(values[0].messageKeys).toEqual(["actions.save", "common.save"]);
    expect(values[0].messageKeys).not.toContain("override-only");
    expect(values[0].messageKeys).not.toContain("empty.one");
    expect(values[0].messageKeys).not.toContain("empty.two");
    expect(values[0].messageKeys).not.toContain("archived.save");
  });

  it("filters by locale and reports empty results cleanly", async function () {
    const root = await createProject();
    const { projectConfig, datasource } = getDatasource(root);

    const result = await findDuplicateTranslations(projectConfig, datasource, {
      locale: "fr",
    }).catch((error) => error);

    expect(result.message).toContain('Unknown locale "fr"');

    await writeFile(
      root,
      "messages/common/save.yml",
      "description: Common save\ntranslations:\n  en: Store\n  nl: Bewaren\n",
    );

    const empty = await findDuplicateTranslations(projectConfig, datasource, {
      locale: "en-US",
    });

    expect(empty.summary).toEqual({
      sets: 1,
      locales: 0,
      duplicateValues: 0,
      duplicateMessageKeys: 0,
    });
    expect(empty.results).toEqual([{ set: null, locales: [] }]);
  });

  it("scans sets independently by default and narrows to one set with --set", async function () {
    const root = await createSetsProject();
    const { projectConfig, datasource } = getDatasource(root);

    const allSets = await findDuplicateTranslations(projectConfig, datasource);

    expect(allSets.summary).toEqual({
      sets: 2,
      locales: 2,
      duplicateValues: 2,
      duplicateMessageKeys: 4,
    });
    expect(allSets.results.map((entry) => entry.set)).toEqual(["dev", "production"]);
    expect(allSets.results[0].locales[0].duplicateValues[0].value).toEqual("Save dev");
    expect(allSets.results[1].locales[0].duplicateValues[0].value).toEqual("Save production");

    const production = await findDuplicateTranslations(projectConfig, datasource, {
      set: "production",
    });

    expect(production.summary).toEqual({
      sets: 1,
      locales: 1,
      duplicateValues: 1,
      duplicateMessageKeys: 2,
    });
    expect(production.results.map((entry) => entry.set)).toEqual(["production"]);
  });
});

describe("findDuplicatesPlugin", function () {
  it("prints readable duplicate output", async function () {
    const root = await createProject();
    const { projectConfig, datasource } = getDatasource(root);
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

    await findDuplicatesPlugin.handler({
      projectConfig,
      datasource,
      parsed: { locale: "en-US" },
    });

    const rawOutput = logSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    const output = stripAnsi(rawOutput);

    expect(rawOutput).toContain("\x1b[1m");
    expect(rawOutput).toContain("\x1b[33m");
    expect(output).toContain("Finding duplicate Messagevisor translations");
    expect(output).toContain("Duplicate values:  1");
    expect(output).toContain('Locale "en-US"');
    expect(output).toContain('"Save"');
    expect(output).toContain("- actions.save (from en)");
    expect(output).toContain("- common.save");
    expect(output).toContain("Duplicate scan complete: 1 value(s) across 1 locale(s).");

    logSpy.mockRestore();
  });

  it("prints JSON output and respects --pretty", async function () {
    const root = await createProject();
    const { projectConfig, datasource } = getDatasource(root);
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

    await findDuplicatesPlugin.handler({
      projectConfig,
      datasource,
      parsed: { locale: "en-US", json: true, pretty: true },
    });

    const output = logSpy.mock.calls[0][0];

    expect(output).toContain('\n  "summary":');
    expect(JSON.parse(output).results[0].locales[0].duplicateValues[0]).toEqual({
      value: "Save",
      messageKeys: ["actions.save", "common.save"],
      sources: [
        { messageKey: "actions.save", locale: "en" },
        { messageKey: "common.save", locale: "en-US" },
      ],
    });

    logSpy.mockRestore();
  });

  it("returns false and prints a friendly message for expected errors", async function () {
    const root = await createProject();
    const { projectConfig, datasource } = getDatasource(root);
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      findDuplicatesPlugin.handler({
        projectConfig,
        datasource,
        parsed: { set: "dev" },
      }),
    ).resolves.toEqual(false);

    expect(errorSpy).toHaveBeenCalledWith(
      "Option --set can only be used when project sets are enabled.",
    );

    errorSpy.mockRestore();
  });
});
