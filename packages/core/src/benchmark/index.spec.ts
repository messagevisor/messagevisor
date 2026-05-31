import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { getProjectConfig } from "../config";
import { Datasource } from "../datasource";
import { benchmarkPlugin } from "./index";

async function writeFile(root: string, relativePath: string, content: string) {
  const filePath = path.join(root, relativePath);
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, content);
}

async function createProject(configContent = "module.exports = {};\n") {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-benchmark-"));

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

async function createSetsProject() {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-benchmark-sets-"));
  await writeFile(root, "messagevisor.config.js", "module.exports = { sets: true };\n");

  for (const set of ["dev", "production"]) {
    await writeFile(root, `sets/${set}/locales/en.yml`, "description: English\n");
    await writeFile(
      root,
      `sets/${set}/messages/auth/signin.yml`,
      `description: Sign in\ntranslations:\n  en: ${set}\n`,
    );
    await writeFile(
      root,
      `sets/${set}/targets/web.yml`,
      "description: Web\nincludeMessages:\n  - auth*\nlocales:\n  - en\n",
    );
  }

  return root;
}

function parsedOptions(options: Record<string, unknown>) {
  return {
    _: [],
    ...options,
  };
}

function pluginOptions(
  root: string,
  projectConfig: any,
  datasource: any,
  parsed: Record<string, unknown>,
) {
  return {
    rootDirectoryPath: root,
    projectConfig,
    datasource,
    parsed: parsedOptions(parsed),
  };
}

describe("benchmarkPlugin", function () {
  it("benchmarks keyed messages without target using a minimal datafile path", async function () {
    const root = await createProject();
    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    await benchmarkPlugin.handler(
      pluginOptions(root, projectConfig, datasource, {
        message: "auth.signin",
        locale: "en",
        context: JSON.stringify({ age: 21 }),
        n: "5",
        json: true,
      }),
    );

    const result = JSON.parse(logSpy.mock.calls[0][0]);
    expect(result.message).toEqual("auth.signin");
    expect(result.value).toEqual("Adult sign in");
    expect(result.iterations).toEqual(5);
    expect(result.target).toBeNull();
    expect(result.datafileCounts).toEqual({
      messages: 1,
      segments: 1,
      attributes: 1,
    });
    expect(result.minDuration).toBeGreaterThanOrEqual(0);
    expect(result.medianDuration).toBeGreaterThanOrEqual(result.minDuration);
    expect(result.maxDuration).toBeGreaterThanOrEqual(result.minDuration);
    expect(result.averageDuration).toBeGreaterThanOrEqual(0);
    logSpy.mockRestore();
  });

  it("benchmarks keyed messages with target and values using project-configured modules", async function () {
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

    await benchmarkPlugin.handler(
      pluginOptions(root, projectConfig, datasource, {
        message: "auth.signin",
        target: "web",
        locale: "en",
        values: JSON.stringify({ name: "Ada" }),
        n: "3",
        json: true,
      }),
    );

    const result = JSON.parse(logSpy.mock.calls[0][0]);
    expect(result.value).toEqual("Hello Ada");
    expect(result.target).toEqual("web");
    expect(result.datafileCounts).toEqual({
      messages: 1,
      segments: 0,
      attributes: 0,
    });
    logSpy.mockRestore();
  });

  it("benchmarks raw messages with locale formats and project-configured modules", async function () {
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

    await benchmarkPlugin.handler(
      pluginOptions(root, projectConfig, datasource, {
        rawMessage: "Amount: {amount, number, decimal}",
        locale: "en",
        values: JSON.stringify({ amount: 12 }),
        n: "4",
        json: true,
      }),
    );

    const result = JSON.parse(logSpy.mock.calls[0][0]);
    expect(result.rawMessage).toEqual("Amount: {amount, number, decimal}");
    expect(result.value).toEqual("Amount: 12.00");
    expect(result.datafileCounts).toEqual({
      messages: 0,
      segments: 0,
      attributes: 0,
    });
    logSpy.mockRestore();
  });

  it("benchmarks raw messages with target-aware formats", async function () {
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

    await benchmarkPlugin.handler(
      pluginOptions(root, projectConfig, datasource, {
        rawMessage: "Total: {amount, number, money}",
        locale: "en",
        target: "web",
        values: JSON.stringify({ amount: 12 }),
        json: true,
      }),
    );

    const result = JSON.parse(logSpy.mock.calls[0][0]);
    expect(String(result.value)).toContain("12");
    expect(result.target).toEqual("web");
    expect(result.datafileCounts).toEqual({
      messages: 1,
      segments: 1,
      attributes: 1,
    });
    logSpy.mockRestore();
  });

  it("prints benchmark summary in the requested order", async function () {
    const root = await createProject();
    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    await benchmarkPlugin.handler(
      pluginOptions(root, projectConfig, datasource, {
        message: "auth.signin",
        locale: "en",
        n: "2",
      }),
    );

    const output = logSpy.mock.calls.map((call) => String(call[0])).filter(Boolean);
    expect(output[0]).toEqual("Benchmark target : auth.signin");
    expect(output[1]).toEqual("Iterations       : 2");
    expect(output[2]).toEqual("Datafile         : 1 messages, 1 segments, 1 attributes");
    expect(output[3]).toEqual("Locale           : en");
    expect(output[4]).toEqual('Evaluated value  : "Sign in"');
    expect(output[5]).toMatch(/^Total duration   : /);
    expect(output[6]).toMatch(/^Min duration     : /);
    expect(output[7]).toMatch(/^Median duration  : /);
    expect(output[8]).toMatch(/^Max duration     : /);
    expect(output[9]).toMatch(/^Average duration : /);
    logSpy.mockRestore();
  });

  it("validates required inputs and JSON parsing", async function () {
    const root = await createProject();
    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    async function expectFriendlyFailure(parsed: Record<string, unknown>, message: string) {
      await expect(
        benchmarkPlugin.handler(pluginOptions(root, projectConfig, datasource, parsed)),
      ).resolves.toEqual(false);
      expect(errorSpy).toHaveBeenCalledWith(message);
      errorSpy.mockClear();
    }

    try {
      await expectFriendlyFailure({}, "Pass --message=<key> or --rawMessage=<message>");
      await expectFriendlyFailure(
        {
          message: "auth.signin",
          rawMessage: "Hello",
          locale: "en",
        },
        "Pass either --message=<key> or --rawMessage=<message>, not both",
      );
      await expectFriendlyFailure({ message: "auth.signin" }, "Pass --locale=<locale>");
      await expectFriendlyFailure(
        {
          message: "auth.signin",
          locale: "en",
          context: "{bad}",
        },
        "Invalid --context: expected valid JSON",
      );
      await expectFriendlyFailure(
        {
          message: "auth.signin",
          locale: "en",
          values: "{bad}",
        },
        "Invalid --values: expected valid JSON",
      );
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("requires --set for sets-enabled projects", async function () {
    const root = await createSetsProject();
    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    try {
      await expect(
        benchmarkPlugin.handler(
          pluginOptions(root, projectConfig, datasource, {
            message: "auth.signin",
            locale: "en",
          }),
        ),
      ).resolves.toEqual(false);

      expect(errorSpy).toHaveBeenCalledWith("Pass --set=<set>");
    } finally {
      errorSpy.mockRestore();
    }
  });
});
