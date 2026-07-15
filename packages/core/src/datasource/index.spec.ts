import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import type { Message } from "@messagevisor/types";

import { getProjectConfig } from "../config";
import { Datasource } from "./index";

describe("Datasource adapter contract", function () {
  let root: string;
  let datasource: Datasource;

  beforeEach(async function () {
    root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-datasource-"));
    await fs.promises.writeFile(
      path.join(root, "messagevisor.config.js"),
      "module.exports = {};\n",
    );
    datasource = new Datasource(getProjectConfig(root), root);
  });

  afterEach(async function () {
    await fs.promises.rm(root, { recursive: true, force: true });
  });

  it("supports generic and entity-specific CRUD with canonical return values", async function () {
    const message: Message = { translations: { en: "Hello" } };

    await expect(datasource.writeMessage("common.welcome", message)).resolves.toBe(message);
    expect(await datasource.messageExists("common.welcome")).toBe(true);
    expect(await datasource.entityExists("message", "common.welcome")).toBe(true);
    await expect(datasource.readMessage("common.welcome")).resolves.toEqual({
      key: "common.welcome",
      ...message,
    });

    await datasource.deleteEntity("message", "common.welcome");
    expect(await datasource.messageExists("common.welcome")).toBe(false);
    await expect(datasource.deleteMessage("common.welcome")).resolves.toBeUndefined();
  });

  it("uses hidden temporary files and leaves none behind after atomic writes", async function () {
    await datasource.writeRevision("42");
    await datasource.writeMessage("welcome", { translations: { en: "Hello" } });

    const entries = await fs.promises.readdir(path.join(root, "messages"));
    expect(entries).toEqual(["welcome.yml"]);
    expect(await datasource.readRevision()).toBe("42");
  });
});
