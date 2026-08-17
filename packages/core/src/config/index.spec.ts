import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { getProjectConfig } from "./index";

async function createProject(configContent: string) {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-config-"));
  await fs.promises.writeFile(path.join(root, "messagevisor.config.js"), configContent);
  return root;
}

describe("getProjectConfig", function () {
  it("reloads changed configuration instead of returning the require cache", async function () {
    const root = await createProject('module.exports = { sourceLocale: "en" };\n');
    expect(getProjectConfig(root).sourceLocale).toBe("en");

    await fs.promises.writeFile(
      path.join(root, "messagevisor.config.js"),
      'module.exports = { sourceLocale: "nl" };\n',
    );

    // Jest maintains its own module registry, unlike Node's native require cache.
    // Reload this module so the assertion exercises the same fresh-load path used
    // by the CLI and Catalog in production.
    jest.resetModules();
    const { getProjectConfig: getReloadedProjectConfig } = require("./index");
    expect(getReloadedProjectConfig(root).sourceLocale).toBe("nl");
  });

  it("defaults lintIcu to true", async function () {
    const root = await createProject("module.exports = {};\n");

    const projectConfig = getProjectConfig(root);

    expect(projectConfig.lintIcu).toEqual(true);
  });

  it("accepts lintIcu false", async function () {
    const root = await createProject("module.exports = { lintIcu: false };\n");

    const projectConfig = getProjectConfig(root);

    expect(projectConfig.lintIcu).toEqual(false);
  });

  it("defaults Catalog block exports to the supported block size", async function () {
    const projectConfig = getProjectConfig(await createProject("module.exports = {};\n"));

    expect(projectConfig.catalogBlockSize).toBe(262144);
  });

  it("accepts valid Catalog block size configuration", async function () {
    const projectConfig = getProjectConfig(
      await createProject("module.exports = { catalogBlockSize: 65536 };\n"),
    );

    expect(projectConfig.catalogBlockSize).toBe(65536);
  });

  it("rejects invalid Catalog block export configuration", async function () {
    const invalidConfigs = [
      {
        config: "module.exports = { catalogBlockSize: 1024 };\n",
        message: "Invalid catalogBlockSize: 1024. It must be an integer from 16384 to 8388608.",
      },
    ];

    for (const invalid of invalidConfigs) {
      const root = await createProject(invalid.config);
      expect(() => getProjectConfig(root)).toThrow(invalid.message);
    }
  });

  it("rejects removed Catalog layout configuration options", async function () {
    for (const option of ["catalogLayout", "catalogBlockThreshold"]) {
      const root = await createProject(`module.exports = { ${option}: "files" };\n`);
      const error = (() => {
        try {
          getProjectConfig(root);
          return undefined;
        } catch (caught) {
          return caught as { code?: string; message?: string };
        }
      })();

      expect(error?.code).toBe("unknown_config_option");
      expect(error?.message).toContain(option);
      expect(error?.message).toContain("Block storage is now the only Catalog layout");
    }
  });

  it("rejects unknown configuration options", async function () {
    const root = await createProject(
      "module.exports = { unknownOption: true, anotherUnknownOption: false };\n",
    );

    expect(() => getProjectConfig(root)).toThrow(
      "Unknown Messagevisor configuration options: anotherUnknownOption, unknownOption.",
    );
  });

  it("rejects non-object configuration exports", async function () {
    const root = await createProject('module.exports = "invalid";\n');

    expect(() => getProjectConfig(root)).toThrow(
      "Invalid Messagevisor configuration: expected an object export.",
    );
  });

  it("accepts an optional non-empty sourceLocale", async function () {
    expect(
      getProjectConfig(await createProject("module.exports = {};\n")).sourceLocale,
    ).toBeUndefined();
    expect(
      getProjectConfig(await createProject('module.exports = { sourceLocale: "en" };\n'))
        .sourceLocale,
    ).toBe("en");
    const invalidRoot = await createProject('module.exports = { sourceLocale: "" };\n');
    expect(() => getProjectConfig(invalidRoot)).toThrow(/Invalid sourceLocale/);
  });

  it("rejects invalid lintIcu values", async function () {
    const invalidConfigs = [
      {
        config: 'module.exports = { lintIcu: "false" };\n',
        message: "Invalid lintIcu: false. It must be a boolean.",
      },
      {
        config: "module.exports = { lintIcu: null };\n",
        message: "Invalid lintIcu: null. It must be a boolean.",
      },
    ];

    for (const invalid of invalidConfigs) {
      const root = await createProject(invalid.config);
      expect(() => getProjectConfig(root)).toThrow(invalid.message);
    }
  });

  it("accepts valid promotionFlows object rules", async function () {
    const root = await createProject(
      [
        "module.exports = {",
        "  sets: true,",
        "  promotionFlows: [",
        '    { from: "dev", to: "staging" },',
        '    { from: "staging", to: "production" },',
        "  ],",
        "};",
        "",
      ].join("\n"),
    );

    const projectConfig = getProjectConfig(root);

    expect(projectConfig.promotionFlows).toEqual([
      { from: "dev", to: "staging" },
      { from: "staging", to: "production" },
    ]);
  });

  it("rejects invalid promotionFlows shapes", async function () {
    const invalidConfigs = [
      {
        config: "module.exports = { promotionFlows: true };\n",
        message: "Invalid promotionFlows: true. It must be an array.",
      },
      {
        config: 'module.exports = { promotionFlows: ["dev"] };\n',
        message:
          'Invalid promotionFlows[0]: dev. Each entry must be an object with exactly "from" and "to" string fields.',
      },
      {
        config: 'module.exports = { promotionFlows: [{ from: "dev" }] };\n',
        message:
          'Invalid promotionFlows[0]: {"from":"dev"}. Each entry must contain exactly "from" and "to".',
      },
      {
        config:
          'module.exports = { promotionFlows: [{ from: "dev", to: "staging", note: true }] };\n',
        message:
          'Invalid promotionFlows[0]: {"from":"dev","to":"staging","note":true}. Each entry must contain exactly "from" and "to".',
      },
      {
        config: 'module.exports = { promotionFlows: [{ from: "dev", to: 1 }] };\n',
        message:
          'Invalid promotionFlows[0]: {"from":"dev","to":1}. "from" and "to" must be strings.',
      },
    ];

    for (const invalid of invalidConfigs) {
      const root = await createProject(invalid.config);
      expect(() => getProjectConfig(root)).toThrow(invalid.message);
    }
  });
});
