import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { getProjectConfig } from "../config";
import { Datasource } from "../datasource";
import { examplesPlugin, resolveExamples } from "./index";

async function writeFile(root: string, relativePath: string, content: string) {
  const filePath = path.join(root, relativePath);
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, content);
}

async function createProject(configContent = "module.exports = {};\n") {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-examples-"));

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
      "examples:",
      "  - description: Greeting raw",
      "    rawMessage: Hello {name}",
      "    values:",
      "      name: Ada",
      "    expectedByRuntime:",
      "      swift: Hello Ada from Swift",
      "    formats:",
      "      number:",
      "        adHoc:",
      "          maximumFractionDigits: 1",
      "  - matrix:",
      "      name: [John, Jane]",
      "      age: [30, 25]",
      "    description: Matrix ${{ name }}",
      "    rawMessage: Hello {name}! You are {age} years old.",
      "    values:",
      "      name: ${{ name }}",
      "      age: ${{ age }}",
      "  - description: Referenced message",
      "    message: auth.signin",
      "    context:",
      "      age: 21",
      "",
    ].join("\n"),
  );
  await writeFile(
    root,
    "locales/en-US.yml",
    [
      "description: English US",
      "inheritFormatsFrom: en",
      "inheritTranslationsFrom: en",
      "mergeExamplesFrom: en",
      "examples:",
      "  - description: Local US example",
      "    rawMessage: Welcome {name}",
      "    values:",
      "      name: Sam",
      "",
    ].join("\n"),
  );
  await writeFile(
    root,
    "messages/auth/signin.yml",
    [
      "description: Sign in",
      "examples:",
      "  - description: Default signin",
      "    locale: en",
      "    expectedByRuntime:",
      "      swift: Sign in from Swift",
      "  - matrix:",
      "      locale: [en, en-US]",
      "      age: [17, 21]",
      "    description: Signin for ${{ locale }} age ${{ age }}",
      "    locale: ${{ locale }}",
      "    context:",
      "      age: ${{ age }}",
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
      "description: Adult",
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
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-examples-sets-"));
  await writeFile(root, "messagevisor.config.js", "module.exports = { sets: true };\n");

  for (const set of ["dev", "production"]) {
    await writeFile(
      root,
      `sets/${set}/locales/en.yml`,
      [
        "description: English",
        "examples:",
        `  - description: ${set} raw`,
        `    rawMessage: Hello from ${set}`,
        "",
      ].join("\n"),
    );
  }

  return root;
}

function getDatasource(root: string) {
  const projectConfig = getProjectConfig(root);
  const datasource = new Datasource(projectConfig, root);

  return { projectConfig, datasource };
}

describe("examplesPlugin", function () {
  it("lists rich examples in JSON and evaluates raw and message examples", async function () {
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
    const { projectConfig, datasource } = getDatasource(root);
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    await examplesPlugin.handler({
      projectConfig,
      datasource,
      parsed: { json: true, pretty: true },
    } as any);

    const result = JSON.parse(String(logSpy.mock.calls[0][0]));
    expect(Array.isArray(result.locales)).toEqual(true);
    expect(Array.isArray(result.messages)).toEqual(true);
    expect(
      result.locales.some(
        (entry: any) =>
          entry.rawMessage === "Hello {name}" &&
          entry.evaluatedTranslation === "Hello Ada" &&
          entry.expectedByRuntime.swift === "Hello Ada from Swift",
      ),
    ).toEqual(true);
    expect(
      result.locales.some(
        (entry: any) =>
          entry.message === "auth.signin" &&
          entry.evaluatedTranslation === "Adult sign in" &&
          entry.sourceLocale === "en",
      ),
    ).toEqual(true);
    expect(
      result.locales.filter(
        (entry: any) => entry.description && entry.description.startsWith("Matrix "),
      ),
    ).toHaveLength(8);
    expect(
      result.locales.some(
        (entry: any) =>
          entry.locale === "en-US" &&
          entry.sourceLocale === "en" &&
          entry.description === "Matrix John",
      ),
    ).toEqual(true);
    expect(
      result.messages.some(
        (entry: any) =>
          entry.message === "auth.signin" &&
          entry.locale === "en" &&
          entry.description === "Default signin" &&
          entry.evaluatedTranslation === "Sign in" &&
          entry.expectedByRuntime.swift === "Sign in from Swift",
      ),
    ).toEqual(true);
    expect(
      result.messages.some(
        (entry: any) =>
          entry.message === "auth.signin" &&
          entry.locale === "en-US" &&
          entry.description === "Signin for en-US age 21" &&
          entry.evaluatedTranslation === "Adult sign in",
      ),
    ).toEqual(true);
    logSpy.mockRestore();
  });

  it("merges inherited examples before local examples for a locale", async function () {
    const root = await createProject();
    const { projectConfig, datasource } = getDatasource(root);
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    await examplesPlugin.handler({
      projectConfig,
      datasource,
      parsed: { locale: "en-US", json: true },
    } as any);

    const result = JSON.parse(String(logSpy.mock.calls[0][0]));
    expect(result.locales[0].sourceLocale).toEqual("en");
    expect(result.locales[result.locales.length - 1].sourceLocale).toEqual("en-US");
    logSpy.mockRestore();
  });

  it("can include evaluation input for external runtime conformance", async function () {
    const root = await createProject();
    const { projectConfig, datasource } = getDatasource(root);
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    await examplesPlugin.handler({
      projectConfig,
      datasource,
      parsed: { json: true, includeEvaluationInput: true },
    } as any);

    const result = JSON.parse(String(logSpy.mock.calls[0][0]));
    const rawExample = result.locales.find((entry: any) => entry.description === "Greeting raw");
    const localeMessageExample = result.locales.find(
      (entry: any) => entry.description === "Referenced message",
    );
    const messageExample = result.messages.find(
      (entry: any) => entry.description === "Default signin",
    );

    expect(rawExample.evaluationInput.defaultFormats.en.number.decimal).toEqual({
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    expect(rawExample.evaluationInput.formats.number.adHoc).toEqual({
      maximumFractionDigits: 1,
    });
    expect(localeMessageExample.evaluationInput.datafile.messages["auth.signin"]).toBeDefined();
    expect(Object.keys(localeMessageExample.evaluationInput.datafile.messages)).toEqual([
      "auth.signin",
    ]);
    expect(messageExample.evaluationInput.datafile.messages["auth.signin"]).toBeDefined();

    logSpy.mockRestore();
  });

  it("lists all sets by default and supports set filtering", async function () {
    const root = await createSetsProject();
    const { projectConfig, datasource } = getDatasource(root);
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    await examplesPlugin.handler({
      projectConfig,
      datasource,
      parsed: { json: true },
    } as any);

    const allResults = JSON.parse(String(logSpy.mock.calls[0][0]));
    expect(allResults.locales.map((entry: any) => entry.set).sort()).toEqual(["dev", "production"]);
    expect(allResults.messages).toEqual([]);

    logSpy.mockClear();

    await examplesPlugin.handler({
      projectConfig,
      datasource,
      parsed: { set: "dev", json: true },
    } as any);

    const devResults = JSON.parse(String(logSpy.mock.calls[0][0]));
    expect(devResults.locales).toHaveLength(1);
    expect(devResults.locales[0].set).toEqual("dev");
    logSpy.mockRestore();
  });

  it("supports example and matrix index filtering", async function () {
    const root = await createProject();
    const { projectConfig, datasource } = getDatasource(root);
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    await examplesPlugin.handler({
      projectConfig,
      datasource,
      parsed: { exampleIndex: 2, matrixIndex: 2, json: true },
    } as any);

    const result = JSON.parse(String(logSpy.mock.calls[0][0]));
    expect(result.locales).toHaveLength(2);
    expect(
      result.locales.every((entry: any) => entry.exampleIndex === 1 && entry.matrixIndex === 1),
    ).toEqual(true);
    expect(result.locales.every((entry: any) => entry.description === "Matrix John")).toEqual(true);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].description).toEqual("Signin for en age 21");
    logSpy.mockRestore();
  });

  it("supports description and evaluated translation pattern filtering", async function () {
    const root = await createProject();
    const { projectConfig, datasource } = getDatasource(root);
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    await examplesPlugin.handler({
      projectConfig,
      datasource,
      parsed: { locale: "en-US", descriptionPattern: "local us", json: true },
    } as any);

    const descriptionResult = JSON.parse(String(logSpy.mock.calls[0][0]));
    expect(descriptionResult.locales).toHaveLength(1);
    expect(descriptionResult.locales[0].description).toEqual("Local US example");
    expect(descriptionResult.messages).toEqual([]);

    logSpy.mockClear();

    await examplesPlugin.handler({
      projectConfig,
      datasource,
      parsed: { locale: "en-US", translationPattern: "adult sign in", json: true },
    } as any);

    const translationResult = JSON.parse(String(logSpy.mock.calls[0][0]));
    expect(translationResult.locales).toHaveLength(1);
    expect(translationResult.locales[0].evaluatedTranslation).toEqual("Adult sign in");
    expect(translationResult.messages).toHaveLength(1);
    expect(translationResult.messages[0].evaluatedTranslation).toEqual("Adult sign in");
    logSpy.mockRestore();
  });

  it("supports message example filtering by example and matrix index", async function () {
    const root = await createProject();
    const { projectConfig, datasource } = getDatasource(root);
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    await examplesPlugin.handler({
      projectConfig,
      datasource,
      parsed: { locale: "en-US", exampleIndex: 2, matrixIndex: 4, json: true },
    } as any);

    const result = JSON.parse(String(logSpy.mock.calls[0][0]));
    expect(result.locales).toHaveLength(1);
    expect(result.locales.every((entry: any) => entry.description === "Matrix Jane")).toEqual(true);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].description).toEqual("Signin for en-US age 21");
    logSpy.mockRestore();
  });

  it("supports resolving examples for a specific message", async function () {
    const root = await createProject();
    const { projectConfig, datasource } = getDatasource(root);

    const result = await resolveExamples(projectConfig, datasource, {
      onlyMessages: true,
      message: "auth.signin",
    });

    expect(result.locales).toEqual([]);
    expect(result.messages.length).toBeGreaterThan(0);
    expect(result.messages.every((entry) => entry.message === "auth.signin")).toEqual(true);
  });

  it("supports onlyMessages and onlyLocales output selection", async function () {
    const root = await createProject();
    const { projectConfig, datasource } = getDatasource(root);
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    await examplesPlugin.handler({
      projectConfig,
      datasource,
      parsed: { onlyMessages: true, json: true },
    } as any);

    const onlyMessagesResult = JSON.parse(String(logSpy.mock.calls[0][0]));
    expect(onlyMessagesResult.locales).toEqual([]);
    expect(onlyMessagesResult.messages.length).toBeGreaterThan(0);

    logSpy.mockClear();

    await examplesPlugin.handler({
      projectConfig,
      datasource,
      parsed: { onlyLocales: true, json: true },
    } as any);

    const onlyLocalesResult = JSON.parse(String(logSpy.mock.calls[0][0]));
    expect(onlyLocalesResult.locales.length).toBeGreaterThan(0);
    expect(onlyLocalesResult.messages).toEqual([]);
    logSpy.mockRestore();
  });

  it("fails when onlyMessages and onlyLocales are both requested", async function () {
    const root = await createProject();
    const { projectConfig, datasource } = getDatasource(root);
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    try {
      await expect(
        examplesPlugin.handler({
          projectConfig,
          datasource,
          parsed: { onlyMessages: true, onlyLocales: true },
        } as any),
      ).resolves.toEqual(false);

      expect(errorSpy).toHaveBeenCalledWith(
        "Pass either --onlyLocales or --onlyMessages, not both.",
      );
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("prints grouped plain output", async function () {
    const root = await createProject();
    const { projectConfig, datasource } = getDatasource(root);
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    await examplesPlugin.handler({
      projectConfig,
      datasource,
      parsed: {},
    } as any);

    const output = logSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).toContain("Locales");
    expect(output).toContain("Messages");
    expect(output).toContain('Locale "en":');
    expect(output).toContain('Message "auth.signin":');
    expect(output).toContain("Evaluated translation:");
    expect(output).toContain("Found ");
    logSpy.mockRestore();
  });
});
