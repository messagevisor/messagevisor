import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { getProjectConfig } from "../config";
import { Datasource } from "../datasource";
import { renameEntity } from "./index";

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
});
