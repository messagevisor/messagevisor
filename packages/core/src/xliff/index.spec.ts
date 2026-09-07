import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { Message } from "@messagevisor/types";
import { getProjectConfig } from "../config";
import { Datasource } from "../datasource";
import { runCLI } from "../cli";
import { exportProjectSets } from "../exporter";
import { importProject } from "../importer";
import { getTranslationSourceHash } from "../translationWorkflow";
import { protectIcu } from "./index";
import { parse } from "@formatjs/icu-messageformat-parser";

const roots: string[] = [];
async function fixture(sets = false) {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-xliff-"));
  roots.push(root);
  await fs.promises.writeFile(
    path.join(root, "messagevisor.config.js"),
    `module.exports = { sourceLocale: 'en', sets: ${sets} };`,
  );
  const config = getProjectConfig(root);
  const datasource = new Datasource(config, root);
  const sources = sets ? [datasource.forSet("dev"), datasource.forSet("production")] : [datasource];
  for (const source of sources) {
    await source.writeLocale("en", { description: "English" });
    await source.writeLocale("nl", { description: "Dutch" });
    await source.writeLocale("nl-BE", {
      description: "Dutch Belgium",
      inheritTranslationsFrom: "nl",
    });
    await source.writeMessage("greeting", {
      description: "Welcome & <context>",
      summary: "Greeting",
      translatorContext: { notes: "Keep it friendly" },
      translations: { en: "Hello {name}", nl: "Hallo {name}" },
      translationStates: { nl: { status: "translated" } },
      overrides: [
        {
          key: "pro",
          description: "Pro users",
          segments: "*",
          translations: { en: "Hello pro", nl: "Hallo pro" },
        },
      ],
    });
  }
  const output = async (options = {}) =>
    exportProjectSets(config, datasource, {
      format: "xliff",
      locale: "nl",
      print: true,
      ...options,
    });
  const input = async (xml: string, options = {}) => {
    const input = path.join(root, "returned.xlf");
    await fs.promises.writeFile(input, xml);
    return importProject(config, datasource, { input, format: "xliff", ...options });
  };
  return { root, config, datasource, sources, output, input };
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => fs.promises.rm(root, { recursive: true, force: true })),
  );
});

describe("native XLIFF 2.0", () => {
  it.each(["", "'", "''", "{", "}", "<", "#", "'{", "{x}'", "<b>'#'", '💛 & "text"\n'])(
    "preserves edited prose semantics, including empty spans, for %j",
    async (prose) => {
      const project = await fixture();
      const templates = [
        "SENTINEL",
        "<b>SENTINEL</b>",
        "{n, plural, one {SENTINEL} other {SENTINEL}}",
        "{n, plural, other {{s, select, other {SENTINEL}}}}",
        "{s, select, other {{n, plural, other {SENTINEL}}}}",
        "{name}SENTINEL{other}",
        "SENTINEL{name}SENTINEL",
      ];
      for (const [index, template] of templates.entries())
        await project.datasource.writeMessage(`quoted${index}`, {
          translations: { en: template, nl: template },
        });
      const escaped = prose.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const xml = (await project.output({ includeMessages: "quoted*" })).xliff!.replace(
        /<target[^>]*>[\s\S]*?<\/target>/g,
        (target) => target.replaceAll("SENTINEL", escaped),
      );
      await project.input(xml, { apply: true, emptyValues: "empty" });
      const replaceLiterals = (value: any): any => {
        if (Array.isArray(value))
          return value.map(replaceLiterals).filter((node) => node.type !== 0 || node.value !== "");
        if (!value || typeof value !== "object") return value;
        if (value.type === 0) return { ...value, value: value.value.replaceAll("SENTINEL", prose) };
        return Object.fromEntries(
          Object.entries(value).map(([key, child]) => [key, replaceLiterals(child)]),
        );
      };
      for (const [index, template] of templates.entries()) {
        const result = (await project.datasource.readMessage(`quoted${index}`)).translations.nl;
        expect(parse(result)).toEqual(replaceLiterals(parse(template)));
      }
    },
  );
  it.each([
    "You don''t have access",
    "You don't have access",
    "Say '{hello}' and '<b>'",
    "{n, plural, one {'#' item} other {'#' items}}",
    "Before <b>don''t</b> after {name}",
    "{n, plural, other {{s, select, other {'#' don''t}}}}",
  ])(
    "exposes quoted prose and preserves its authored spelling on unchanged import: %s",
    async (text) => {
      const project = await fixture();
      await project.datasource.writeMessage("quoted", { translations: { en: text, nl: text } });
      const xml = (await project.output({ includeMessages: "quoted" })).xliff!;
      expect(xml).not.toContain("don''t");
      expect((await project.input(xml)).plans).toEqual([]);
      const replacement = text.includes("don")
        ? xml.replace(/(<target[^>]*>[\s\S]*?)don't/, "$1can't")
        : text.includes("Say")
          ? xml.replace("Say {hello} and &lt;b&gt;</target>", "Tell {world} and &lt;i&gt;</target>")
          : xml.replace("# items</target>", "# things</target>");
      if (replacement !== xml) {
        await project.input(replacement, { apply: true });
        const updated = (await project.datasource.readMessage("quoted")).translations.nl;
        expect(() => parse(updated)).not.toThrow();
        expect(updated).not.toBe(text);
      }
    },
  );

  it("encodes inserted braces and tag characters as prose, not new executable ICU", async () => {
    const project = await fixture();
    const xml = (await project.output()).xliff!.replace(
      ">Hallo <ph",
      ">Hallo {extra} &lt;script&gt; <ph",
    );
    await project.input(xml, { apply: true });
    expect(parse((await project.datasource.readMessage("greeting")).translations.nl)).toEqual(
      parse("Hallo '{extra} <script> '" + "{name}"),
    );
  });

  it("allows prose in an empty target and around a protected argument", async () => {
    const project = await fixture();
    await project.datasource.writeMessage("empty", { translations: { en: "Text", nl: "" } });
    await project.datasource.writeMessage("argument", {
      translations: { en: "{name}", nl: "{name}" },
    });
    const empty = (await project.output({ includeMessages: "empty" })).xliff!.replace(
      '<target xml:space="preserve"></target>',
      '<target xml:space="preserve">Don\'t {execute}</target>',
    );
    await project.input(empty, { apply: true });
    expect(parse((await project.datasource.readMessage("empty")).translations.nl)).toEqual([
      { type: 0, value: "Don't {execute}" },
    ]);
    const argument = (await project.output({ includeMessages: "argument" })).xliff!.replace(
      /(<target[^>]*>)(<ph[^>]+\/>)<\/target>/,
      "$1Hello $2!<\/target>",
    );
    await project.input(argument, { apply: true });
    expect((await project.datasource.readMessage("argument")).translations.nl).toBe(
      "Hello {name}!",
    );
  });

  it.each([false, true])(
    "does not renew unchanged reviewed markers for edited %s override copy",
    async (override) => {
      const project = await fixture();
      const message = await project.datasource.readMessage("greeting");
      const group = override ? message.overrides![0] : message;
      group.translationStates = {
        nl: {
          status: "reviewed",
          sourceHash: getTranslationSourceHash(group.translations.en),
          targetHash: getTranslationSourceHash(group.translations.nl),
        },
      };
      await project.datasource.writeMessage("greeting", message);
      const original = (await project.output()).xliff!;
      expect((await project.input(original)).plans).toEqual([]);
      const changed = override
        ? original.replace("Hallo pro</target>", "Not approved</target>")
        : original.replace(">Hallo <ph", ">Not approved <ph");
      await project.input(changed, { apply: true });
      const result = await project.datasource.readMessage("greeting");
      expect((override ? result.overrides![0] : result).translationStates?.nl).toEqual({
        status: "translated",
        sourceHash: getTranslationSourceHash(group.translations.en),
      });
    },
  );

  it("does not transfer ancestor approval to edited inherited copy", async () => {
    const project = await fixture();
    const message = await project.datasource.readMessage("greeting");
    message.translationStates = {
      nl: {
        status: "reviewed",
        sourceHash: getTranslationSourceHash(message.translations.en),
        targetHash: getTranslationSourceHash(message.translations.nl),
      },
    };
    await project.datasource.writeMessage("greeting", message);
    const xml = (await project.output({ locale: "nl-BE" })).xliff!.replace(
      ">Hallo <ph",
      ">Changed <ph",
    );
    await project.input(xml, { materializeInherited: true, apply: true });
    const updated = await project.datasource.readMessage("greeting");
    expect(updated.translationStates?.["nl-BE"]).toEqual({
      status: "translated",
      sourceHash: getTranslationSourceHash(message.translations.en),
    });
    expect(updated.translationStates?.nl).toEqual(message.translationStates.nl);
  });
  it("stops reading oversized input at the byte limit", async () => {
    const project = await fixture();
    const input = path.join(project.root, "oversized.xlf");
    const file = await fs.promises.open(input, "w");
    await file.truncate(32 * 1024 * 1024);
    await file.close();
    const spy = jest.spyOn(fs.ReadStream.prototype, "_read");
    try {
      await expect(
        importProject(project.config, project.datasource, { input, format: "xliff" }),
      ).rejects.toThrow("16 MiB input limit");
      expect(spy).toHaveBeenCalled();
      const stream = spy.mock.contexts[0] as fs.ReadStream;
      expect(stream.bytesRead).toBeLessThanOrEqual(16 * 1024 * 1024 + 65536);
      expect(stream.destroyed).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  it("assigns stable protected identities for large flat ICU messages", () => {
    const { codes, xml } = protectIcu("Text {name} ".repeat(10000), "s");
    expect(Object.keys(codes)).toHaveLength(10000);
    expect(codes.s10000).toBe("{name}");
    expect(xml).toContain('id="s10000"');
  });

  it("uses native CLI export and structured preview/apply output", async () => {
    const project = await fixture();
    const argv = process.argv;
    const exitCode = process.exitCode;
    const log = jest.spyOn(console, "log").mockImplementation(() => {});
    try {
      process.argv = [
        "node",
        "messagevisor",
        "export",
        "--format=xliff",
        "--sourceLocale=en",
        "--locale=nl",
        "--print",
      ];
      expect(
        await runCLI({
          rootDirectoryPath: project.root,
          projectConfig: project.config,
          datasource: project.datasource,
        }),
      ).toBe(true);
      const xml = log.mock.calls.find(
        ([value]) => typeof value === "string" && value.startsWith("<?xml"),
      )?.[0];
      expect(xml).toContain('version="2.0"');
      const input = path.join(project.root, "cli.xlf");
      await fs.promises.writeFile(
        input,
        xml.replace("Hallo pro</target>", "CLI translated</target>"),
      );
      log.mockClear();
      process.argv = [
        "node",
        "messagevisor",
        "import",
        "--format=xliff",
        `--input=${input}`,
        "--json",
        "--pretty",
        "--apply",
      ];
      expect(
        await runCLI({
          rootDirectoryPath: project.root,
          projectConfig: project.config,
          datasource: project.datasource,
        }),
      ).toBe(true);
      const json = log.mock.calls.find(
        ([value]) => typeof value === "string" && value.startsWith("{"),
      )?.[0];
      expect(JSON.parse(json).summary.changedTranslations).toBe(1);
      expect(json).toContain('\n  "inputFilePath"');
      expect(
        (await project.datasource.readMessage("greeting")).overrides?.[0].translations.nl,
      ).toBe("CLI translated");
      log.mockClear();
      const error = jest.spyOn(console, "error").mockImplementation(() => {});
      try {
        process.argv = [
          "node",
          "messagevisor",
          "export",
          "--format=xliff",
          "--locale=nl",
          "--print",
          "--json",
        ];
        expect(
          await runCLI({
            rootDirectoryPath: project.root,
            projectConfig: project.config,
            datasource: project.datasource,
          }),
        ).toBe(false);
        expect(error.mock.calls[0][0]).toContain("conflicting_options");
        expect(log).not.toHaveBeenCalled();
      } finally {
        error.mockRestore();
      }
    } finally {
      process.argv = argv;
      process.exitCode = exitCode;
      log.mockRestore();
    }
  });

  it("exports deterministic stable identities, protected ICU, notes, and workflow metadata", async () => {
    const project = await fixture();
    const exported = await project.output();
    expect(exported.csv).toBe("");
    expect(exported.xliff).toBe((await project.output()).xliff);
    expect(exported.xliff).toContain('version="2.0"');
    expect(exported.xliff).toContain('mv:overrideKey="pro"');
    expect(exported.xliff).toContain("mv:sourceFingerprint=");
    expect(exported.xliff).toContain("mv:targetFingerprint=");
    expect(exported.xliff).toContain('<data id="s1" xml:space="preserve">{name}</data>');
    expect(exported.xliff).toContain('<ph id="s1" dataRef="s1"');
    expect(exported.xliff).toContain(
      '<note category="description">Welcome &amp; &lt;context&gt;</note>',
    );
    expect(exported.xliff).toContain('<note category="translatorContext">');
    expect((await project.input(exported.xliff!)).plans).toEqual([]);
  });

  it("previews and applies copy without inheriting review approval from the exchange file", async () => {
    const project = await fixture();
    const xml = (await project.output())
      .xliff!.replace("Hallo <ph", "Welkom <ph")
      .replace("Hallo pro</target>", "Welkom pro</target>")
      .replace('state="translated"', 'state="reviewed"');
    const preview = await project.input(xml);
    expect(preview.summary.changedTranslations).toBe(2);
    expect((await project.datasource.readMessage("greeting")).translations.nl).toBe("Hallo {name}");
    await project.input(xml, { apply: true });
    const updated = await project.datasource.readMessage("greeting");
    expect(updated.translations.nl).toBe("Welkom {name}");
    expect(updated.overrides?.[0].translations.nl).toBe("Welkom pro");
    expect(updated.description).toBe("Welcome & <context>");
    expect(updated.translatorContext).toEqual({ notes: "Keep it friendly" });
    expect(updated.translationStates?.nl).toEqual({
      status: "translated",
      sourceHash: getTranslationSourceHash("Hello {name}"),
    });
    await expect(project.input(xml, { apply: true })).rejects.toMatchObject({
      code: "import_conflict",
    });
  });

  it.each(["en", "nl"])("rejects a stale %s fingerprint before any write", async (locale) => {
    const project = await fixture();
    const xml = (await project.output()).xliff!.replace(
      "Hallo pro</target>",
      "Changed pro</target>",
    );
    const message = await project.datasource.readMessage("greeting");
    message.translations[locale] = "Concurrent change {name}";
    await project.datasource.writeMessage("greeting", message);
    await expect(project.input(xml, { apply: true })).rejects.toMatchObject({
      code: "import_conflict",
    });
    expect((await project.datasource.readMessage("greeting")).overrides?.[0].translations.nl).toBe(
      "Hallo pro",
    );
  });

  it("checks concurrent target state and override routing changes", async () => {
    const project = await fixture();
    const xml = (await project.output()).xliff!;
    const message = await project.datasource.readMessage("greeting");
    message.translationStates = { nl: { status: "draft" } };
    await project.datasource.writeMessage("greeting", message);
    await expect(project.input(xml)).rejects.toMatchObject({ code: "import_conflict" });
    const next = (await project.output()).xliff!;
    message.overrides![0].segments = "changed";
    await project.datasource.writeMessage("greeting", message);
    await expect(project.input(next)).rejects.toMatchObject({ code: "import_conflict" });
  });

  it("detects stale inherited source, target and changed inheritance provenance", async () => {
    const project = await fixture();
    await project.datasource.writeLocale("en-US", {
      description: "US English",
      inheritTranslationsFrom: "en",
    });
    const sourceXml = (await project.output({ sourceLocale: "en-US" })).xliff!;
    const message = await project.datasource.readMessage("greeting");
    message.translations.en = "Changed {name}";
    await project.datasource.writeMessage("greeting", message);
    await expect(project.input(sourceXml, { sourceLocale: "en-US" })).rejects.toMatchObject({
      code: "import_conflict",
    });
    const targetXml = (await project.output({ locale: "nl-BE" })).xliff!;
    message.translations.nl = "Changed Dutch {name}";
    await project.datasource.writeMessage("greeting", message);
    await expect(project.input(targetXml)).rejects.toMatchObject({ code: "import_conflict" });
    const next = (await project.output({ locale: "nl-BE" })).xliff!;
    await project.datasource.writeLocale("nl-BE", {
      description: "Belgian",
      inheritTranslationsFrom: "en",
    });
    await expect(project.input(next)).rejects.toMatchObject({ code: "import_conflict" });
  });

  it("preserves stale review metadata on a no-op and refreshes hashes only after explicit returned review", async () => {
    const project = await fixture();
    const message = await project.datasource.readMessage("greeting");
    message.translationStates = {
      nl: {
        status: "reviewed",
        sourceHash: getTranslationSourceHash("Old source"),
        targetHash: getTranslationSourceHash(message.translations.nl),
      },
    };
    await project.datasource.writeMessage("greeting", message);
    const xml = (await project.output({ excludeOverrides: true })).xliff!;
    expect(xml).toContain('state="initial"');
    expect(xml).toContain("stale_translation");
    expect((await project.input(xml, { apply: true })).plans).toEqual([]);
    expect((await project.datasource.readMessage("greeting")).translationStates?.nl).toEqual(
      message.translationStates.nl,
    );
    await project.input(xml.replace('state="initial"', 'state="reviewed"'), { apply: true });
    expect(
      (await project.datasource.readMessage("greeting")).translationStates?.nl?.sourceHash,
    ).toBe(getTranslationSourceHash("Hello {name}"));
  });

  it("preserves plural, select, pound, rich tags, apostrophes, entities, CR, tabs and Unicode", async () => {
    const project = await fixture();
    const text =
      "<b>{count, plural, =0 {None} one {# item} other {# items}}</b> {kind, select, a {A} other {B}} '{literal}' & café\r\n\t";
    await project.datasource.writeMessage("complex", {
      description: "Complex",
      translations: { en: text, nl: text },
    });
    const xml = (await project.output({ includeMessages: "complex" })).xliff!;
    expect(xml).toContain("&lt;b&gt;");
    expect(xml).toContain("&#13;&#10;&#9;");
    expect((await project.input(xml)).plans).toEqual([]);
    await project.input(
      xml.replace(/<target([\s\S]*?)<\/target>/, (target) =>
        target.replace("items<ph", "dingen<ph"),
      ),
      { apply: true },
    );
    expect((await project.datasource.readMessage("complex")).translations.nl).toContain("# dingen");
  });

  it.each([
    (xml: string) => xml.replace(/<ph id="t1"[^>]*\/>/, ""),
    (xml: string) => xml.replace('dataRef="t1"', 'dataRef="s1"'),
    (xml: string) => xml.replace(">Hallo <ph", '><pc id="x">Hallo</pc> <ph'),
    (xml: string) => xml.replace(">Hallo <ph", '><mrk id="x">Hallo</mrk> <ph'),
    (xml: string) =>
      xml.replace(
        '<data id="t1" xml:space="preserve">{name}</data>',
        '<data id="t1" xml:space="preserve">{other}</data>',
      ),
    (xml: string) => xml.replace(">Hello <ph", ">Changed <ph"),
    (xml: string) => xml.replace('version="2.0"', 'version="1.2"'),
    (xml: string) => xml.replace("<xliff ", '<xliff unsupported="yes" '),
    (xml: string) => xml.replace('xmlns="urn:oasis:names:tc:xliff:document:2.0"', 'xmlns="wrong"'),
    (xml: string) => xml.replace("<file ", '<file id="duplicate" '),
  ])("rejects malformed, tampered and unsupported structures %i", async (change) => {
    const project = await fixture();
    await expect(
      project.input(change((await project.output()).xliff!), { apply: true }),
    ).rejects.toBeInstanceOf(Error);
    expect((await project.datasource.readMessage("greeting")).translations.nl).toBe("Hallo {name}");
  });

  it("rejects DTDs, unknown entities, duplicate units, additional segments and removed messages", async () => {
    const project = await fixture();
    const xml = (await project.output()).xliff!;
    await expect(
      project.input(
        xml.replace("<xliff ", '<!DOCTYPE xliff [<!ENTITY x SYSTEM "file:///etc/passwd">]><xliff '),
      ),
    ).rejects.toThrow(/DTD/);
    await expect(project.input(xml.replace("Hallo pro", "&unknown;"))).rejects.toThrow(/XML/);
    const unit = xml.slice(
      xml.indexOf("    <unit"),
      xml.indexOf("    </unit>") + "    </unit>".length,
    );
    await expect(project.input(xml.replace("  </file>", `${unit}\n  </file>`))).rejects.toThrow(
      /Duplicate/,
    );
    await expect(
      project.input(
        xml.replace(
          "</segment>",
          '</segment><segment id="2" state="initial"><source>A</source></segment>',
        ),
      ),
    ).rejects.toThrow(/one segment/);
    await project.datasource.deleteMessage("greeting");
    await expect(project.input(xml, { apply: true })).rejects.toMatchObject({
      code: "import_conflict",
    });
  });

  it("skips inherited targets unless materialization is explicitly requested", async () => {
    const project = await fixture();
    const xml = (await project.output({ locale: "nl-BE" })).xliff!;
    expect(xml).toContain('mv:origin="inherited"');
    expect((await project.input(xml)).plans).toEqual([]);
    await project.input(xml, { materializeInherited: true, apply: true });
    expect((await project.datasource.readMessage("greeting")).translations["nl-BE"]).toBe(
      "Hallo {name}",
    );
  });

  it("exports effective inherited review evidence and rejects concurrent ancestor state edits", async () => {
    const project = await fixture();
    const message = await project.datasource.readMessage("greeting");
    message.translationStates = {
      nl: {
        status: "reviewed",
        sourceHash: getTranslationSourceHash(message.translations.en),
        targetHash: getTranslationSourceHash(message.translations.nl),
      },
    };
    await project.datasource.writeMessage("greeting", message);
    const xml = (await project.output({ locale: "nl-BE", excludeOverrides: true })).xliff!;
    expect(xml).toContain('state="reviewed"');
    expect((await project.input(xml)).plans).toEqual([]);
    message.translationStates.nl = { status: "draft" };
    await project.datasource.writeMessage("greeting", message);
    await expect(
      project.input(xml, { materializeInherited: true, apply: true }),
    ).rejects.toMatchObject({
      code: "import_conflict",
    });
    expect(
      (await project.datasource.readMessage("greeting")).translations["nl-BE"],
    ).toBeUndefined();
  });

  it("imports missing targets using source protected codes and does not materialize unchanged missing targets", async () => {
    const project = await fixture();
    await project.datasource.writeMessage("missing", {
      description: "Missing",
      translations: { en: "Hello {name}" },
    });
    const xml = (await project.output({ includeMessages: "missing" })).xliff!;
    expect((await project.input(xml)).plans).toEqual([]);
    const source = xml.slice(
      xml.indexOf('<source xml:space="preserve">') + '<source xml:space="preserve">'.length,
      xml.indexOf("</source>"),
    );
    await project.input(
      xml.replace(
        '<target xml:space="preserve"></target>',
        `<target xml:space="preserve">${source.replace("Hello", "Hallo")}</target>`,
      ),
      { apply: true },
    );
    expect((await project.datasource.readMessage("missing")).translations.nl).toBe("Hallo {name}");
  });

  it.each(["skip", "empty", "delete"])(
    "supports explicit %s empty target policy",
    async (emptyValues) => {
      const project = await fixture();
      const xml = (await project.output()).xliff!.replace(
        /<target xml:space="preserve">[\s\S]*?<\/target>/g,
        '<target xml:space="preserve"></target>',
      );
      await project.input(xml, { emptyValues, apply: true });
      expect((await project.datasource.readMessage("greeting")).translations.nl).toBe(
        emptyValues === "skip" ? "Hallo {name}" : emptyValues === "empty" ? "" : undefined,
      );
    },
  );

  it.each(["skip", "empty", "delete"])(
    "treats an empty CDATA target like an empty XML target for %s policy",
    async (emptyValues) => {
      const project = await fixture();
      const xml = (await project.output()).xliff!.replace(
        /<target xml:space="preserve">[\s\S]*?<\/target>/g,
        '<target xml:space="preserve"><![CDATA[]]></target>',
      );
      await project.input(xml, { emptyValues, apply: true });
      expect((await project.datasource.readMessage("greeting")).translations.nl).toBe(
        emptyValues === "skip" ? "Hallo {name}" : emptyValues === "empty" ? "" : undefined,
      );
    },
  );

  it("requires locale agreement, rejects target only units, honours filters and zero locale targets", async () => {
    const project = await fixture();
    const xml = (await project.output()).xliff!;
    await expect(project.input(xml, { locale: "nl-BE" })).rejects.toThrow(/locale mismatch/);
    await expect(project.output({ locale: ["nl", "nl-BE"] })).rejects.toThrow(/exactly one/);
    await project.datasource.writeTarget("none", { description: "None", locales: [] });
    expect((await project.output({ target: "none" })).summary.totalRows).toBe(0);
    await project.datasource.writeMessage("targetOnly", {
      description: "No source",
      translations: { nl: "Hallo" },
    });
    await expect(project.output()).rejects.toThrow(/no effective source/);
    expect(
      (await project.output({ excludeMessages: "targetOnly", excludeOverrides: true })).summary
        .totalRows,
    ).toBe(1);
  });

  it("keeps same message and override identities distinct across sets and validates all sets before writing", async () => {
    const project = await fixture(true);
    const xml = (await project.output()).xliff!;
    expect((await project.input(xml)).plans).toEqual([]);
    expect((await project.output()).summary.totalRows).toBe(4);
    const changed = xml.replaceAll("Hallo pro</target>", "Changed</target>");
    const production = project.sources[1];
    const message = await production.readMessage("greeting");
    message.translations.nl = "Concurrent {name}";
    await production.writeMessage("greeting", message);
    await expect(project.input(changed, { apply: true })).rejects.toMatchObject({
      code: "import_conflict",
    });
    expect((await project.sources[0].readMessage("greeting")).overrides?.[0].translations.nl).toBe(
      "Hallo pro",
    );
  });

  it("uses optimistic versions to reject writes racing after planning", async () => {
    const project = await fixture();
    const xml = (await project.output()).xliff!.replace(
      "Hallo pro</target>",
      "Changed pro</target>",
    );
    const original = project.datasource.applyEntityMutations.bind(project.datasource);
    const spy = jest
      .spyOn(project.datasource, "applyEntityMutations")
      .mockImplementationOnce(async (mutations, options) => {
        const current = await project.datasource.readMessage("greeting");
        await project.datasource.writeMessage("greeting", {
          ...current,
          description: "Concurrent description",
        } as Message);
        return original(mutations, options);
      });
    await expect(project.input(xml, { apply: true })).rejects.toMatchObject({
      code: "entity_conflict",
    });
    expect((await project.datasource.readMessage("greeting")).description).toBe(
      "Concurrent description",
    );
    spy.mockRestore();
  });
});
