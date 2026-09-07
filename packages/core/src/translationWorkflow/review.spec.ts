import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { createHash } from "crypto";
import { getProjectConfig, type ProjectConfig } from "../config";
import { Datasource } from "../datasource";
import { applyTranslationReview, previewTranslationReview, reviewPlugin } from "./review";

describe("saved human review", () => {
  let root: string;
  let datasource: Datasource;
  let config: ProjectConfig;
  beforeEach(async () => {
    root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-saved-review-"));
    await fs.promises.writeFile(
      path.join(root, "messagevisor.config.js"),
      'module.exports = { sourceLocale: "en-US" };',
    );
    config = getProjectConfig(root);
    datasource = new Datasource(config, root);
    await datasource.writeLocale("en", { description: "English" });
    await datasource.writeLocale("en-US", { inheritTranslationsFrom: "en" });
    await datasource.writeLocale("nl", { description: "Dutch" });
    await datasource.writeMessage("hello", {
      translations: { en: "Hello {name}", nl: "Hallo {name}" },
      overrides: [{ key: "pro", segments: "*", translations: { en: "Pro", nl: "" } }],
    });
    await datasource.writeTarget("web", { locales: ["nl"] });
    jest.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await fs.promises.rm(root, { recursive: true, force: true });
  });
  const run = (parsed: Record<string, unknown>) =>
    reviewPlugin.handler({
      rootDirectoryPath: root,
      projectConfig: config,
      datasource,
      parsed: { _: [], ...parsed },
    });

  it("binds readable source and target copy, inherited sources and empty overrides", async () => {
    const preview = await previewTranslationReview(config, datasource, { locale: "nl" });
    expect(preview.entries).toMatchObject([
      {
        messageKey: "hello",
        locale: "nl",
        sourceLocale: "en-US",
        resolvedSourceLocale: "en",
        source: "Hello {name}",
        target: "Hallo {name}",
      },
      { messageKey: "hello", overrideKey: "pro", source: "Pro", target: "" },
    ]);
    expect(preview.token).toMatch(/^[a-f0-9]{64}$/);
    await applyTranslationReview(datasource, JSON.parse(JSON.stringify(preview)));
    expect((await datasource.readMessage("hello")).translationStates?.nl?.status).toBe("reviewed");
  });

  it.each(["source", "target", "description", "inheritance", "targetSelection", "sourceLocale"])(
    "rejects changes to %s after inspection before writing anything",
    async (change) => {
      const preview = await previewTranslationReview(config, datasource, { target: "web" });
      const message = await datasource.readMessage("hello");
      if (change === "source") message.translations.en = "Unseen source";
      if (change === "target") message.translations.nl = "Unseen translation";
      if (change === "description") message.description = "Unseen context";
      if (["source", "target", "description"].includes(change))
        await datasource.writeMessage("hello", message);
      if (change === "inheritance")
        await datasource.writeLocale("en-US", { inheritTranslationsFrom: "nl" });
      if (change === "targetSelection") await datasource.writeTarget("web", { locales: [] });
      if (change === "sourceLocale") config.sourceLocale = "en";
      await expect(applyTranslationReview(datasource, preview)).rejects.toMatchObject({
        code: "review_preview_conflict",
      });
      expect((await datasource.readMessage("hello")).translationStates).toBeUndefined();
    },
  );

  it.each(["text", "mutation", "selection", "token", "version"])(
    "rejects a modified saved %s",
    async (field) => {
      const preview = await previewTranslationReview(config, datasource, { locale: "nl" });
      if (field === "text") preview.entries[0].target = "Different copy";
      if (field === "mutation") preview.mutations = [];
      if (field === "selection") preview.options.locale = "en";
      if (field === "token") preview.token = "invalid";
      if (field === "version") (preview as any).version = 2;
      await expect(applyTranslationReview(datasource, preview)).rejects.toMatchObject({
        code: "review_preview_conflict",
      });
    },
  );

  it("creates private exclusive files and requires a saved preview when applying", async () => {
    await expect(run({ apply: true, locale: "nl" })).rejects.toMatchObject({
      code: "invalid_review_options",
    });
    await run({ locale: "nl", output: "review.json", json: true });
    const file = path.join(root, "review.json");
    expect((await fs.promises.stat(file)).mode & 0o777).toBe(0o600);
    const saved = JSON.parse(await fs.promises.readFile(file, "utf8"));
    expect(saved.previews[0].preview.entries[0].target).toBe("Hallo {name}");
    await expect(run({ locale: "nl", output: "review.json" })).rejects.toMatchObject({
      code: "EEXIST",
    });
    await expect(
      run({ apply: true, input: "review.json", status: "reviewed" }),
    ).rejects.toMatchObject({ code: "invalid_review_options" });
    await expect(run({ apply: true, input: "review.json", json: true })).resolves.toBe(true);
    expect((await datasource.readMessage("hello")).translationStates?.nl?.status).toBe("reviewed");
    await expect(run({ apply: true, input: "review.json" })).rejects.toMatchObject({
      code: "review_preview_conflict",
    });
  });

  it("resolves preview paths from the project root independently of the exports directory", async () => {
    config.exportsDirectoryPath = path.join(root, "custom", "exports");
    await run({ locale: "nl", output: "review.json" });
    const file = JSON.parse(await fs.promises.readFile(path.join(root, "review.json"), "utf8"));
    expect(file.previews[0].preview.entries[0].target).toBe("Hallo {name}");
    await expect(run({ apply: true, input: "review.json" })).resolves.toBe(true);
    expect((await datasource.readMessage("hello")).translationStates?.nl?.status).toBe("reviewed");
  });

  it("rejects stale saved files even when apply starts in a fresh datasource", async () => {
    await run({ locale: "nl", output: "review.json" });
    const message = await datasource.readMessage("hello");
    message.translations.nl = "Changed after preview";
    await datasource.writeMessage("hello", message);
    datasource = new Datasource(config, root);
    await expect(run({ apply: true, input: "review.json" })).rejects.toMatchObject({
      code: "review_preview_conflict",
    });
    expect((await datasource.readMessage("hello")).translationStates).toBeUndefined();
  });

  it("rejects envelope edits before reading any project documents", async () => {
    await run({ locale: "nl", output: "review.json" });
    const file = path.join(root, "review.json");
    const saved = JSON.parse(await fs.promises.readFile(file, "utf8"));
    saved.previews[0].set = "somewhereElse";
    await fs.promises.writeFile(file, JSON.stringify(saved));
    const reads = jest.spyOn(datasource, "readEntityDocument");
    await expect(run({ apply: true, input: "review.json" })).rejects.toMatchObject({
      code: "invalid_review_preview",
    });
    expect(reads).not.toHaveBeenCalled();
  });

  it("does not execute injected mutations even with a recomputed content checksum", async () => {
    const preview = await previewTranslationReview(config, datasource, { locale: "nl" });
    preview.mutations.push({ operation: "delete", type: "message", key: "hello" });
    const content = Object.fromEntries(Object.entries(preview).filter(([key]) => key !== "token"));
    preview.token = createHash("sha256")
      .update(
        JSON.stringify(content, (_key, value) =>
          value && typeof value === "object" && !Array.isArray(value)
            ? Object.fromEntries(
                Object.keys(value)
                  .sort()
                  .map((key) => [key, value[key]]),
              )
            : value,
        ),
      )
      .digest("hex");
    await expect(applyTranslationReview(datasource, preview)).rejects.toMatchObject({
      code: "review_preview_conflict",
    });
    expect((await datasource.readMessage("hello")).translationStates).toBeUndefined();
  });

  it("refuses a concurrently enlarged selection rather than approving newly added copy", async () => {
    await run({ locale: "nl", output: "review.json" });
    await datasource.writeMessage("new", { translations: { en: "New", nl: "Nieuw" } });
    await expect(run({ apply: true, input: "review.json" })).rejects.toMatchObject({
      code: "review_preview_conflict",
    });
    expect((await datasource.readMessage("hello")).translationStates).toBeUndefined();
    expect((await datasource.readMessage("new")).translationStates).toBeUndefined();
  });

  it("validates every saved set before applying the first set", async () => {
    await fs.promises.writeFile(
      path.join(root, "messagevisor.config.js"),
      'module.exports = { sourceLocale: "en", sets: true };',
    );
    config = { ...getProjectConfig(root), sourceLocale: "en", sets: true };
    datasource = new Datasource(config, root);
    for (const set of ["dev", "production"]) {
      const source = datasource.forSet(set);
      await source.writeLocale("en", {});
      await source.writeLocale("nl", {});
      await source.writeMessage("hello", { translations: { en: "Hello", nl: "Hallo" } });
    }
    await run({ locale: "nl", output: "sets.json" });
    await datasource
      .forSet("production")
      .writeMessage("hello", { translations: { en: "Hello", nl: "Edited" } });
    await expect(run({ apply: true, input: "sets.json" })).rejects.toMatchObject({
      code: "review_preview_conflict",
    });
    expect((await datasource.forSet("dev").readMessage("hello")).translationStates).toBeUndefined();
  });

  it("binds a preview to its project storage identity", async () => {
    const preview = await previewTranslationReview(config, datasource, { locale: "nl" });
    config.messagesDirectoryPath = path.join(root, "different-messages");
    await expect(applyTranslationReview(datasource, preview)).rejects.toThrow();
  });

  it.each([
    "null",
    "{}",
    '{"version":1,"previews":[]}',
    '{"version":1,"previews":[null]}',
    "not json",
  ])("rejects malformed preview input %s", async (content) => {
    await fs.promises.writeFile(path.join(root, "invalid.json"), content);
    await expect(run({ apply: true, input: "invalid.json" })).rejects.toMatchObject({
      code: "invalid_review_preview",
    });
  });

  it("prints actual copy in human output", async () => {
    await run({ locale: "nl" });
    expect(console.log).toHaveBeenCalledWith('  Source: "Hello {name}"');
    expect(console.log).toHaveBeenCalledWith('  Target: "Hallo {name}"');
  });

  it("keeps adapter version checks for edits racing after preview validation", async () => {
    const preview = await previewTranslationReview(config, datasource, { locale: "nl" });
    const apply = datasource.applyEntityMutations.bind(datasource);
    jest
      .spyOn(datasource, "applyEntityMutations")
      .mockImplementation(async (mutations, options) => {
        if (!options?.dryRun)
          await datasource.writeMessage("hello", { translations: { en: "New", nl: "New" } });
        return apply(mutations, options);
      });
    await expect(applyTranslationReview(datasource, preview)).rejects.toMatchObject({
      code: "entity_conflict",
    });
  });
});
