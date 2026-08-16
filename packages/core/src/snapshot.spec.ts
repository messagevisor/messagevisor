import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { getProjectConfig } from "./config";
import { Datasource } from "./datasource";
import { loadProjectSnapshot } from "./snapshot";

async function writeFile(root: string, relativePath: string, content: string) {
  const filePath = path.join(root, relativePath);
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, content);
}

describe("loadProjectSnapshot", function () {
  it("loads requested entities once and provides fast key membership lookups", async function () {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-snapshot-"));

    try {
      await writeFile(root, "messagevisor.config.js", "module.exports = {}\n");
      await writeFile(root, "locales/en.yml", "description: English\n");
      await writeFile(root, "messages/welcome.yml", "translations:\n  en: Welcome\n");
      await writeFile(root, "segments/member.yml", "conditions: []\n");

      const datasource = new Datasource(getProjectConfig(root), root);
      const snapshot = await loadProjectSnapshot(datasource, {
        entityTypes: ["locale", "message"],
        concurrency: 2,
      });

      expect(snapshot.keys.locale).toEqual(["en"]);
      expect(snapshot.keys.message).toEqual(["welcome"]);
      expect(Array.from(snapshot.loadedEntityTypes)).toEqual(["locale", "message"]);
      expect(snapshot.keySets.message.has("welcome")).toBe(true);
      expect(snapshot.keySets.message.has("missing")).toBe(false);
      expect(snapshot.segments).toEqual({});
      expect(snapshot.messages.welcome.translations.en).toBe("Welcome");
    } finally {
      await fs.promises.rm(root, { recursive: true, force: true });
    }
  });

  it("reuses parsed entities when source file fingerprints are unchanged", async function () {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-snapshot-cache-"));

    try {
      await writeFile(root, "messagevisor.config.js", "module.exports = {}\n");
      await writeFile(root, "locales/en.yml", "description: English\n");
      await writeFile(root, "messages/welcome.yml", "translations:\n  en: Welcome\n");

      const datasource = new Datasource(getProjectConfig(root), root);
      const readEntity = jest.spyOn(datasource, "readEntity");

      await loadProjectSnapshot(datasource, { entityTypes: ["locale", "message"] });
      expect(readEntity).toHaveBeenCalledTimes(2);

      readEntity.mockClear();
      await loadProjectSnapshot(datasource, { entityTypes: ["locale", "message"] });
      expect(readEntity).not.toHaveBeenCalled();

      expect(datasource.getSnapshotCachePath()).toContain(path.join(".messagevisor", "cache"));
      readEntity.mockClear();
      await loadProjectSnapshot(datasource, { entityTypes: ["locale", "message"], cache: false });
      expect(readEntity).toHaveBeenCalledTimes(2);

      const previousNoCache = process.env.MESSAGEVISOR_NO_CACHE;
      process.env.MESSAGEVISOR_NO_CACHE = "1";
      try {
        readEntity.mockClear();
        await loadProjectSnapshot(datasource, { entityTypes: ["locale", "message"] });
        expect(readEntity).toHaveBeenCalledTimes(2);
      } finally {
        if (previousNoCache === undefined) {
          delete process.env.MESSAGEVISOR_NO_CACHE;
        } else {
          process.env.MESSAGEVISOR_NO_CACHE = previousNoCache;
        }
      }

      readEntity.mockClear();
      await writeFile(root, "messages/welcome.yml", "translations:\n  en: Hello\n");
      await loadProjectSnapshot(datasource, { entityTypes: ["locale", "message"] });
      expect(readEntity).toHaveBeenCalledTimes(1);
    } finally {
      await fs.promises.rm(root, { recursive: true, force: true });
    }
  });

  it("preserves sorted insertion order after concurrent parsing", async function () {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-snapshot-order-"));

    try {
      await writeFile(root, "messagevisor.config.js", "module.exports = {}\n");
      await writeFile(root, "locales/en.yml", "description: English\n");

      await Promise.all(
        Array.from({ length: 220 }, (_, index) => {
          const key = `message-${String(index).padStart(3, "0")}`;
          return writeFile(root, `messages/${key}.yml`, `translations:\n  en: ${key}\n`);
        }),
      );

      const datasource = new Datasource(getProjectConfig(root), root);
      const snapshot = await loadProjectSnapshot(datasource, {
        entityTypes: ["message"],
        concurrency: 16,
        cache: false,
      });

      expect(Object.keys(snapshot.messages)).toEqual(snapshot.keys.message);
      expect(snapshot.keys.message).toEqual([...snapshot.keys.message].sort());
    } finally {
      await fs.promises.rm(root, { recursive: true, force: true });
    }
  });
});
