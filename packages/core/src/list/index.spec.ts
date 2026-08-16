import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { getProjectConfig } from "../config";
import { Datasource } from "../datasource";
import { formatDatafileSize, listPlugin } from "./index";

async function writeFile(root: string, relativePath: string, content: string) {
  const filePath = path.join(root, relativePath);
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, content);
}

async function createProject() {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-list-"));

  await writeFile(root, "messagevisor.config.js", "module.exports = {};\n");
  await writeFile(
    root,
    "locales/en.yml",
    "description: English\npromotable: true\nformats:\n  number:\n    money:\n      style: currency\n      currency: USD\n",
  );
  await writeFile(
    root,
    "locales/en-US.yml",
    "description: English US\ninheritFormatsFrom: en\ninheritTranslationsFrom: en\n",
  );
  await writeFile(root, "locales/nl.yml", "description: Dutch\n");
  await writeFile(
    root,
    "attributes/plan.yml",
    "description: Plan\npromotable: true\ntype: string\n",
  );
  await writeFile(
    root,
    "attributes/birthDate.yml",
    "description: Birth date\narchived: true\ntype: date\n",
  );
  await writeFile(
    root,
    "segments/pro.yml",
    "description: Pro segment\npromotable: false\nconditions:\n  - attribute: plan\n    operator: equals\n    value: pro\n",
  );
  await writeFile(
    root,
    "segments/archived.yml",
    "description: Archived segment\narchived: true\nconditions:\n  - attribute: plan\n    operator: equals\n    value: archived\n",
  );
  await writeFile(
    root,
    "messages/common/welcome.yml",
    [
      "description: Welcome message",
      "promotable: false",
      "deprecated: true",
      "meta:",
      "  screen: home",
      "translations:",
      "  en: Welcome",
      "  en-US: Welcome US",
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
    "messages/common/plain.yml",
    "description: Plain message\ntranslations:\n  en: Plain\n",
  );
  await writeFile(
    root,
    "messages/common/draft.yml",
    "description: Draft message\ntranslations:\n  en: Draft\n",
  );
  await writeFile(
    root,
    "messages/common/archived.yml",
    "description: Archived message\narchived: true\ntranslations:\n  en: Archived\n",
  );
  await writeFile(
    root,
    "targets/web.yml",
    [
      "description: Web target",
      "promotable: false",
      "includeMessages:",
      "  - common*",
      "locales:",
      "  - en",
      "  - en-US",
      "context:",
      "  platform: web",
      "formats:",
      "  en:",
      "    number:",
      "      webMoney:",
      "        style: currency",
      "        currency: USD",
      "",
    ].join("\n"),
  );
  await writeFile(
    root,
    "targets/admin.yml",
    "description: Admin target\nincludeMessages:\n  - admin*\nlocales:\n  - nl\n",
  );
  await writeFile(
    root,
    "tests/messages/common/welcome.spec.yml",
    "message: common.welcome\nassertions:\n  - locale: en\n    target: web\n    expectedTranslation: Welcome\n",
  );
  await writeFile(
    root,
    "tests/segments/pro.spec.yml",
    "segment: pro\nassertions:\n  - expectedToMatch: true\n    context:\n      plan: pro\n",
  );
  await writeFile(
    root,
    "tests/locales/en.spec.yml",
    "locale: en\nassertions:\n  - expectedFormats:\n      number:\n        money:\n          currency: USD\n",
  );
  await writeFile(
    root,
    "tests/targets/web.spec.yml",
    "target: web\nassertions:\n  - locale: en\n    expectedToIncludeMessages:\n      - common.welcome\n",
  );
  await writeFile(root, "datafiles/messagevisor-web-en.json", "{}");
  await writeFile(root, "datafiles/nested/messagevisor-web-en-US.json", '{"messages":{}}');
  await writeFile(root, "datafiles/.DS_Store", "ignored");
  await writeFile(root, "datafiles/REVISION", "ignored");

  return root;
}

async function createSetsProject() {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-list-sets-"));
  await writeFile(root, "messagevisor.config.js", "module.exports = { sets: true };\n");

  for (const set of ["dev", "production"]) {
    await writeFile(root, `sets/${set}/locales/en.yml`, "description: English\n");
    await writeFile(
      root,
      `sets/${set}/messages/common/welcome.yml`,
      `description: Welcome ${set}\ntranslations:\n  en: ${set}\n`,
    );
    await writeFile(
      root,
      `sets/${set}/targets/web.yml`,
      "description: Web\nincludeMessages:\n  - common*\nlocales:\n  - en\n",
    );
    await writeFile(root, `datafiles/${set}/messagevisor-web-en.json`, `{\"set\":\"${set}\"}`);
  }

  return root;
}

function getDatasource(root: string) {
  const projectConfig = getProjectConfig(root);
  const datasource = new Datasource(projectConfig, root);

  return { projectConfig, datasource };
}

describe("listPlugin", function () {
  it("lists generated datafiles with raw and gzip sizes", async function () {
    const root = await createProject();
    const { datasource } = getDatasource(root);
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    await listPlugin.handler({ datasource, parsed: { datafiles: true, json: true } });

    const result = JSON.parse(logSpy.mock.calls[0][0]);
    expect(result).toEqual([
      expect.objectContaining({ path: "messagevisor-web-en.json", size: 2 }),
      expect.objectContaining({ path: "nested/messagevisor-web-en-US.json", size: 15 }),
    ]);
    expect(result.every((datafile: any) => typeof datafile.gzipSize === "number")).toBe(true);

    logSpy.mockClear();
    await listPlugin.handler({ datasource, parsed: { datafiles: true } });
    const output = logSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    const uncoloredOutput = output.replace(/\u001b\[[0-9;]*m/g, "");
    expect(uncoloredOutput).toContain("Datafile");
    expect(uncoloredOutput).toContain("Size");
    expect(uncoloredOutput).toContain("Gzip");
    expect(uncoloredOutput).toContain("messagevisor-web-en.json");
    expect(uncoloredOutput).toContain("nested/messagevisor-web-en-US.json");
    expect(uncoloredOutput).toContain("Found 2 datafiles.");
    logSpy.mockRestore();
  });

  it("formats datafile sizes with colored units", function () {
    expect(formatDatafileSize(42)).toBe("42.00 \u001b[33mB\u001b[0m");
    expect(formatDatafileSize(1024)).toBe("1.00 \u001b[36mkB\u001b[0m");
    expect(formatDatafileSize(1024 * 1024)).toBe("1.00 \u001b[32mmB\u001b[0m");
  });

  it("lists entity keys in plain output", async function () {
    const root = await createProject();
    const { datasource } = getDatasource(root);
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    await listPlugin.handler({ datasource, parsed: { messages: true } });

    const output = logSpy.mock.calls.map((call) => call[0]).join("\n");
    expect(output).toContain("Messages:");
    expect(output).toContain("- common.archived");
    expect(output).toContain("- common.draft");
    expect(output).toContain("- common.plain");
    expect(output).toContain("- common.welcome");
    expect(output).toContain("Found 4 messages.");
    logSpy.mockRestore();
  });

  it("returns full entities in JSON output and supports message filters", async function () {
    const root = await createProject();
    const { datasource } = getDatasource(root);
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    await listPlugin.handler({
      datasource,
      parsed: {
        messages: true,
        json: true,
        pretty: true,
        withOverrides: true,
        withMeta: true,
        deprecated: "true",
        locale: "en-US",
        promotable: "false",
        withTests: true,
      },
    });

    const result = JSON.parse(logSpy.mock.calls[0][0]);
    expect(result).toHaveLength(1);
    expect(result[0].key).toEqual("common.welcome");
    expect(result[0].meta).toEqual({ screen: "home" });
    expect(result[0].deprecated).toEqual(true);
    logSpy.mockRestore();
  });

  it("supports locale, segment, attribute, and target filters", async function () {
    const root = await createProject();
    const { datasource } = getDatasource(root);
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    await listPlugin.handler({
      datasource,
      parsed: {
        locales: true,
        json: true,
        inheritFormatsFrom: "en",
        inheritTranslationsFrom: "en",
      },
    });
    let result = JSON.parse(logSpy.mock.calls[0][0]);
    expect(result.map((item: any) => item.key)).toEqual(["en-US"]);

    logSpy.mockClear();
    await listPlugin.handler({
      datasource,
      parsed: {
        segments: true,
        json: true,
        archived: "false",
        withTests: true,
      },
    });
    result = JSON.parse(logSpy.mock.calls[0][0]);
    expect(result.map((item: any) => item.key)).toEqual(["pro"]);

    logSpy.mockClear();
    await listPlugin.handler({
      datasource,
      parsed: {
        attributes: true,
        json: true,
        type: "date",
        archived: "true",
      },
    });
    result = JSON.parse(logSpy.mock.calls[0][0]);
    expect(result.map((item: any) => item.key)).toEqual(["birthDate"]);

    logSpy.mockClear();
    await listPlugin.handler({
      datasource,
      parsed: {
        targets: true,
        json: true,
        locale: "en-US",
        withContext: true,
        withFormats: true,
        withTests: true,
      },
    });
    result = JSON.parse(logSpy.mock.calls[0][0]);
    expect(result.map((item: any) => item.key)).toEqual(["web"]);

    logSpy.mockRestore();
  });

  it("supports shared regex filters and without-tests", async function () {
    const root = await createProject();
    const { datasource } = getDatasource(root);
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    await listPlugin.handler({
      datasource,
      parsed: {
        messages: true,
        json: true,
        keyPattern: "plain|welcome",
        description: "plain",
        withoutTests: true,
      },
    });

    const result = JSON.parse(logSpy.mock.calls[0][0]);
    expect(result.map((item: any) => item.key)).toEqual(["common.plain"]);
    logSpy.mockRestore();
  });

  it("filters messages further by target includeMessages and excludeMessages patterns", async function () {
    const root = await createProject();
    const { datasource } = getDatasource(root);
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    await listPlugin.handler({
      datasource,
      parsed: {
        messages: true,
        json: true,
        target: "web",
      },
    });

    const result = JSON.parse(logSpy.mock.calls[0][0]);
    expect(result.map((item: any) => item.key)).toEqual([
      "common.archived",
      "common.draft",
      "common.plain",
      "common.welcome",
    ]);
    logSpy.mockClear();

    await listPlugin.handler({
      datasource,
      parsed: {
        messages: true,
        json: true,
        target: "admin",
      },
    });

    expect(JSON.parse(logSpy.mock.calls[0][0])).toEqual([]);
    logSpy.mockRestore();
  });

  it("errors when selectors are missing or conflicting", async function () {
    const root = await createProject();
    const { datasource } = getDatasource(root);
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    try {
      await expect(listPlugin.handler({ datasource, parsed: {} })).resolves.toEqual(false);
      expect(errorSpy).toHaveBeenCalledWith(
        "Nothing to list. Pass exactly one of --datafiles, --messages, --locales, --segments, --attributes, --targets, or --tests.",
      );

      errorSpy.mockClear();

      await expect(
        listPlugin.handler({
          datasource,
          parsed: {
            messages: true,
            locales: true,
          },
        }),
      ).resolves.toEqual(false);
      expect(errorSpy).toHaveBeenCalledWith(
        "Pass exactly one of --datafiles, --messages, --locales, --segments, --attributes, --targets, or --tests.",
      );
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("rejects contradictory and inapplicable filters", async function () {
    const root = await createProject();
    const { datasource } = getDatasource(root);
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    try {
      await expect(
        listPlugin.handler({
          datasource,
          parsed: { messages: true, withOverrides: true, withoutOverrides: true },
        }),
      ).resolves.toEqual(false);
      expect(errorSpy).toHaveBeenLastCalledWith(
        "Use either --withOverrides or --withoutOverrides, not both.",
      );

      await expect(
        listPlugin.handler({ datasource, parsed: { locales: true, archived: true } }),
      ).resolves.toEqual(false);
      expect(errorSpy).toHaveBeenLastCalledWith("Option --archived cannot be used with --locales.");
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("errors when attributes are filtered by tests", async function () {
    const root = await createProject();
    const { datasource } = getDatasource(root);
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    try {
      await expect(
        listPlugin.handler({
          datasource,
          parsed: {
            attributes: true,
            withTests: true,
          },
        }),
      ).resolves.toEqual(false);
      expect(errorSpy).toHaveBeenCalledWith(
        "--with-tests and --without-tests are not supported for attributes.",
      );
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("groups plain output by set and requires a set for JSON in sets projects", async function () {
    const root = await createSetsProject();
    const { datasource } = getDatasource(root);
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    await listPlugin.handler({
      datasource,
      parsed: {
        messages: true,
      },
    });

    const output = logSpy.mock.calls.map((call) => call[0]).join("\n");
    expect(output).toContain('Set "dev":');
    expect(output).toContain('Set "production":');
    expect(output).toContain("- common.welcome");

    logSpy.mockClear();
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    try {
      await expect(
        listPlugin.handler({
          datasource,
          parsed: {
            messages: true,
            json: true,
          },
        }),
      ).resolves.toEqual(false);
      expect(JSON.parse(errorSpy.mock.calls[0][0])).toEqual({
        error: {
          code: "set_required_for_json",
          message: "Pass --set=<set> when using --json in a project with sets enabled.",
          details: { option: "set" },
        },
      });
    } finally {
      errorSpy.mockRestore();
    }

    await listPlugin.handler({
      datasource,
      parsed: {
        messages: true,
        json: true,
        set: "dev",
      },
    });

    const result = JSON.parse(logSpy.mock.calls[0][0]);
    expect(result.map((item: any) => item.key)).toEqual(["common.welcome"]);
    logSpy.mockRestore();
  });

  it("lists datafiles per set and requires a set for JSON output", async function () {
    const root = await createSetsProject();
    const { datasource } = getDatasource(root);
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    await listPlugin.handler({ datasource, parsed: { datafiles: true } });
    const output = logSpy.mock.calls.map((call) => call[0]).join("\n");
    expect(output).toContain('Set "dev":');
    expect(output).toContain('Set "production":');
    expect(output.match(/messagevisor-web-en\.json/g)).toHaveLength(2);

    logSpy.mockClear();
    await listPlugin.handler({
      datasource,
      parsed: { datafiles: true, json: true, set: "dev" },
    });
    expect(JSON.parse(logSpy.mock.calls[0][0])).toEqual([
      expect.objectContaining({ path: "messagevisor-web-en.json" }),
    ]);
    logSpy.mockRestore();
  });
});
