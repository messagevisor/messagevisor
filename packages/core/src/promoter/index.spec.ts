import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { getProjectConfig } from "../config";
import { Datasource } from "../datasource";
import { promotePlugin, promoteProjectSets } from "./index";

async function writeFile(root: string, relativePath: string, content: string) {
  const filePath = path.join(root, relativePath);
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, content);
}

async function createProject(options?: { configContent?: string; sets?: string[] }) {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-promote-"));
  const configContent = options?.configContent ?? "module.exports = { sets: true };\n";
  const sets = options?.sets ?? ["dev", "staging"];

  await writeFile(root, "messagevisor.config.js", configContent);

  for (const set of sets) {
    await writeFile(root, `sets/${set}/locales/en.yml`, "description: English\n");
    await writeFile(
      root,
      `sets/${set}/locales/en-US.yml`,
      "description: English US\ninheritTranslationsFrom: en\n",
    );
    await writeFile(
      root,
      `sets/${set}/targets/web.yml`,
      "description: Web\nincludeMessages:\n  - product*\nlocales:\n  - en-US\n",
    );
    await writeFile(root, `sets/${set}/attributes/plan.yml`, "description: Plan\ntype: string\n");
    await writeFile(
      root,
      `sets/${set}/segments/pro.yml`,
      "description: Pro\nconditions:\n  - attribute: plan\n    operator: equals\n    value: pro\n",
    );
    await writeFile(
      root,
      `sets/${set}/messages/product/price.yml`,
      "description: Product price\ntranslations:\n  en: Old price\noverrides:\n  - key: pro\n    segments: pro\n    translations:\n      en: Old pro price\n",
    );
    await writeFile(
      root,
      `sets/${set}/tests/messages/product/price.spec.yml`,
      "message: product.price\nassertions:\n  - locale: en-US\n    expectedTranslation: Old price\n",
    );
  }

  await writeFile(
    root,
    "sets/dev/messages/product/price.yml",
    "description: Product price\ntranslations:\n  en: New price\noverrides:\n  - key: pro\n    segments: pro\n    translations:\n      en: New pro price\n",
  );
  await writeFile(
    root,
    "sets/staging/messages/product/price.yml",
    "description: Product price\ntranslations:\n  en: Old price\noverrides:\n  - key: pro\n    segments: pro\n    translations:\n      en: Old pro price\n  - key: staging-only\n    segments: pro\n    translations:\n      en: Staging only\n",
  );

  return root;
}

describe("promoteProjectSets", function () {
  it("previews selected target entities by default and applies only with apply", async function () {
    const root = await createProject();
    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);

    const preview = await promoteProjectSets(projectConfig, datasource, {
      from: "dev",
      to: "staging",
      target: "web",
      locale: "en-US",
    });

    expect(
      preview.files.updated.some((filePath) => filePath.endsWith("messages/product/price.yml")),
    ).toEqual(true);
    expect(preview.apply).toEqual(false);
    expect(
      (await datasource.forSet("staging").readMessage("product.price")).translations.en,
    ).toEqual("Old price");

    const result = await promoteProjectSets(projectConfig, datasource, {
      from: "dev",
      to: "staging",
      target: "web",
      locale: "en-US",
      apply: true,
    });
    const message = await datasource.forSet("staging").readMessage("product.price");

    expect(result.dependencies.locales).toEqual(2);
    expect(result.dependencies.attributes).toEqual(1);
    expect(result.dependencies.segments).toEqual(1);
    expect(result.apply).toEqual(true);
    expect(message.translations.en).toEqual("New price");
    expect(message.overrides?.map((override) => override.key)).toEqual(["pro", "staging-only"]);
    expect(message.overrides?.[0].translations.en).toEqual("New pro price");
    expect(message.overrides?.[1].translations.en).toEqual("Staging only");
  });

  it("fails when promoted overrides are not keyed", async function () {
    const root = await createProject();
    await writeFile(
      root,
      "sets/dev/messages/product/price.yml",
      "description: Product price\ntranslations:\n  en: New price\noverrides:\n  - segments: pro\n    translations:\n      en: New pro price\n",
    );

    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);

    await expect(
      promoteProjectSets(projectConfig, datasource, {
        from: "dev",
        to: "staging",
        includeMessages: "product*",
      }),
    ).rejects.toThrow('Set "dev" failed preflight lint');
  });

  it("can promote messages without copying or merging overrides", async function () {
    const root = await createProject();
    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);

    const result = await promoteProjectSets(projectConfig, datasource, {
      from: "dev",
      to: "staging",
      includeMessages: "product*",
      excludeOverrides: true,
      apply: true,
    });
    const message = await datasource.forSet("staging").readMessage("product.price");

    expect(result.dependencies.attributes).toEqual(0);
    expect(result.dependencies.segments).toEqual(0);
    expect(message.translations.en).toEqual("New price");
    expect(message.overrides?.map((override) => override.key)).toEqual(["pro", "staging-only"]);
    expect(message.overrides?.[0].translations.en).toEqual("Old pro price");
    expect(message.overrides?.[1].translations.en).toEqual("Staging only");
  });

  it("fails fast for unknown requested locales", async function () {
    const root = await createProject();
    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);

    await expect(
      promoteProjectSets(projectConfig, datasource, {
        from: "dev",
        to: "staging",
        locale: "fr",
      }),
    ).rejects.toThrow('Unknown source locale "fr"');
  });

  it("fails when include message filters match nothing unless empty promotions are allowed", async function () {
    const root = await createProject();
    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);

    await expect(
      promoteProjectSets(projectConfig, datasource, {
        from: "dev",
        to: "staging",
        includeMessages: "missing*",
      }),
    ).rejects.toThrow("No source messages matched");

    const result = await promoteProjectSets(projectConfig, datasource, {
      from: "dev",
      to: "staging",
      includeMessages: "missing*",
      allowEmpty: true,
    });

    expect(result.dependencies.messages).toEqual(0);
    expect(result.files.updated).toEqual([]);
  });

  it("validates destination override keys during preflight", async function () {
    const root = await createProject();
    await writeFile(
      root,
      "sets/staging/messages/product/price.yml",
      "description: Product price\ntranslations:\n  en: Old price\noverrides:\n  - segments: pro\n    translations:\n      en: Staging pro price\n",
    );

    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);

    await expect(
      promoteProjectSets(projectConfig, datasource, {
        from: "dev",
        to: "staging",
        includeMessages: "product*",
      }),
    ).rejects.toThrow('Set "staging" failed preflight lint');
  });

  it("can preserve destination conflicts instead of source values", async function () {
    const root = await createProject();
    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);

    const result = await promoteProjectSets(projectConfig, datasource, {
      from: "dev",
      to: "staging",
      includeMessages: "product*",
      conflicts: "destination",
    });
    const message = await datasource.forSet("staging").readMessage("product.price");

    expect(result.conflicts.length).toBeGreaterThan(0);
    expect(message.translations.en).toEqual("Old price");
    expect(message.overrides?.[0].translations.en).toEqual("Old pro price");
    expect(message.overrides?.[1].translations.en).toEqual("Staging only");
  });

  it("fails when conflict policy is fail and source would overwrite destination", async function () {
    const root = await createProject();
    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);

    await expect(
      promoteProjectSets(projectConfig, datasource, {
        from: "dev",
        to: "staging",
        includeMessages: "product*",
        conflicts: "fail",
      }),
    ).rejects.toThrow("conflict(s) and --conflicts=fail was used");
  });

  it("hides unchanged entries by default for previews and shows them on demand", async function () {
    const root = await createProject();
    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const consoleLogSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      await promotePlugin.handler({
        projectConfig,
        datasource,
        parsed: {
          from: "dev",
          to: "staging",
        },
      });

      const defaultOutput = consoleLogSpy.mock.calls.flat().join("\n");

      expect(defaultOutput).toContain("Mode: preview");
      expect(defaultOutput).toContain("Unchanged: ");
      expect(defaultOutput).not.toContain("Unchanged\n");
      expect(defaultOutput).not.toContain("sets/staging/locales/en.yml");

      consoleLogSpy.mockClear();

      await promotePlugin.handler({
        projectConfig,
        datasource,
        parsed: {
          from: "dev",
          to: "staging",
          showUnchanged: true,
        },
      });

      const verboseOutput = consoleLogSpy.mock.calls.flat().join("\n");

      expect(verboseOutput).toContain("Unchanged\n");
      expect(verboseOutput).toContain("sets/staging/locales/en.yml");
    } finally {
      consoleLogSpy.mockRestore();
    }
  });

  it("applies from the CLI only when --apply is passed", async function () {
    const root = await createProject();
    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const consoleLogSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      await promotePlugin.handler({
        projectConfig,
        datasource,
        parsed: {
          from: "dev",
          to: "staging",
          apply: true,
        },
      });
      const output = consoleLogSpy.mock.calls.flat().join("\n");
      const message = await datasource.forSet("staging").readMessage("product.price");

      expect(output).toContain("Mode: apply");
      expect(output).toContain("Promotion applied");
      expect(message.translations.en).toEqual("New price");
    } finally {
      consoleLogSpy.mockRestore();
    }
  });

  it("prints expected workflow errors from the CLI without throwing", async function () {
    const root = await createProject({ configContent: "module.exports = {};\n" });
    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      const result = await promotePlugin.handler({
        projectConfig,
        datasource,
        parsed: {
          from: "dev",
          to: "staging",
        },
      });

      expect(result).toEqual(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Promotion is only available when `sets: true` is configured.",
      );
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("creates missing entities even when source marks them as non-promotable", async function () {
    const root = await createProject();
    await writeFile(root, "sets/dev/locales/nl.yml", "description: Dutch\npromotable: false\n");
    await writeFile(
      root,
      "sets/dev/attributes/channel.yml",
      "description: Channel\npromotable: false\ntype: string\n",
    );
    await writeFile(
      root,
      "sets/dev/segments/internal.yml",
      "description: Internal\npromotable: false\nconditions:\n  - attribute: channel\n    operator: equals\n    value: internal\n",
    );
    await writeFile(
      root,
      "sets/dev/targets/mobile.yml",
      "description: Mobile\npromotable: false\nincludeMessages:\n  - mobile*\nlocales:\n  - nl\n",
    );
    await writeFile(
      root,
      "sets/dev/messages/mobile/banner.yml",
      "description: Mobile banner\npromotable: false\ntranslations:\n  nl: Mobiel\n",
    );
    await writeFile(
      root,
      "sets/dev/tests/messages/mobile/banner.spec.yml",
      "promotable: false\nmessage: mobile.banner\nassertions:\n  - locale: nl\n    expectedTranslation: Mobiel\n",
    );

    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);

    const result = await promoteProjectSets(projectConfig, datasource, {
      from: "dev",
      to: "staging",
      apply: true,
    });

    expect(result.files.created).toEqual(
      expect.arrayContaining([
        expect.stringContaining("sets/staging/locales/nl.yml"),
        expect.stringContaining("sets/staging/attributes/channel.yml"),
        expect.stringContaining("sets/staging/segments/internal.yml"),
        expect.stringContaining("sets/staging/targets/mobile.yml"),
        expect.stringContaining("sets/staging/messages/mobile/banner.yml"),
        expect.stringContaining("sets/staging/tests/messages/mobile/banner.yml"),
      ]),
    );
    expect((await datasource.forSet("staging").readLocale("nl")).promotable).toEqual(false);
    expect((await datasource.forSet("staging").readAttribute("channel")).promotable).toEqual(false);
    expect((await datasource.forSet("staging").readSegment("internal")).promotable).toEqual(false);
    expect((await datasource.forSet("staging").readTarget("mobile")).promotable).toEqual(false);
    expect((await datasource.forSet("staging").readMessage("mobile.banner")).promotable).toEqual(
      false,
    );
    expect(await datasource.forSet("staging").listTests()).toEqual(
      expect.arrayContaining(["messages.mobile.banner"]),
    );
    expect(
      (await datasource.forSet("staging").readTest("messages.mobile.banner")).promotable,
    ).toEqual(false);
  });

  it("skips updates when either source or destination marks an existing entity as non-promotable", async function () {
    const root = await createProject();
    await writeFile(
      root,
      "sets/dev/messages/product/price.yml",
      "description: Product price\npromotable: false\ntranslations:\n  en: Protected source price\noverrides:\n  - key: pro\n    segments: pro\n    translations:\n      en: Protected source pro price\n",
    );
    await writeFile(
      root,
      "sets/dev/segments/pro.yml",
      "description: Source pro\nconditions:\n  - attribute: plan\n    operator: equals\n    value: pro\n",
    );
    await writeFile(
      root,
      "sets/staging/segments/pro.yml",
      "description: Destination pro\npromotable: false\nconditions:\n  - attribute: plan\n    operator: equals\n    value: staging\n",
    );

    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);

    const result = await promoteProjectSets(projectConfig, datasource, {
      from: "dev",
      to: "staging",
      includeMessages: "product*",
      apply: true,
    });
    const message = await datasource.forSet("staging").readMessage("product.price");
    const segment = await datasource.forSet("staging").readSegment("pro");

    expect(result.files.unchanged).toEqual(
      expect.arrayContaining([
        expect.stringContaining("sets/staging/messages/product/price.yml"),
        expect.stringContaining("sets/staging/segments/pro.yml"),
      ]),
    );
    expect(
      result.conflicts.some(
        (conflict) => conflict.type === "message" && conflict.key === "product.price",
      ),
    ).toEqual(false);
    expect(message.translations.en).toEqual("Old price");
    expect(message.overrides?.[0].translations.en).toEqual("Old pro price");
    expect(segment.description).toEqual("Destination pro");
    expect((segment.conditions as any[])[0].value).toEqual("staging");
  });

  it("does not write an audit in preview mode", async function () {
    const root = await createProject();
    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);

    const result = await promoteProjectSets(projectConfig, datasource, {
      from: "dev",
      to: "staging",
      includeMessages: "product*",
      audit: "markdown",
    });

    expect(result.auditFilePath).toBeUndefined();
  });

  it("writes collision-safe UTC audit files when requested", async function () {
    jest.useFakeTimers().setSystemTime(new Date("2026-04-19T10:20:30Z"));

    try {
      const root = await createProject();
      const projectConfig = getProjectConfig(root);
      const datasource = new Datasource(projectConfig, root);

      const first = await promoteProjectSets(projectConfig, datasource, {
        from: "dev",
        to: "staging",
        includeMessages: "product*",
        apply: true,
        audit: "markdown",
      });
      const second = await promoteProjectSets(projectConfig, datasource, {
        from: "dev",
        to: "staging",
        includeMessages: "product*",
        apply: true,
        audit: "markdown",
      });

      expect(first.auditFilePath).toContain(
        ".messagevisor/promotions/20260419T102030-dev-to-staging.md",
      );
      expect(second.auditFilePath).toContain(
        ".messagevisor/promotions/20260419T102030-dev-to-staging-1.md",
      );

      const audit = await fs.promises.readFile(
        path.resolve(process.cwd(), first.auditFilePath),
        "utf8",
      );
      expect(audit).toContain("# Messagevisor Promotion");
      expect(audit).toContain("- Mode: apply");
      expect(audit).toContain("messages/product/price.yml");
    } finally {
      jest.useRealTimers();
    }
  });

  it("writes apply mode in JSON audit files", async function () {
    const root = await createProject();
    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);

    const result = await promoteProjectSets(projectConfig, datasource, {
      from: "dev",
      to: "staging",
      includeMessages: "product*",
      apply: true,
      audit: "json",
    });

    expect(result.auditFilePath).toContain(".json");

    const audit = JSON.parse(
      await fs.promises.readFile(path.resolve(process.cwd(), result.auditFilePath!), "utf8"),
    );

    expect(audit.apply).toEqual(true);
    expect(audit).not.toHaveProperty("check");
    expect(audit).not.toHaveProperty("dryRun");
  });

  it("allows configured promotion flows and blocks disallowed ones", async function () {
    const root = await createProject({
      sets: ["dev", "staging", "production"],
      configContent: [
        "module.exports = {",
        "  sets: true,",
        "  promotionFlows: [",
        '    { from: "dev", to: "staging" },',
        '    { from: "staging", to: "production" },',
        "  ],",
        "};",
        "",
      ].join("\n"),
    });
    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);

    const allowed = await promoteProjectSets(projectConfig, datasource, {
      from: "dev",
      to: "staging",
    });

    expect(allowed.from).toEqual("dev");
    expect(allowed.to).toEqual("staging");

    await expect(
      promoteProjectSets(projectConfig, datasource, {
        from: "dev",
        to: "production",
      }),
    ).rejects.toThrow(
      'Promotion from "dev" to "production" is not allowed by this project\'s configured promotionFlows.',
    );
  });

  it("blocks all promotions when promotionFlows is empty", async function () {
    const root = await createProject({
      configContent: [
        "module.exports = {",
        "  sets: true,",
        "  promotionFlows: [],",
        "};",
        "",
      ].join("\n"),
    });
    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);

    await expect(
      promoteProjectSets(projectConfig, datasource, {
        from: "dev",
        to: "staging",
      }),
    ).rejects.toThrow(
      'Promotion from "dev" to "staging" is not allowed by this project\'s configured promotionFlows.',
    );
  });
});
