import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { getProjectConfig } from "../config";
import { Datasource } from "../datasource";
import { exportPlugin, exportProject, exportProjectSets, toCsv } from "./index";

async function writeFile(root: string, relativePath: string, content: string) {
  const filePath = path.join(root, relativePath);
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, content);
}

async function createProject() {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-export-"));

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
    "targets/web.yml",
    "description: Web\nincludeMessages:\n  - common*\n  - dashboard*\nexcludeMessages:\n  - common.hidden\nlocales:\n  - en-US\n  - nl\n",
  );
  await writeFile(
    root,
    "targets/admin.yml",
    "description: Admin\nincludeMessages:\n  - admin*\nlocales:\n  - en-US\n",
  );
  await writeFile(
    root,
    "segments/pro.yml",
    "description: Pro\nconditions:\n  - attribute: plan\n    operator: equals\n    value: pro\n",
  );
  await writeFile(root, "attributes/plan.yml", "description: Plan\ntype: string\n");
  await writeFile(
    root,
    "messages/common/welcome.yml",
    "description: Welcome, translator\nsummary: Welcome summary\ntranslations:\n  en: Welcome\n  nl: Welkom\noverrides:\n  - key: pro\n    description: Welcome for Pro users\n    summary: Pro welcome summary\n    segments: pro\n    translations:\n      en: Welcome pro\n      nl: Welkom pro\n",
  );
  await writeFile(
    root,
    "messages/common/goodbye.yml",
    "description: Goodbye\ntranslations:\n  en: Goodbye\n",
  );
  await writeFile(
    root,
    "messages/common/hidden.yml",
    "description: Hidden\ntranslations:\n  en: Hidden\n  nl: Verborgen\n",
  );
  await writeFile(
    root,
    "messages/common/draft.yml",
    "description: Draft\ntranslations:\n  en: Draft\n  nl: Concept\n",
  );
  await writeFile(
    root,
    "messages/common/archived.yml",
    "description: Archived\narchived: true\ntranslations:\n  en: Archived\n  nl: Gearchiveerd\n",
  );
  await writeFile(
    root,
    "messages/dashboard/quote.yml",
    'description: "Quote, newline"\ntranslations:\n  en: "Hello, \\"Ada\\"\\nWelcome"\n  nl: "Hallo, \\"Ada\\"\\nWelkom"\n',
  );
  await writeFile(
    root,
    "messages/admin/secret.yml",
    "description: Admin secret\ntranslations:\n  en: Secret\n",
  );

  return root;
}

async function createSetsProject() {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-export-sets-"));

  await writeFile(root, "messagevisor.config.js", "module.exports = { sets: true };\n");

  for (const set of ["dev", "production"]) {
    await writeFile(root, `sets/${set}/locales/en.yml`, "description: English\n");
    await writeFile(root, `sets/${set}/locales/nl.yml`, "description: Dutch\n");
    await writeFile(
      root,
      `sets/${set}/targets/web.yml`,
      "description: Web\nincludeMessages:\n  - common*\nlocales:\n  - en\n  - nl\n",
    );
    await writeFile(
      root,
      `sets/${set}/messages/common/welcome.yml`,
      `description: Welcome ${set}\ntranslations:\n  en: Welcome ${set}\n  nl: Welkom ${set}\n`,
    );
  }

  return root;
}

function getDatasource(root: string) {
  const projectConfig = getProjectConfig(root);
  const datasource = new Datasource(projectConfig, root);

  return {
    projectConfig,
    datasource,
  };
}

describe("exportProject", function () {
  it("validates export separator configuration and entity filenames", async function () {
    const invalidRoot = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "messagevisor-export-config-"),
    );

    await writeFile(
      invalidRoot,
      "messagevisor.config.js",
      'module.exports = { namespaceCharacter: ".", exportOverrideKeySeparator: "." };\n',
    );

    expect(() => getProjectConfig(invalidRoot)).toThrow(
      'Invalid exportOverrideKeySeparator: it cannot be the same as namespaceCharacter ".".',
    );

    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-export-config-"));

    await writeFile(
      root,
      "messagevisor.config.js",
      'module.exports = { exportOverrideKeySeparator: ":" };\n',
    );
    await writeFile(
      root,
      "messages/common/wel:come.yml",
      "description: Bad\ntranslations:\n  en: Bad\n",
    );

    const { datasource } = getDatasource(root);

    await expect(datasource.listMessages()).rejects.toThrow(
      'exportOverrideKeySeparator ":" is not allowed in directory or file names',
    );
  });

  it("exports messages, summaries, overrides, inherited translations, and escaped CSV", async function () {
    const root = await createProject();
    const { projectConfig, datasource } = getDatasource(root);

    const result = await exportProject(projectConfig, datasource, {
      print: true,
      target: "web",
      locale: ["en-US", "nl"],
    });

    expect(result.filePath).toBeUndefined();
    expect(result.csv).toContain("messageKey,messageDescription,en-US,en-USStatus,nl,nlStatus");
    expect(result.csv).toContain("common.welcome,Welcome summary,Welcome,inherited,Welkom,direct");
    expect(result.csv).toContain(
      "common.welcome:pro,Pro welcome summary,Welcome pro,inherited,Welkom pro,direct",
    );
    expect(result.csv).toContain("common.goodbye,Goodbye,Goodbye,inherited,,missing");
    expect(result.csv).toContain('dashboard.quote,"Quote, newline","Hello, ""Ada""');
    expect(result.csv).toContain('Welcome"');
    expect(result.csv).not.toContain("common.hidden");
    expect(result.csv).toContain("common.draft");
    expect(result.csv).not.toContain("common.archived");
    expect(fs.existsSync(path.join(root, "exports"))).toEqual(false);
  });

  it("exports all locales by default and repeated locale filters in order", async function () {
    const root = await createProject();
    const { projectConfig, datasource } = getDatasource(root);

    const allLocales = await exportProject(projectConfig, datasource, {
      print: true,
      includeMessages: "common.welcome",
      withoutDescription: true,
      withoutStatus: true,
    });
    const selectedLocales = await exportProject(projectConfig, datasource, {
      print: true,
      locale: ["en", "nl"],
      includeMessages: "common.welcome",
      withoutDescription: true,
      withoutStatus: true,
    });

    expect(allLocales.csv.split("\n")[0]).toEqual("messageKey,en,en-US,nl");
    expect(allLocales.summary.locales).toEqual(["en", "en-US", "nl"]);
    expect(selectedLocales.csv.split("\n")[0]).toEqual("messageKey,en,nl");
    expect(selectedLocales.summary.locales).toEqual(["en", "nl"]);
  });

  it("escapes multiline, quoted, delimiter-heavy translations exactly", function () {
    const csv = toCsv(
      ["messageKey", "messageDescription", "en"],
      [
        [
          "common.multiline",
          ' Leading description; with "quotes" ',
          ' Leading\nLine; "quoted"\r\nTrailing ',
        ],
      ],
      {
        delimiter: ";",
      },
    );

    expect(csv).toEqual(
      [
        "messageKey;messageDescription;en",
        'common.multiline;" Leading description; with ""quotes"" ";" Leading\nLine; ""quoted""\r\nTrailing "',
      ].join("\n"),
    );
  });

  it("filters by locale, include/exclude messages, and excludes overrides", async function () {
    const root = await createProject();
    const { projectConfig, datasource } = getDatasource(root);

    const result = await exportProject(projectConfig, datasource, {
      print: true,
      locale: "nl",
      includeMessages: "common*",
      excludeMessages: "common.goodbye",
      excludeOverrides: true,
      withoutDescription: true,
      withoutStatus: true,
    });

    expect(result.csv).toEqual(
      [
        "messageKey,nl",
        "common.draft,Concept",
        "common.hidden,Verborgen",
        "common.welcome,Welkom",
      ].join("\n"),
    );
  });

  it("supports inherited and directly untranslated filters", async function () {
    const root = await createProject();
    const { projectConfig, datasource } = getDatasource(root);

    const inherited = await exportProject(projectConfig, datasource, {
      print: true,
      locale: "en-US",
      includeMessages: "common.goodbye",
      onlyUntranslated: true,
    });
    const direct = await exportProject(projectConfig, datasource, {
      print: true,
      locale: "en-US",
      includeMessages: "common.goodbye",
      onlyDirectlyUntranslated: true,
    });

    expect(inherited.csv).toEqual("messageKey,messageDescription,en-US,en-USStatus");
    expect(direct.csv).toContain("common.goodbye,Goodbye,Goodbye,inherited");
  });

  it("accepts summary on messages and overrides while falling back to description when absent", async function () {
    const root = await createProject();
    const { projectConfig, datasource } = getDatasource(root);

    const result = await exportProject(projectConfig, datasource, {
      print: true,
      locale: "en-US",
      includeMessages: ["common.welcome", "common.goodbye"],
    });

    expect(result.csv).toContain("common.welcome,Welcome summary,Welcome,inherited");
    expect(result.csv).toContain("common.welcome:pro,Pro welcome summary,Welcome pro,inherited");
    expect(result.csv).toContain("common.goodbye,Goodbye,Goodbye,inherited");
  });

  it("fails when both untranslated filters are requested", async function () {
    const root = await createProject();
    const { projectConfig, datasource } = getDatasource(root);

    await expect(
      exportProject(projectConfig, datasource, {
        print: true,
        onlyUntranslated: true,
        onlyDirectlyUntranslated: true,
      }),
    ).rejects.toThrow("Use either --onlyUntranslated or --onlyDirectlyUntranslated, not both.");
  });

  it("writes exports and creates collision-safe file names", async function () {
    const root = await createProject();
    const { projectConfig, datasource } = getDatasource(root);
    const now = new Date(2026, 3, 19, 12, 34, 56);

    const first = await exportProject(projectConfig, datasource, {
      now,
      locale: "en",
      includeMessages: "common.welcome",
    });
    const second = await exportProject(projectConfig, datasource, {
      now,
      locale: "en",
      includeMessages: "common.welcome",
    });

    expect(path.basename(first.filePath || "")).toEqual("messagevisor-export-20260419T123456.csv");
    expect(path.basename(second.filePath || "")).toEqual(
      "messagevisor-export-20260419T123456-1.csv",
    );
    expect(await fs.promises.readFile(first.filePath || "", "utf8")).toContain("common.welcome");
    expect(first.summary).toEqual({
      messageRows: 1,
      overrideRows: 1,
      totalRows: 2,
      locales: ["en"],
      sets: [],
    });
  });

  it("supports output paths, force overwrites, and CSV dialect options", async function () {
    const root = await createProject();
    const { projectConfig, datasource } = getDatasource(root);
    const output = "translator/custom.csv";

    const first = await exportProject(projectConfig, datasource, {
      output,
      force: true,
      locale: "en",
      includeMessages: "dashboard.quote",
      delimiter: ";",
      bom: true,
      lineEnding: "crlf",
    });

    await expect(
      exportProject(projectConfig, datasource, {
        output,
        locale: "en",
        includeMessages: "dashboard.quote",
      }),
    ).rejects.toThrow("Pass --force to overwrite.");

    const content = await fs.promises.readFile(first.filePath || "", "utf8");

    expect(first.filePath).toEqual(path.join(root, "translator/custom.csv"));
    expect(content.startsWith("\uFEFFmessageKey;messageDescription;en;enStatus\r\n")).toEqual(true);
    expect(content).toContain('"Hello, ""Ada""\nWelcome";direct');
  });

  it("validates mutually exclusive print/output and delimiter length", async function () {
    const root = await createProject();
    const { projectConfig, datasource } = getDatasource(root);

    await expect(
      exportProject(projectConfig, datasource, {
        print: true,
        output: "exports/out.csv",
      }),
    ).rejects.toThrow("Use either --print or --output, not both.");
    await expect(
      exportProject(projectConfig, datasource, {
        print: true,
        delimiter: "::",
      }),
    ).rejects.toThrow("--delimiter must be a single character.");
  });
});

describe("exportPlugin", function () {
  it("prints expected option errors without throwing", async function () {
    const root = await createProject();
    const { projectConfig, datasource } = getDatasource(root);
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    try {
      await expect(
        exportPlugin.handler({
          projectConfig,
          datasource,
          parsed: {
            print: true,
            output: "exports/out.csv",
          },
        }),
      ).resolves.toEqual(false);

      expect(errorSpy).toHaveBeenCalledWith("Use either --print or --output, not both.");
    } finally {
      errorSpy.mockRestore();
    }
  });
});

describe("exportProjectSets", function () {
  it("exports all sets by default with a set column", async function () {
    const root = await createSetsProject();
    const { projectConfig, datasource } = getDatasource(root);

    const result = await exportProjectSets(projectConfig, datasource, {
      print: true,
      locale: "en",
    });

    expect(result.csv).toEqual(
      [
        "set,messageKey,messageDescription,en,enStatus",
        "dev,common.welcome,Welcome dev,Welcome dev,direct",
        "production,common.welcome,Welcome production,Welcome production,direct",
      ].join("\n"),
    );
    expect(result.summary).toEqual({
      messageRows: 2,
      overrideRows: 0,
      totalRows: 2,
      locales: ["en"],
      sets: ["dev", "production"],
    });
  });

  it("exports selected sets only", async function () {
    const root = await createSetsProject();
    const { projectConfig, datasource } = getDatasource(root);

    const result = await exportProjectSets(projectConfig, datasource, {
      print: true,
      set: "production",
      target: "web",
      locale: ["en", "nl"],
    });

    expect(result.csv).toEqual(
      [
        "set,messageKey,messageDescription,en,enStatus,nl,nlStatus",
        "production,common.welcome,Welcome production,Welcome production,direct,Welkom production,direct",
      ].join("\n"),
    );
  });
});
