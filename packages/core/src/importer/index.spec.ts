import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { getProjectConfig } from "../config";
import { Datasource } from "../datasource";
import { toCsv } from "../exporter";
import { importPlugin, importProject, importProjectSets } from "./index";

async function writeFile(root: string, relativePath: string, content: string) {
  const filePath = path.join(root, relativePath);
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, content);
}

async function createProject() {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-import-"));

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
    "messages/common/welcome.yml",
    "description: Welcome\ntranslations:\n  en: Welcome\n  nl: Welkom\noverrides:\n  - key: pro\n    segments: '*'\n    translations:\n      en: Welcome pro\n",
  );
  await writeFile(
    root,
    "messages/common/goodbye.yml",
    "description: Goodbye\ntranslations:\n  en: Goodbye\n",
  );

  return root;
}

async function createSetsProject() {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-import-sets-"));

  await writeFile(root, "messagevisor.config.js", "module.exports = { sets: true };\n");

  for (const set of ["dev", "production"]) {
    await writeFile(root, `sets/${set}/locales/en.yml`, "description: English\n");
    await writeFile(
      root,
      `sets/${set}/locales/en-US.yml`,
      "description: English US\ninheritTranslationsFrom: en\n",
    );
    await writeFile(root, `sets/${set}/locales/nl.yml`, "description: Dutch\n");
    await writeFile(
      root,
      `sets/${set}/messages/common/welcome.yml`,
      `description: Welcome ${set}\ntranslations:\n  en: Welcome ${set}\n`,
    );
  }

  return root;
}

function getDatasource(root: string) {
  const projectConfig = getProjectConfig(root);
  const datasource = new Datasource(projectConfig, root);

  return { projectConfig, datasource };
}

describe("importProject", function () {
  it("previews direct and override translations by default and applies only with apply", async function () {
    const root = await createProject();
    const { projectConfig, datasource } = getDatasource(root);

    await writeFile(
      root,
      "imports/nl.csv",
      [
        "messageKey,messageDescription,en-US,en-USStatus,nl,nlStatus",
        "common.welcome,Changed description,Welcome,direct,Welkom bijgewerkt,direct",
        "common.welcome:pro,Changed override,Welcome pro,direct,Welkom pro,direct",
      ].join("\n"),
    );

    const preview = await importProject(projectConfig, datasource, {
      input: "imports/nl.csv",
    });
    const previewMessage = await datasource.readMessage("common.welcome");

    expect(preview.apply).toEqual(false);
    expect(preview.summary.changedMessages).toEqual(1);
    expect(preview.summary.changedOverrides).toEqual(1);
    expect(previewMessage.description).toEqual("Welcome");
    expect(previewMessage.translations.nl).toEqual("Welkom");
    expect(previewMessage.translations["en-US"]).toBeUndefined();
    expect(previewMessage.overrides?.[0].translations.nl).toBeUndefined();

    const result = await importProject(projectConfig, datasource, {
      input: "imports/nl.csv",
      apply: true,
    });
    const message = await datasource.readMessage("common.welcome");

    expect(result.apply).toEqual(true);
    expect(message.description).toEqual("Welcome");
    expect(message.translations.nl).toEqual("Welkom bijgewerkt");
    expect(message.translations["en-US"]).toBeUndefined();
    expect(message.overrides?.[0].translations.nl).toEqual("Welkom pro");
  });

  it("imports all locale columns by default", async function () {
    const root = await createProject();
    const { projectConfig, datasource } = getDatasource(root);

    await writeFile(
      root,
      "imports/all-locales.csv",
      ["messageKey,en,nl", "common.welcome,Welcome updated,Welkom bijgewerkt"].join("\n"),
    );

    const result = await importProject(projectConfig, datasource, {
      input: "imports/all-locales.csv",
      apply: true,
    });
    const message = await datasource.readMessage("common.welcome");

    expect(result.summary.changedTranslations).toEqual(2);
    expect(message.translations.en).toEqual("Welcome updated");
    expect(message.translations.nl).toEqual("Welkom bijgewerkt");
  });

  it("imports only requested locale columns", async function () {
    const root = await createProject();
    const { projectConfig, datasource } = getDatasource(root);

    await writeFile(
      root,
      "imports/selected-locale.csv",
      ["messageKey,en,nl", "common.welcome,Welcome updated,Welkom bijgewerkt"].join("\n"),
    );

    const result = await importProject(projectConfig, datasource, {
      input: "imports/selected-locale.csv",
      locale: "nl",
      apply: true,
    });
    const message = await datasource.readMessage("common.welcome");

    expect(result.summary.changedTranslations).toEqual(1);
    expect(message.translations.en).toEqual("Welcome");
    expect(message.translations.nl).toEqual("Welkom bijgewerkt");
    expect(result.warnings).toEqual([]);
  });

  it("imports repeated requested locale columns and rejects unknown requested locales", async function () {
    const root = await createProject();
    const { projectConfig, datasource } = getDatasource(root);

    await writeFile(
      root,
      "imports/repeated-locales.csv",
      ["messageKey,en,en-US,nl", "common.welcome,Welcome updated,Howdy,Welkom bijgewerkt"].join(
        "\n",
      ),
    );

    const result = await importProject(projectConfig, datasource, {
      input: "imports/repeated-locales.csv",
      locale: ["en", "nl"],
      apply: true,
    });
    const message = await datasource.readMessage("common.welcome");

    expect(result.summary.changedTranslations).toEqual(2);
    expect(message.translations.en).toEqual("Welcome updated");
    expect(message.translations.nl).toEqual("Welkom bijgewerkt");
    expect(message.translations["en-US"]).toBeUndefined();

    await expect(
      importProject(projectConfig, datasource, {
        input: "imports/repeated-locales.csv",
        locale: "fr",
      }),
    ).rejects.toThrow('Unknown locale "fr". Available locales: en, en-US, nl.');
  });

  it("skips empty cells and unchanged inherited values", async function () {
    const root = await createProject();
    const { projectConfig, datasource } = getDatasource(root);
    const before = await fs.promises.readFile(
      path.join(root, "messages/common/goodbye.yml"),
      "utf8",
    );

    await writeFile(
      root,
      "imports/inherited.csv",
      ["messageKey,en,en-US,nl", "common.goodbye,,Goodbye,"].join("\n"),
    );

    const result = await importProject(projectConfig, datasource, {
      input: "imports/inherited.csv",
    });
    const after = await fs.promises.readFile(
      path.join(root, "messages/common/goodbye.yml"),
      "utf8",
    );

    expect(result.apply).toEqual(false);
    expect(result.summary.changedTranslations).toEqual(0);
    expect(after).toEqual(before);
  });

  it("previews inherited value changes and applies direct translations when requested", async function () {
    const root = await createProject();
    const { projectConfig, datasource } = getDatasource(root);

    await writeFile(
      root,
      "imports/inherited-changed.csv",
      ["messageKey,en-US", "common.goodbye,Howdy"].join("\n"),
    );

    const preview = await importProject(projectConfig, datasource, {
      input: "imports/inherited-changed.csv",
    });
    const previewMessage = await datasource.readMessage("common.goodbye");

    expect(preview.apply).toEqual(false);
    expect(preview.summary.changedTranslations).toEqual(1);
    expect(previewMessage.translations["en-US"]).toBeUndefined();

    const result = await importProject(projectConfig, datasource, {
      input: "imports/inherited-changed.csv",
      apply: true,
    });
    const message = await datasource.readMessage("common.goodbye");

    expect(result.apply).toEqual(true);
    expect(message.translations["en-US"]).toEqual("Howdy");
  });

  it("prunes imported translations that duplicate inherited values", async function () {
    const root = await createProject();
    const { projectConfig, datasource } = getDatasource(root);

    await writeFile(
      root,
      "imports/prune-inherited.csv",
      ["messageKey,en-US", "common.goodbye,Goodbye"].join("\n"),
    );

    const result = await importProject(projectConfig, datasource, {
      input: "imports/prune-inherited.csv",
      prune: true,
      apply: true,
    });
    const message = await datasource.readMessage("common.goodbye");

    expect(result.summary.changedTranslations).toEqual(0);
    expect(result.summary.prunedTranslations).toEqual(1);
    expect(message.translations.en).toEqual("Goodbye");
    expect(message.translations["en-US"]).toBeUndefined();
  });

  it("deletes existing direct translations when prune can use inheritance", async function () {
    const root = await createProject();
    const { projectConfig, datasource } = getDatasource(root);

    await writeFile(
      root,
      "messages/common/goodbye.yml",
      "description: Goodbye\ntranslations:\n  en: Goodbye\n  en-US: Goodbye\n",
    );
    await writeFile(
      root,
      "messages/common/welcome.yml",
      "description: Welcome\ntranslations:\n  en: Welcome\n  nl: Welkom\noverrides:\n  - key: pro\n    segments: '*'\n    translations:\n      en: Welcome pro\n      en-US: Welcome pro\n",
    );
    await writeFile(
      root,
      "imports/prune-existing.csv",
      ["messageKey,en-US", "common.goodbye,Goodbye", "common.welcome:pro,Welcome pro"].join("\n"),
    );

    const preview = await importProject(projectConfig, datasource, {
      input: "imports/prune-existing.csv",
      prune: true,
    });
    const previewMessage = await datasource.readMessage("common.goodbye");

    expect(preview.apply).toEqual(false);
    expect(preview.summary.changedMessages).toEqual(1);
    expect(preview.summary.changedOverrides).toEqual(1);
    expect(preview.summary.changedTranslations).toEqual(0);
    expect(preview.summary.prunedTranslations).toEqual(2);
    expect(previewMessage.translations["en-US"]).toEqual("Goodbye");

    const result = await importProject(projectConfig, datasource, {
      input: "imports/prune-existing.csv",
      prune: true,
      apply: true,
    });
    const message = await datasource.readMessage("common.goodbye");
    const welcome = await datasource.readMessage("common.welcome");

    expect(result.summary.prunedTranslations).toEqual(2);
    expect(message.translations["en-US"]).toBeUndefined();
    expect(welcome.overrides?.[0].translations["en-US"]).toBeUndefined();
  });

  it("keeps direct translations that differ from inherited values with prune enabled", async function () {
    const root = await createProject();
    const { projectConfig, datasource } = getDatasource(root);

    await writeFile(
      root,
      "imports/prune-different.csv",
      ["messageKey,en-US", "common.goodbye,Howdy"].join("\n"),
    );

    const result = await importProject(projectConfig, datasource, {
      input: "imports/prune-different.csv",
      prune: true,
      apply: true,
    });
    const message = await datasource.readMessage("common.goodbye");

    expect(result.summary.changedTranslations).toEqual(1);
    expect(result.summary.prunedTranslations).toEqual(0);
    expect(message.translations["en-US"]).toEqual("Howdy");
  });

  it("prunes child values against parent values imported in the same CSV", async function () {
    const root = await createProject();
    const { projectConfig, datasource } = getDatasource(root);

    await writeFile(
      root,
      "imports/prune-same-csv.csv",
      ["messageKey,en-US,en", "common.goodbye,Hello,Hello"].join("\n"),
    );

    const result = await importProject(projectConfig, datasource, {
      input: "imports/prune-same-csv.csv",
      prune: true,
      apply: true,
    });
    const message = await datasource.readMessage("common.goodbye");

    expect(result.summary.changedTranslations).toEqual(1);
    expect(result.summary.prunedTranslations).toEqual(1);
    expect(message.translations.en).toEqual("Hello");
    expect(message.translations["en-US"]).toBeUndefined();
  });

  it("warns for unknown entities by default and creates missing messages and overrides when requested", async function () {
    const root = await createProject();
    const { projectConfig, datasource } = getDatasource(root);

    await writeFile(
      root,
      "imports/missing.csv",
      [
        "messageKey,en,nl",
        "common.new,New,Nieuw",
        "common.new:vip,New VIP,Nieuw VIP",
        "common.unknown:vip,Unknown VIP,Onbekend VIP",
      ].join("\n"),
    );

    const preview = await importProject(projectConfig, datasource, {
      input: "imports/missing.csv",
      createMissing: true,
    });

    await expect(datasource.readMessage("common.new")).rejects.toThrow();
    expect(preview.apply).toEqual(false);
    expect(preview.summary.createdMessages).toEqual(1);
    expect(preview.summary.createdOverrides).toEqual(1);

    const result = await importProject(projectConfig, datasource, {
      input: "imports/missing.csv",
      apply: true,
      createMissing: true,
    });
    const created = await datasource.readMessage("common.new");

    expect(result.warnings.join("\n")).toContain("cannot create override");
    expect(created.description).toEqual("");
    expect(created.translations.nl).toEqual("Nieuw");
    expect(created.overrides?.[0]).toEqual({
      key: "vip",
      segments: "*",
      translations: {
        en: "New VIP",
        nl: "Nieuw VIP",
      },
    });
  });

  it("imports flat JSON into the selected locale and previews by default", async function () {
    const root = await createProject();
    const { projectConfig, datasource } = getDatasource(root);

    await writeFile(
      root,
      "imports/nl.json",
      JSON.stringify({
        "common.welcome": "Welkom JSON",
        "common.goodbye": "Tot ziens JSON",
      }),
    );

    const preview = await importProject(projectConfig, datasource, {
      input: "imports/nl.json",
      fromJson: true,
      locale: "nl",
    });
    const previewMessage = await datasource.readMessage("common.welcome");

    expect(preview.apply).toEqual(false);
    expect(preview.summary.rows).toEqual(2);
    expect(preview.summary.changedTranslations).toEqual(2);
    expect(previewMessage.translations.nl).toEqual("Welkom");

    const result = await importProject(projectConfig, datasource, {
      input: "imports/nl.json",
      fromJson: true,
      locale: "nl",
      apply: true,
    });
    const welcome = await datasource.readMessage("common.welcome");
    const goodbye = await datasource.readMessage("common.goodbye");

    expect(result.summary.changedTranslations).toEqual(2);
    expect(welcome.translations.nl).toEqual("Welkom JSON");
    expect(goodbye.translations.nl).toEqual("Tot ziens JSON");
  });

  it("imports JSON from URLs and nested dot paths", async function () {
    const root = await createProject();
    const { projectConfig, datasource } = getDatasource(root);
    const url = "https://example.com/translations.json";
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            translations: {
              "common.welcome": "Welkom URL",
            },
          },
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      ),
    );

    try {
      const result = await importProject(projectConfig, datasource, {
        input: url,
        fromJson: true,
        jsonPath: "data.translations",
        locale: "nl",
        apply: true,
      });
      const message = await datasource.readMessage("common.welcome");

      expect(fetchSpy).toHaveBeenCalledWith(url);
      expect(result.inputFilePath).toEqual(url);
      expect(result.summary.changedTranslations).toEqual(1);
      expect(message.translations.nl).toEqual("Welkom URL");
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("rejects non-OK JSON URL responses", async function () {
    const root = await createProject();
    const { projectConfig, datasource } = getDatasource(root);
    const url = "https://example.com/not-found.json";
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "not found" }), {
        status: 404,
        statusText: "Not Found",
      }),
    );

    try {
      await expect(
        importProject(projectConfig, datasource, {
          input: url,
          fromJson: true,
          locale: "nl",
        }),
      ).rejects.toThrow(`Unable to fetch JSON from ${url}: 404 Not Found`);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("imports JSON override keys and can create missing messages", async function () {
    const root = await createProject();
    const { projectConfig, datasource } = getDatasource(root);

    await writeFile(
      root,
      "imports/override.json",
      JSON.stringify({
        "common.welcome:pro": "Welkom pro JSON",
        "common.created": "Nieuw JSON",
      }),
    );

    const result = await importProject(projectConfig, datasource, {
      input: "imports/override.json",
      fromJson: true,
      locale: "nl",
      createMissing: true,
      apply: true,
    });
    const welcome = await datasource.readMessage("common.welcome");
    const created = await datasource.readMessage("common.created");

    expect(result.summary.changedOverrides).toEqual(1);
    expect(result.summary.createdMessages).toEqual(1);
    expect(welcome.overrides?.[0].translations.nl).toEqual("Welkom pro JSON");
    expect(created.translations.nl).toEqual("Nieuw JSON");
  });

  it("prunes JSON translations that duplicate inherited values", async function () {
    const root = await createProject();
    const { projectConfig, datasource } = getDatasource(root);

    await writeFile(
      root,
      "messages/common/goodbye.yml",
      "description: Goodbye\ntranslations:\n  en: Goodbye\n  en-US: Goodbye\n",
    );
    await writeFile(
      root,
      "imports/prune.json",
      JSON.stringify({
        "common.goodbye": "Goodbye",
      }),
    );

    const result = await importProject(projectConfig, datasource, {
      input: "imports/prune.json",
      fromJson: true,
      locale: "en-US",
      prune: true,
      apply: true,
    });
    const message = await datasource.readMessage("common.goodbye");

    expect(result.summary.prunedTranslations).toEqual(1);
    expect(message.translations["en-US"]).toBeUndefined();
  });

  it("validates JSON import inputs", async function () {
    const root = await createProject();
    const { projectConfig, datasource } = getDatasource(root);

    await writeFile(root, "imports/invalid.json", "{");
    await writeFile(root, "imports/nested.json", JSON.stringify({ data: { translations: [] } }));
    await writeFile(root, "imports/non-string.json", JSON.stringify({ "common.welcome": 1 }));

    await expect(
      importProject(projectConfig, datasource, {
        fromJson: true,
      }),
    ).rejects.toThrow(
      "Pass a JSON file path or URL: messagevisor import <jsonFilePathOrUrl> --from-json --locale=<locale>.",
    );
    await expect(
      importProject(projectConfig, datasource, {
        input: "imports/invalid.json",
        fromJson: true,
      }),
    ).rejects.toThrow("--from-json requires exactly one --locale=<locale>.");
    await expect(
      importProject(projectConfig, datasource, {
        input: "imports/invalid.json",
        fromJson: true,
        locale: ["en", "nl"],
      }),
    ).rejects.toThrow("--from-json requires exactly one --locale=<locale>.");
    await expect(
      importProject(projectConfig, datasource, {
        input: "imports/invalid.json",
        fromJson: true,
        locale: "fr",
      }),
    ).rejects.toThrow('Unknown locale "fr". Available locales: en, en-US, nl.');
    await expect(
      importProject(projectConfig, datasource, {
        input: "imports/invalid.json",
        fromJson: true,
        locale: "nl",
      }),
    ).rejects.toThrow("Invalid JSON: unable to parse input.");
    await expect(
      importProject(projectConfig, datasource, {
        input: "imports/nested.json",
        fromJson: true,
        jsonPath: "data.missing",
        locale: "nl",
      }),
    ).rejects.toThrow('JSON path "data.missing" was not found.');
    await expect(
      importProject(projectConfig, datasource, {
        input: "imports/nested.json",
        fromJson: true,
        jsonPath: "data.translations",
        locale: "nl",
      }),
    ).rejects.toThrow('JSON path "data.translations" must resolve to a flat object.');
    await expect(
      importProject(projectConfig, datasource, {
        input: "imports/non-string.json",
        fromJson: true,
        locale: "nl",
      }),
    ).rejects.toThrow('JSON translation value for "common.welcome" must be a string.');
    await expect(
      importProject(projectConfig, datasource, {
        input: "imports/non-string.json",
        fromJson: true,
        locale: "nl",
        delimiter: ";",
      }),
    ).rejects.toThrow("--delimiter can only be used with CSV imports.");
  });

  it("parses custom CSV dialects with BOM, quotes, commas, newlines, and CRLF", async function () {
    const root = await createProject();
    const { projectConfig, datasource } = getDatasource(root);
    const csv = ["\uFEFFmessageKey;nl", 'common.goodbye;"Tot ziens, ""Ada""', 'morgen"'].join(
      "\r\n",
    );

    await writeFile(root, "imports/dialect.csv", csv);

    const result = await importProject(projectConfig, datasource, {
      input: "imports/dialect.csv",
      apply: true,
      delimiter: ";",
      bom: true,
    });
    const message = await datasource.readMessage("common.goodbye");

    expect(result.summary.changedTranslations).toEqual(1);
    expect(message.translations.nl).toEqual('Tot ziens, "Ada"\nmorgen');
  });

  it("imports quoted multiline translations with quotes and commas", async function () {
    const root = await createProject();
    const { projectConfig, datasource } = getDatasource(root);

    await writeFile(
      root,
      "imports/multiline.csv",
      ["messageKey;nl", 'common.goodbye;"Tot ziens, ""Ada""', 'morgen, graag"'].join("\r\n"),
    );

    const result = await importProject(projectConfig, datasource, {
      input: "imports/multiline.csv",
      apply: true,
      delimiter: ";",
    });
    const message = await datasource.readMessage("common.goodbye");

    expect(result.summary.changedTranslations).toEqual(1);
    expect(message.translations.nl).toEqual('Tot ziens, "Ada"\nmorgen, graag');
  });

  it("imports exported multiline CSV back with normalized line breaks", async function () {
    const root = await createProject();
    const { projectConfig, datasource } = getDatasource(root);
    const translation = ' Leading\nLine, "quoted"\r\nTrailing ';

    await writeFile(
      root,
      "imports/exported-multiline.csv",
      toCsv(["messageKey", "nl"], [["common.goodbye", translation]], {
        lineEnding: "crlf",
      }),
    );

    const result = await importProject(projectConfig, datasource, {
      input: "imports/exported-multiline.csv",
      apply: true,
    });
    const message = await datasource.readMessage("common.goodbye");

    expect(result.summary.changedTranslations).toEqual(1);
    expect(message.translations.nl).toEqual(' Leading\nLine, "quoted"\nTrailing ');
  });

  it("rejects malformed quotes in unquoted fields and after closing quotes", async function () {
    const root = await createProject();
    const { projectConfig, datasource } = getDatasource(root);

    await writeFile(
      root,
      "imports/bad-unquoted-quote.csv",
      ["messageKey,nl", 'common.goodbye,Tot "ziens'].join("\n"),
    );
    await writeFile(
      root,
      "imports/bad-after-quote.csv",
      ["messageKey,nl", 'common.goodbye,"Tot ziens"oops'].join("\n"),
    );

    await expect(
      importProject(projectConfig, datasource, {
        input: "imports/bad-unquoted-quote.csv",
      }),
    ).rejects.toThrow("Invalid CSV: unexpected quote in unquoted field.");
    await expect(
      importProject(projectConfig, datasource, {
        input: "imports/bad-after-quote.csv",
      }),
    ).rejects.toThrow("Invalid CSV: unexpected character after closing quote.");
  });

  it("rejects extra row cells and accepts fewer row cells as empty", async function () {
    const root = await createProject();
    const { projectConfig, datasource } = getDatasource(root);

    await writeFile(
      root,
      "imports/extra-cells.csv",
      ["messageKey,nl", "common.goodbye,Tot ziens,extra"].join("\n"),
    );

    await expect(
      importProject(projectConfig, datasource, {
        input: "imports/extra-cells.csv",
      }),
    ).rejects.toThrow("Invalid CSV: row 2 has 3 cells but only 2 headers.");

    await writeFile(
      root,
      "imports/fewer-cells.csv",
      ["messageKey,en,nl", "common.goodbye,Goodbye updated"].join("\n"),
    );

    const result = await importProject(projectConfig, datasource, {
      input: "imports/fewer-cells.csv",
      apply: true,
    });
    const message = await datasource.readMessage("common.goodbye");

    expect(result.summary.changedTranslations).toEqual(1);
    expect(message.translations.en).toEqual("Goodbye updated");
    expect(message.translations.nl).toBeUndefined();
  });
});

describe("importProjectSets", function () {
  it("previews routed set rows by default and applies only selected sets with apply", async function () {
    const root = await createSetsProject();
    const { projectConfig, datasource } = getDatasource(root);

    await writeFile(
      root,
      "imports/sets.csv",
      [
        "set,messageKey,en,nl",
        "dev,common.welcome,Dev updated,Dev NL",
        "production,common.welcome,Production updated,Production NL",
      ].join("\n"),
    );

    const preview = await importProjectSets(projectConfig, datasource, {
      input: "imports/sets.csv",
      set: "production",
    });
    const previewDevMessage = await datasource.forSet("dev").readMessage("common.welcome");
    const previewProductionMessage = await datasource
      .forSet("production")
      .readMessage("common.welcome");

    expect(preview.apply).toEqual(false);
    expect(preview.summary.sets).toEqual(["production"]);
    expect(previewDevMessage.translations.en).toEqual("Welcome dev");
    expect(previewProductionMessage.translations.en).toEqual("Welcome production");
    expect(previewProductionMessage.translations.nl).toBeUndefined();

    const result = await importProjectSets(projectConfig, datasource, {
      input: "imports/sets.csv",
      set: "production",
      apply: true,
    });
    const devMessage = await datasource.forSet("dev").readMessage("common.welcome");
    const productionMessage = await datasource.forSet("production").readMessage("common.welcome");

    expect(result.apply).toEqual(true);
    expect(result.summary.sets).toEqual(["production"]);
    expect(devMessage.translations.en).toEqual("Welcome dev");
    expect(productionMessage.translations.en).toEqual("Production updated");
    expect(productionMessage.translations.nl).toEqual("Production NL");
  });

  it("requires one set when CSV has no set column", async function () {
    const root = await createSetsProject();
    const { projectConfig, datasource } = getDatasource(root);

    await writeFile(
      root,
      "imports/no-set.csv",
      ["messageKey,nl", "common.welcome,Welkom"].join("\n"),
    );

    await expect(
      importProjectSets(projectConfig, datasource, {
        input: "imports/no-set.csv",
      }),
    ).rejects.toThrow('CSV without a "set" column requires exactly one --set=<set>.');

    const result = await importProjectSets(projectConfig, datasource, {
      input: "imports/no-set.csv",
      set: "dev",
      apply: true,
    });
    const message = await datasource.forSet("dev").readMessage("common.welcome");

    expect(result.summary.changedTranslations).toEqual(1);
    expect(message.translations.nl).toEqual("Welkom");
  });

  it("warns and skips unknown sets", async function () {
    const root = await createSetsProject();
    const { projectConfig, datasource } = getDatasource(root);

    await writeFile(
      root,
      "imports/unknown-set.csv",
      ["set,messageKey,nl", "qa,common.welcome,Welkom"].join("\n"),
    );

    const result = await importProjectSets(projectConfig, datasource, {
      input: "imports/unknown-set.csv",
    });

    expect(result.summary.skippedRows).toEqual(1);
    expect(result.warnings.join("\n")).toContain('unknown set "qa"');
  });

  it("prunes inherited translations independently per set", async function () {
    const root = await createSetsProject();
    const { projectConfig, datasource } = getDatasource(root);

    await writeFile(
      root,
      "imports/prune-sets.csv",
      [
        "set,messageKey,en-US",
        "dev,common.welcome,Welcome dev",
        "production,common.welcome,Production US",
      ].join("\n"),
    );

    const result = await importProjectSets(projectConfig, datasource, {
      input: "imports/prune-sets.csv",
      prune: true,
      apply: true,
    });
    const devMessage = await datasource.forSet("dev").readMessage("common.welcome");
    const productionMessage = await datasource.forSet("production").readMessage("common.welcome");

    expect(result.summary.changedTranslations).toEqual(1);
    expect(result.summary.prunedTranslations).toEqual(1);
    expect(devMessage.translations["en-US"]).toBeUndefined();
    expect(productionMessage.translations["en-US"]).toEqual("Production US");
  });

  it("imports JSON into exactly one requested set", async function () {
    const root = await createSetsProject();
    const { projectConfig, datasource } = getDatasource(root);

    await writeFile(
      root,
      "imports/sets.json",
      JSON.stringify({
        "common.welcome": "Welkom staging JSON",
      }),
    );

    await expect(
      importProjectSets(projectConfig, datasource, {
        input: "imports/sets.json",
        fromJson: true,
        locale: "nl",
      }),
    ).rejects.toThrow(
      "--from-json requires exactly one --set=<set> when `sets: true` is configured.",
    );

    const result = await importProjectSets(projectConfig, datasource, {
      input: "imports/sets.json",
      fromJson: true,
      set: "dev",
      locale: "nl",
      apply: true,
    });
    const devMessage = await datasource.forSet("dev").readMessage("common.welcome");
    const productionMessage = await datasource.forSet("production").readMessage("common.welcome");

    expect(result.summary.sets).toEqual(["dev"]);
    expect(result.summary.changedTranslations).toEqual(1);
    expect(devMessage.translations.nl).toEqual("Welkom staging JSON");
    expect(productionMessage.translations.nl).toBeUndefined();
  });
});

describe("importPlugin", function () {
  it("prints expected input errors without throwing", async function () {
    const root = await createProject();
    const { projectConfig, datasource } = getDatasource(root);
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      await expect(
        importPlugin.handler({
          projectConfig,
          datasource,
          parsed: {},
        }),
      ).resolves.toEqual(false);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Pass a CSV file path: messagevisor import <csvFilePath>.",
      );
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("prints preview and apply modes from the CLI", async function () {
    const root = await createProject();
    const { projectConfig, datasource } = getDatasource(root);
    const consoleLogSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

    await writeFile(
      root,
      "imports/nl.csv",
      ["messageKey,nl", "common.welcome,Welkom CLI"].join("\n"),
    );

    try {
      await importPlugin.handler({
        projectConfig,
        datasource,
        parsed: {
          input: "imports/nl.csv",
        },
      });

      const previewOutput = consoleLogSpy.mock.calls.flat().join("\n");
      const previewMessage = await datasource.readMessage("common.welcome");

      expect(previewOutput).toContain("Mode: preview");
      expect(previewOutput).toContain("Import preview complete");
      expect(previewMessage.translations.nl).toEqual("Welkom");

      consoleLogSpy.mockClear();

      await importPlugin.handler({
        projectConfig,
        datasource,
        parsed: {
          input: "imports/nl.csv",
          apply: true,
        },
      });

      const applyOutput = consoleLogSpy.mock.calls.flat().join("\n");
      const appliedMessage = await datasource.readMessage("common.welcome");

      expect(applyOutput).toContain("Mode: apply");
      expect(applyOutput).toContain("Pruned translations:   0");
      expect(applyOutput).toContain("Import applied");
      expect(appliedMessage.translations.nl).toEqual("Welkom CLI");
    } finally {
      consoleLogSpy.mockRestore();
    }
  });

  it("passes parsed locale filters from the CLI", async function () {
    const root = await createProject();
    const { projectConfig, datasource } = getDatasource(root);
    const consoleLogSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

    await writeFile(
      root,
      "imports/cli-locales.csv",
      ["messageKey,en,nl", "common.welcome,Welcome CLI,Welkom CLI"].join("\n"),
    );

    try {
      await importPlugin.handler({
        projectConfig,
        datasource,
        parsed: {
          input: "imports/cli-locales.csv",
          locale: "nl",
          apply: true,
        },
      });

      const message = await datasource.readMessage("common.welcome");

      expect(message.translations.en).toEqual("Welcome");
      expect(message.translations.nl).toEqual("Welkom CLI");
    } finally {
      consoleLogSpy.mockRestore();
    }
  });

  it("passes parsed prune option from the CLI", async function () {
    const root = await createProject();
    const { projectConfig, datasource } = getDatasource(root);
    const consoleLogSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

    await writeFile(
      root,
      "imports/cli-prune.csv",
      ["messageKey,en-US", "common.goodbye,Goodbye"].join("\n"),
    );

    try {
      await importPlugin.handler({
        projectConfig,
        datasource,
        parsed: {
          input: "imports/cli-prune.csv",
          prune: true,
          apply: true,
        },
      });

      const output = consoleLogSpy.mock.calls.flat().join("\n");
      const message = await datasource.readMessage("common.goodbye");

      expect(output).toContain("Pruned translations:   1");
      expect(message.translations["en-US"]).toBeUndefined();
    } finally {
      consoleLogSpy.mockRestore();
    }
  });

  it("passes parsed JSON import options from the CLI", async function () {
    const root = await createProject();
    const { projectConfig, datasource } = getDatasource(root);
    const consoleLogSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

    await writeFile(
      root,
      "imports/cli-json.json",
      JSON.stringify({
        payload: {
          translations: {
            "common.welcome": "Welkom CLI JSON",
          },
        },
      }),
    );

    try {
      await importPlugin.handler({
        projectConfig,
        datasource,
        parsed: {
          input: "imports/cli-json.json",
          fromJson: true,
          jsonPath: "payload.translations",
          locale: "nl",
          apply: true,
          prune: true,
          createMissing: true,
        },
      });

      const output = consoleLogSpy.mock.calls.flat().join("\n");
      const message = await datasource.readMessage("common.welcome");

      expect(output).toContain("Mode: apply");
      expect(message.translations.nl).toEqual("Welkom CLI JSON");
    } finally {
      consoleLogSpy.mockRestore();
    }
  });
});
