import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { getProjectConfig } from "../config";
import { Datasource } from "../datasource";
import { runCLI } from "./index";

describe("translation workflow command integration", () => {
  const argv = process.argv;
  const exitCode = process.exitCode;
  let root: string;
  let log: jest.SpyInstance;

  beforeEach(async () => {
    root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-workflow-cli-"));
    await fs.promises.writeFile(
      path.join(root, "messagevisor.config.js"),
      'module.exports = { sourceLocale: "en" };',
    );
    const config = getProjectConfig(root);
    const datasource = new Datasource(config, root);
    await datasource.writeLocale("en", { description: "English" });
    await datasource.writeLocale("nl", { description: "Dutch" });
    await datasource.writeMessage("welcome", {
      description: "Welcome",
      translations: { en: "Hello {name}", nl: "Hallo {name}" },
    });
    await datasource.writeTarget("web", { description: "Web" });
    log = jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(async () => {
    process.argv = argv;
    process.exitCode = exitCode;
    jest.restoreAllMocks();
    await fs.promises.rm(root, { recursive: true, force: true });
  });

  const run = (args: string[]) => {
    process.argv = ["node", "messagevisor", ...args];
    const projectConfig = getProjectConfig(root);
    return runCLI({
      rootDirectoryPath: root,
      projectConfig,
      datasource: new Datasource(projectConfig, root),
    });
  };

  it("reports readiness and fails explicitly requested review gates", async () => {
    expect(await run(["readiness", "--locale=nl", "--target=web", "--json"])).toBe(true);
    expect(JSON.parse(log.mock.calls[0][0]).summary.direct).toBe(1);
    log.mockClear();
    expect(await run(["readiness", "--locale=nl", "--requireReviewed", "--json"])).toBe(false);
    expect(JSON.parse(log.mock.calls[0][0]).failures).toContain("unreviewed_translations");
  });

  it("previews pseudo translations without changing the source", async () => {
    const before = await fs.promises.readFile(path.join(root, "messages/welcome.yml"), "utf8");
    expect(
      await run(["quality", "--locale=nl", "--pseudo=accent", "--expansion=0.5", "--json"]),
    ).toBe(true);
    const report = JSON.parse(log.mock.calls[0][0]);
    expect(report.entries[0].pseudo).toContain("{name}");
    expect(report.entries[0].pseudo).not.toBe("Hallo {name}");
    expect(await fs.promises.readFile(path.join(root, "messages/welcome.yml"), "utf8")).toBe(
      before,
    );
  });

  it("previews review hashes, applies them, and passes the readiness gate", async () => {
    const file = path.join(root, "messages/welcome.yml");
    const before = await fs.promises.readFile(file, "utf8");
    expect(await run(["review", "--locale=nl", "--output=review.json", "--json"])).toBe(true);
    expect(await fs.promises.readFile(file, "utf8")).toBe(before);
    expect(await run(["review", "--apply", "--input=review.json", "--json"])).toBe(true);
    const config = getProjectConfig(root);
    const message = await new Datasource(config, root).readMessage("welcome");
    expect(message.translationStates?.nl).toMatchObject({
      status: "reviewed",
      sourceHash: expect.any(String),
      targetHash: expect.any(String),
    });
    expect(await run(["readiness", "--locale=nl", "--requireReviewed", "--json"])).toBe(true);
  });

  it("infers RTL direction in a real project and exposes unavailable direction coverage", async () => {
    const config = getProjectConfig(root);
    const source = new Datasource(config, root);
    await source.writeLocale("ar", { description: "Arabic" });
    await source.writeMessage("arabic", { translations: { ar: "مرحبا {name}" } });
    expect(await run(["quality", "--locale=ar", "--bidi", "--json"])).toBe(false);
    expect(JSON.parse(log.mock.calls.at(-1)![0]).entries[0].issues).toMatchObject([
      { code: "bidi_unisolated_argument", argument: "name" },
    ]);
    await source.writeLocale("ar", { description: "Arabic", direction: "ltr" });
    expect(await run(["quality", "--locale=ar", "--bidi", "--json"])).toBe(true);
    await source.writeLocale("custom_locale", { description: "Private locale" });
    await source.writeMessage("custom", { translations: { custom_locale: "Hello {name}" } });
    expect(await run(["quality", "--locale=custom_locale", "--bidi", "--json"])).toBe(false);
    expect(JSON.parse(log.mock.calls.at(-1)![0]).entries[0].issues).toMatchObject([
      { code: "bidi_unknown_direction" },
    ]);
  });

  it("does not approve edits made after a saved CLI preview", async () => {
    expect(await run(["review", "--locale=nl", "--output=approval.json"])).toBe(true);
    const source = new Datasource(getProjectConfig(root), root);
    const message = await source.readMessage("welcome");
    message.translations.nl = "Unseen {name}";
    await source.writeMessage("welcome", message);
    const error = jest.spyOn(console, "error").mockImplementation(() => {});
    expect(await run(["review", "--apply", "--input=approval.json"])).toBe(false);
    expect(error).toHaveBeenCalled();
    expect((await source.readMessage("welcome")).translationStates).toBeUndefined();
  });

  it("exports and previews importing XLIFF through the public command parser", async () => {
    const file = path.join(root, "translations.xlf");
    expect(await run(["export", "--format=xliff", "--locale=nl", "--output", file])).toBe(true);
    expect(await fs.promises.readFile(file, "utf8")).toContain("<xliff");
    expect(await run(["import", "--format=xliff", "--input", file])).toBe(true);
  });

  it("rejects an invalid interchange format before opening any input", async () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => {});
    expect(await run(["import", "--format=invalid", "--input=absent.xlf"])).toBe(false);
    expect(error).toHaveBeenCalled();
  });
});
