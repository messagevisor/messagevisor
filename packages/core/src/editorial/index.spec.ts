import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { getProjectConfig } from "../config";
import { Datasource } from "../datasource";
import { lintProject } from "../linter";
import { previewEntityMutations, renameEntity } from "./index";

describe("editorial mutations", function () {
  let root: string;
  let datasource: Datasource;
  let projectConfig: ReturnType<typeof getProjectConfig>;

  beforeEach(async function () {
    root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-editorial-"));
    await fs.promises.writeFile(
      path.join(root, "messagevisor.config.js"),
      "module.exports = {};\n",
    );
    projectConfig = getProjectConfig(root);
    datasource = new Datasource(projectConfig, root);
    await datasource.writeLocale("en", {
      description: "English",
      examples: [{ message: "welcome" }],
    });
    await datasource.writeMessage("welcome", {
      description: "Welcome",
      translations: { en: "Hello" },
    });
    await datasource.writeTarget("web", {
      description: "Web",
      locales: ["en"],
      includeMessages: ["welcome"],
    });
    await datasource.writeTest("welcome", {
      message: "welcome",
      assertions: [{ locale: "en", target: "web", expectedTranslation: "Hello" }],
    });
  });

  afterEach(async function () {
    await fs.promises.rm(root, { recursive: true, force: true });
  });

  it("previews and atomically applies reference-aware entity renames", async function () {
    const reads = jest.spyOn(datasource, "readEntity");
    const documentReads = jest.spyOn(datasource, "readEntityDocument");
    const preview = await renameEntity(
      projectConfig,
      datasource,
      "message",
      "welcome",
      "greeting",
      {
        dryRun: true,
      },
    );
    expect(preview.applied).toBe(false);
    expect(reads).not.toHaveBeenCalled();
    expect(documentReads).toHaveBeenCalledTimes(4);
    expect(preview.issues).toEqual([]);
    expect(await datasource.messageExists("welcome")).toBe(true);
    expect(preview.mutations.map((mutation) => `${mutation.type}:${mutation.key}`)).toEqual(
      expect.arrayContaining([
        "message:welcome",
        "message:greeting",
        "locale:en",
        "target:web",
        "test:welcome",
      ]),
    );

    const result = await renameEntity(projectConfig, datasource, "message", "welcome", "greeting");
    expect(result.applied).toBe(true);
    expect(await datasource.messageExists("welcome")).toBe(false);
    expect(await datasource.messageExists("greeting")).toBe(true);
    expect((await datasource.readLocale("en")).examples?.[0].message).toBe("greeting");
    expect((await datasource.readTarget("web")).includeMessages).toEqual(["greeting"]);
    expect(((await datasource.readTest("welcome")) as any).message).toBe("greeting");
  });

  it("renames Target assertion message arrays while preserving raw copy and values", async () => {
    await datasource.writeTest("target", {
      target: "web",
      assertions: [
        {
          locale: "en",
          expectedToIncludeMessages: ["welcome"],
          expectedToNotIncludeMessages: ["welcome"],
          message: "welcome",
          expectedTranslation: "welcome",
          values: { message: "welcome", nested: { message: "welcome" } },
        },
      ],
    });
    const result = await renameEntity(projectConfig, datasource, "message", "welcome", "greeting");
    expect(result.issues).toEqual([]);
    expect(result.applied).toBe(true);
    expect((await datasource.readTest("target")).assertions[0]).toMatchObject({
      expectedToIncludeMessages: ["greeting"],
      expectedToNotIncludeMessages: ["greeting"],
      message: "greeting",
      expectedTranslation: "welcome",
      values: { message: "welcome", nested: { message: "welcome" } },
    });
  });

  it("uses canonical semantic errors without writing entities or a parse cache", async () => {
    const writes = jest.spyOn(datasource, "applyEntityMutations");
    const reads = jest.spyOn(datasource, "readEntity");
    const fingerprints = jest.spyOn(datasource, "getEntityFingerprint");
    const cachePath = jest.spyOn(datasource, "getSnapshotCachePath");
    const preview = await previewEntityMutations(projectConfig, datasource, [
      {
        operation: "write",
        type: "locale",
        key: "en",
        entity: { description: "English", inheritTranslationsFrom: "en" },
      },
    ]);
    expect(preview.issues.some((issue) => /circular/i.test(issue.message))).toBe(true);
    expect(reads).toHaveBeenCalledTimes(3);
    expect(fingerprints).not.toHaveBeenCalled();
    expect(cachePath).not.toHaveBeenCalled();
    expect(writes).toHaveBeenCalledTimes(1);
    expect(writes.mock.calls[0][1]).toEqual({ dryRun: true });
    expect(fs.existsSync(path.join(root, ".messagevisor", "cache"))).toBe(false);
    expect((await datasource.readLocale("en")).inheritTranslationsFrom).toBeUndefined();
  });

  it.each([
    ["message", null],
    ["message", { translations: { en: "Hello" }, overrides: [null] }],
    ["target", { locales: 42, includeMessages: {} }],
    ["locale", []],
    ["attribute", { type: null }],
  ] as const)("reports malformed %s projections without throwing", async (type, entity) => {
    const result = await previewEntityMutations(projectConfig, datasource, [
      {
        operation: "write",
        type,
        key: "malformed",
        entity,
      },
    ]);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ type, key: "malformed" })]),
    );
  });

  it("preserves canonical selective validation and ICU configuration", async () => {
    await datasource.writeMessage("bad", {
      description: "Bad ICU",
      translations: { en: "{broken" },
    });
    const options = { entityType: "message", keyPattern: "^bad$" };
    const canonical = await lintProject(projectConfig, datasource, options);
    const preview = await previewEntityMutations(projectConfig, datasource, [], options);
    expect(preview.issues).toEqual(
      canonical.errors.map((error) => ({
        type: error.entityType,
        key: error.entityKey,
        path: error.path,
        message: error.message,
        code: error.code,
      })),
    );
    expect(preview.issues.length).toBeGreaterThan(0);
    expect(
      (await previewEntityMutations({ ...projectConfig, lintIcu: false }, datasource, [], options))
        .issues,
    ).toEqual([]);
    const reads = jest.spyOn(datasource, "readEntity");
    expect(
      (await previewEntityMutations(projectConfig, datasource, [], { entityType: "attribute" }))
        .issues,
    ).toEqual([]);
    expect(reads).not.toHaveBeenCalled();
  });

  it("includes project validation errors and parses broken sources only once", async () => {
    await fs.promises.writeFile(path.join(root, "messages", "broken.yml"), "translations: [");
    const reads = jest.spyOn(datasource, "readEntity");
    const preview = await previewEntityMutations(
      { ...projectConfig, sourceLocale: "missing" },
      datasource,
      [],
    );
    expect(preview.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "project", code: "unknown_source_locale" }),
        expect.objectContaining({ type: "message", key: "broken" }),
      ]),
    );
    expect(
      reads.mock.calls.filter(([type, key]) => type === "message" && key === "broken"),
    ).toHaveLength(1);
  });
});
