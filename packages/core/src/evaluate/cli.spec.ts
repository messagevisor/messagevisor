import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { getProjectConfig } from "../config";
import { Datasource } from "../datasource";
import { evaluatePlugin } from "./cli";

async function writeFile(root: string, relativePath: string, content: string) {
  const filePath = path.join(root, relativePath);
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, content);
}

async function createProject(configContent = "module.exports = {};\n") {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-evaluate-"));

  await writeFile(root, "messagevisor.config.js", configContent);
  await writeFile(
    root,
    "locales/en.yml",
    [
      "description: English",
      "formats:",
      "  number:",
      "    decimal:",
      "      minimumFractionDigits: 2",
      "      maximumFractionDigits: 2",
      "",
    ].join("\n"),
  );
  await writeFile(
    root,
    "targets/web.yml",
    [
      "description: Web",
      "includeMessages:",
      "  - auth*",
      "locales:",
      "  - en",
      "formats:",
      "  en:",
      "    number:",
      "      money:",
      "        style: currency",
      "        currency: USD",
      "",
    ].join("\n"),
  );
  await writeFile(
    root,
    "messages/auth/signin.yml",
    [
      "description: Sign in",
      "translations:",
      "  en: Sign in",
      "overrides:",
      "  - key: adult",
      "    segments: adult",
      "    translations:",
      "      en: Adult sign in",
      "",
    ].join("\n"),
  );
  await writeFile(
    root,
    "segments/adult.yml",
    [
      "conditions:",
      "  - attribute: age",
      "    operator: greaterThanOrEquals",
      "    value: 18",
      "",
    ].join("\n"),
  );

  return root;
}

describe("evaluatePlugin", function () {
  it("evaluates segments using context without requiring a locale", async function () {
    const root = await createProject();
    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    await expect(
      evaluatePlugin.handler({
        projectConfig,
        datasource,
        parsed: {
          segment: "adult",
          context: JSON.stringify({ age: 21 }),
        },
      }),
    ).resolves.toBeUndefined();

    expect(logSpy).toHaveBeenCalledWith('Segment "adult" matched: true');
    logSpy.mockRestore();
  });

  it("still requires locale for message evaluation", async function () {
    const root = await createProject();
    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    try {
      await expect(
        evaluatePlugin.handler({
          projectConfig,
          datasource,
          parsed: {
            message: "auth.signin",
            context: JSON.stringify({}),
          },
        }),
      ).resolves.toEqual(false);

      expect(errorSpy).toHaveBeenCalledWith("Pass --locale=<locale>");
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("evaluates messages with JSON values using project-configured modules", async function () {
    const interpolationModulePath = path.join(
      path.resolve(__dirname, "../../../.."),
      "packages/module-interpolation/src/index.ts",
    );
    const root = await createProject(
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
      "messages/auth/signin.yml",
      ["description: Sign in", "translations:", "  en: Hello {name}", ""].join("\n"),
    );

    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    await expect(
      evaluatePlugin.handler({
        projectConfig,
        datasource,
        parsed: {
          message: "auth.signin",
          locale: "en",
          values: JSON.stringify({ name: "Ada" }),
        },
      }),
    ).resolves.toBeUndefined();

    expect(logSpy).toHaveBeenCalledWith("Hello Ada");
    logSpy.mockRestore();
  });

  it("evaluates keyed messages with context and applies overrides without requiring a target", async function () {
    const root = await createProject();
    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    await expect(
      evaluatePlugin.handler({
        projectConfig,
        datasource,
        parsed: {
          message: "auth.signin",
          locale: "en",
          context: JSON.stringify({ age: 21 }),
        },
      }),
    ).resolves.toBeUndefined();

    expect(logSpy).toHaveBeenCalledWith("Adult sign in");
    logSpy.mockRestore();
  });

  it("reports invalid values JSON clearly for message evaluation", async function () {
    const root = await createProject();
    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    try {
      await expect(
        evaluatePlugin.handler({
          projectConfig,
          datasource,
          parsed: {
            message: "auth.signin",
            locale: "en",
            values: "{not-json}",
          },
        }),
      ).resolves.toEqual(false);

      expect(errorSpy).toHaveBeenCalledWith("Invalid --values: expected valid JSON");
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("evaluates raw messages with JSON values using project-configured modules", async function () {
    const interpolationModulePath = path.join(
      path.resolve(__dirname, "../../../.."),
      "packages/module-interpolation/src/index.ts",
    );
    const root = await createProject(
      [
        `const { createInterpolationModule } = require(${JSON.stringify(interpolationModulePath)});`,
        "module.exports = {",
        "  modules: [createInterpolationModule()],",
        "};",
        "",
      ].join("\n"),
    );
    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    await expect(
      evaluatePlugin.handler({
        projectConfig,
        datasource,
        parsed: {
          rawMessage: "Hello {name}",
          locale: "en",
          values: JSON.stringify({ name: "Ada" }),
        },
      }),
    ).resolves.toBeUndefined();

    expect(logSpy).toHaveBeenCalledWith("Hello Ada");
    logSpy.mockRestore();
  });

  it("evaluates raw messages without target while still using locale formats", async function () {
    const icuModulePath = path.join(
      path.resolve(__dirname, "../../../.."),
      "packages/module-icu/src/index.ts",
    );
    const root = await createProject(
      [
        `const { createICUModule } = require(${JSON.stringify(icuModulePath)});`,
        "module.exports = {",
        "  modules: [createICUModule()],",
        "};",
        "",
      ].join("\n"),
    );
    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    await expect(
      evaluatePlugin.handler({
        projectConfig,
        datasource,
        parsed: {
          rawMessage: "Amount: {amount, number, decimal}",
          locale: "en",
          values: JSON.stringify({ amount: 12 }),
        },
      }),
    ).resolves.toBeUndefined();

    expect(logSpy).toHaveBeenCalledWith("Amount: 12.00");
    logSpy.mockRestore();
  });

  it("evaluates raw messages with target using the target-specific datafile formats", async function () {
    const icuModulePath = path.join(
      path.resolve(__dirname, "../../../.."),
      "packages/module-icu/src/index.ts",
    );
    const root = await createProject(
      [
        `const { createICUModule } = require(${JSON.stringify(icuModulePath)});`,
        "module.exports = {",
        "  modules: [createICUModule()],",
        "};",
        "",
      ].join("\n"),
    );
    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    await expect(
      evaluatePlugin.handler({
        projectConfig,
        datasource,
        parsed: {
          rawMessage: "Total: {amount, number, money}",
          locale: "en",
          target: "web",
          values: JSON.stringify({ amount: 12 }),
        },
      }),
    ).resolves.toBeUndefined();

    expect(String(logSpy.mock.calls[0][0])).toContain("12");
    expect(String(logSpy.mock.calls[0][0])).toContain("$");
    logSpy.mockRestore();
  });

  it("still requires locale for raw message evaluation", async function () {
    const root = await createProject();
    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    try {
      await expect(
        evaluatePlugin.handler({
          projectConfig,
          datasource,
          parsed: {
            rawMessage: "Hello {name}",
            values: JSON.stringify({ name: "Ada" }),
          },
        }),
      ).resolves.toEqual(false);

      expect(errorSpy).toHaveBeenCalledWith("Pass --locale=<locale>");
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("rejects using message and rawMessage together", async function () {
    const root = await createProject();
    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    try {
      await expect(
        evaluatePlugin.handler({
          projectConfig,
          datasource,
          parsed: {
            message: "auth.signin",
            rawMessage: "Hello {name}",
            locale: "en",
          },
        }),
      ).resolves.toEqual(false);

      expect(errorSpy).toHaveBeenCalledWith(
        "Pass either --message=<key> or --rawMessage=<message>, not both",
      );
    } finally {
      errorSpy.mockRestore();
    }
  });
});
