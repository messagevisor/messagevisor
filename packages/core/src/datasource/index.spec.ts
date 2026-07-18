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

    await expect(datasource.writeMessage("common.welcome", message)).resolves.toEqual({
      ...message,
      key: "common.welcome",
    });
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

  it("treats file paths as canonical keys and never persists derived keys", async function () {
    await fs.promises.mkdir(path.join(root, "messages"), { recursive: true });
    await fs.promises.writeFile(
      path.join(root, "messages", "welcome.yml"),
      'key: "spoofed"\ntranslations:\n  en: Hello\n',
    );

    await expect(datasource.readMessage("welcome")).resolves.toEqual({
      key: "welcome",
      translations: { en: "Hello" },
    });

    await datasource.writeMessage("welcome", {
      key: "also-spoofed",
      translations: { en: "Updated" },
    });
    expect(
      await fs.promises.readFile(path.join(root, "messages", "welcome.yml"), "utf8"),
    ).not.toContain("key:");
  });

  it("rejects unsafe and non-portable entity keys", async function () {
    for (const key of ["", "../secret", "common/secret", "common..secret", "common.$secret"]) {
      await expect(datasource.writeMessage(key, { translations: { en: "Hello" } })).rejects.toThrow(
        /entity key|namespace segments/i,
      );
    }
  });

  it("supports versioned atomic mutation previews and conflict detection", async function () {
    await datasource.writeMessage("welcome", { translations: { en: "Hello" } });
    const original = await datasource.readEntityDocument<Message>("message", "welcome");

    const preview = await datasource.applyEntityMutations(
      [
        {
          operation: "write",
          type: "message",
          key: "welcome",
          expectedVersion: original.version,
          entity: { translations: { en: "Preview" } },
        },
      ],
      { dryRun: true },
    );
    expect(preview[0].version).not.toEqual(original.version);
    expect((await datasource.readMessage("welcome")).translations.en).toBe("Hello");

    await datasource.applyEntityMutations([
      {
        operation: "write",
        type: "message",
        key: "welcome",
        expectedVersion: original.version,
        entity: { key: "ignored", translations: { en: "Updated" } },
      },
      {
        operation: "write",
        type: "message",
        key: "created",
        expectedVersion: null,
        entity: { translations: { en: "Created" } },
      },
    ]);

    expect((await datasource.readMessage("welcome")).translations.en).toBe("Updated");
    await expect(
      datasource.applyEntityMutations([
        {
          operation: "delete",
          type: "message",
          key: "welcome",
          expectedVersion: original.version,
        },
      ]),
    ).rejects.toThrow(/Entity conflict/);
    await expect(
      datasource.applyEntityMutations([
        { operation: "delete", type: "message", key: "created" },
        { operation: "delete", type: "message", key: "created" },
      ]),
    ).rejects.toThrow(/same entity/);
  });
});
