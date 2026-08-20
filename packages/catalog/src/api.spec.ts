import {
  __resetCatalogApiCaches,
  fetchEntityDetail,
  fetchHistoryPage,
  fetchIndex,
  fetchIndexLayer,
  fetchLocaleDuplicates,
  fetchManifest,
  setCatalogRouterMode,
  CatalogBlockKeyMissingError,
} from "./api";

describe("catalog api", function () {
  const originalFetch = global.fetch;

  afterEach(function () {
    global.fetch = originalFetch;
    __resetCatalogApiCaches();
    setCatalogRouterMode("browser");
  });

  it("decodes compact indexes while preserving the public index shape", async function () {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        set: "root",
        formatVersion: 2,
        counts: { locale: 0, message: 1, attribute: 0, segment: 0, target: 0 },
        dictionaries: { targets: ["web"], locales: ["en"] },
        entities: {
          message: {
            columns: ["key", "targets", "locales"],
            rows: [["welcome", 1, 1]],
          },
        },
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(fetchIndex()).resolves.toMatchObject({
      entities: {
        message: [
          {
            key: "welcome",
            targets: ["web"],
            locales: ["en"],
            href: "entities/message/welcome.json",
          },
        ],
      },
    });
  });

  it("loads layered indexes through core first and optional layers on demand", async function () {
    const meta = {
      set: "root",
      formatVersion: 3,
      counts: { locale: 0, message: 1, attribute: 0, segment: 0, target: 0 },
      dictionaries: { targets: ["web"], locales: ["en"], commits: [], authors: [] },
      layers: {
        core: "index/core.json",
        descriptions: "index/descriptions.json",
        display: "index/display.json",
      },
      types: { locale: { count: 0 }, message: { count: 1 } },
    };
    const fetchMock = jest.fn().mockImplementation(async (url: string) => {
      if (url === "/data/root/index.json") {
        return { ok: true, json: async () => meta };
      }

      if (url === "/data/root/index/core.json") {
        return {
          ok: true,
          json: async () => ({
            formatVersion: 3,
            entities: {
              message: {
                columns: ["key", "targets"],
                rows: [["welcome", 1]],
              },
            },
          }),
        };
      }

      if (url === "/data/root/index/display.json") {
        return {
          ok: true,
          json: async () => ({
            formatVersion: 3,
            entities: {
              message: {
                columns: ["overrideCount"],
                rows: [[2]],
              },
            },
          }),
        };
      }

      throw new Error(`Unexpected URL: ${url}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(fetchIndex()).resolves.toMatchObject({
      entities: { message: [{ key: "welcome", targets: ["web"] }] },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await expect(fetchIndexLayer("display")).resolves.toMatchObject({
      message: [{ overrideCount: 2 }],
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("shares concurrent index and index layer requests", async function () {
    const meta = {
      set: "root",
      formatVersion: 3,
      counts: { locale: 0, message: 1, attribute: 0, segment: 0, target: 0 },
      dictionaries: { targets: ["web"], locales: ["en"], commits: [], authors: [] },
      layers: {
        core: "index/core.json",
        descriptions: "index/descriptions.json",
        display: "index/display.json",
      },
      types: { message: { count: 1 } },
    };
    const fetchMock = jest.fn().mockImplementation(async (url: string) => {
      if (url === "/data/root/index.json") {
        return { ok: true, json: async () => meta };
      }

      if (url === "/data/root/index/core.json") {
        return {
          ok: true,
          json: async () => ({
            formatVersion: 3,
            entities: { message: { columns: ["key"], rows: [["welcome"]] } },
          }),
        };
      }

      if (url === "/data/root/index/display.json") {
        return {
          ok: true,
          json: async () => ({
            formatVersion: 3,
            entities: { message: { columns: ["overrideCount"], rows: [[2]] } },
          }),
        };
      }

      throw new Error(`Unexpected URL: ${url}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const [firstIndex, secondIndex, firstDisplay, secondDisplay] = await Promise.all([
      fetchIndex(),
      fetchIndex(),
      fetchIndexLayer("display"),
      fetchIndexLayer("display"),
    ]);

    expect(firstIndex).toEqual(secondIndex);
    expect(firstDisplay).toEqual(secondDisplay);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(
      expect.arrayContaining([
        "/data/root/index.json",
        "/data/root/index/core.json",
        "/data/root/index/display.json",
      ]),
    );
  });

  it("evicts a rejected index request so a later call can retry", async function () {
    const index = {
      set: "root",
      formatVersion: 2,
      counts: { locale: 0, message: 0, attribute: 0, segment: 0, target: 0 },
      dictionaries: { targets: [], locales: [] },
      entities: {},
    };
    const fetchMock = jest
      .fn()
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce({ ok: true, json: async () => index });
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(fetchIndex()).rejects.toThrow("temporary failure");
    await expect(fetchIndex()).resolves.toMatchObject({ counts: index.counts });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("loads message details from a block layout and caches the block", async function () {
    const manifest = {
      schemaVersion: "1",
      generatedAt: "2026-01-01T00:00:00.000Z",
      sets: false,
      setKeys: [],
      layout: {
        version: 1,
        blockSize: 262144,
        vbucketBits: 16,
        blockedTypes: ["message"],
      },
      paths: { projectHistory: "data/project/history/page-1.json" },
      counts: { root: { locale: 0, message: 1, attribute: 0, segment: 0, target: 0 } },
    };
    const detail = { type: "message", key: "welcome", entity: { translations: {} } };
    const fetchMock = jest.fn().mockImplementation(async (url: string) => {
      if (url === "/data/manifest.json") {
        return { ok: true, json: async () => manifest };
      }

      if (url === "/data/root/blocks/message/ranges.json") {
        return {
          ok: true,
          json: async () => ({
            layoutVersion: 1,
            vbucketBits: 16,
            blockSize: 262144,
            blocks: [[0, "block-hash"]],
          }),
        };
      }

      if (url === "/data/root/blocks/message/block-hash.json") {
        return {
          ok: true,
          json: async () => ({ welcome: detail, other: { ...detail, key: "other" } }),
        };
      }

      throw new Error(`Unexpected URL: ${url}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await fetchManifest();
    const [first, second] = await Promise.all([
      fetchEntityDetail("message", "welcome"),
      fetchEntityDetail("message", "other"),
    ]);

    expect(first).toEqual(detail);
    expect(second).toEqual({ ...detail, key: "other" });
    await expect(fetchEntityDetail("message", "welcome")).resolves.toEqual(detail);

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("evicts a rejected block request so a later detail load can retry", async function () {
    const manifest = {
      schemaVersion: "1",
      generatedAt: "2026-01-01T00:00:00.000Z",
      sets: false,
      setKeys: [],
      layout: {
        version: 1,
        blockSize: 262144,
        vbucketBits: 16,
        blockedTypes: ["message"],
      },
      paths: { projectHistory: "data/project/history/page-1.json" },
      counts: { root: { locale: 0, message: 1, attribute: 0, segment: 0, target: 0 } },
    };
    const detail = { type: "message", key: "welcome", entity: { translations: {} } };
    const fetchMock = jest.fn().mockImplementation(async (url: string) => {
      if (url === "/data/manifest.json") {
        return { ok: true, json: async () => manifest };
      }

      if (url === "/data/root/blocks/message/ranges.json") {
        return {
          ok: true,
          json: async () => ({
            layoutVersion: 1,
            vbucketBits: 16,
            blockSize: 262144,
            blocks: [[0, "block-hash"]],
          }),
        };
      }

      if (url === "/data/root/blocks/message/block-hash.json") {
        if (fetchMock.mock.calls.filter(([callUrl]) => callUrl === url).length === 1) {
          throw new Error("temporary block failure");
        }

        return { ok: true, json: async () => ({ welcome: detail }) };
      }

      throw new Error(`Unexpected URL: ${url}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await fetchManifest();
    await expect(fetchEntityDetail("message", "welcome")).rejects.toThrow(
      "temporary block failure",
    );
    await expect(fetchEntityDetail("message", "welcome")).resolves.toEqual(detail);
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith("block-hash.json"))).toHaveLength(2);
  });

  it("rejects a Catalog layout newer than the UI understands", async function () {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        schemaVersion: "1",
        generatedAt: "2026-01-01T00:00:00.000Z",
        sets: false,
        setKeys: [],
        layout: {
          version: 4,
          blockSize: 262144,
          vbucketBits: 16,
          blockedTypes: [],
        },
        paths: { projectHistory: "data/project/history/page-1.json" },
        counts: {},
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await fetchManifest();

    await expect(fetchEntityDetail("message", "welcome")).rejects.toThrow(
      "generated by a newer Messagevisor version",
    );
  });

  it("loads interned entity history from a v2 block layout", async function () {
    const manifest = {
      schemaVersion: "1",
      generatedAt: "2026-01-01T00:00:00.000Z",
      sets: false,
      setKeys: [],
      layout: {
        version: 2,
        blockSize: 262144,
        vbucketBits: 16,
        blockedTypes: ["message"],
        blockedHistoryTypes: ["locale", "message", "attribute", "segment", "target"],
      },
      paths: { projectHistory: "data/project/history/page-1.json" },
      counts: { root: { locale: 0, message: 1, attribute: 0, segment: 0, target: 0 } },
    };
    const fetchMock = jest.fn().mockImplementation(async (url: string) => {
      if (url === "/data/manifest.json") {
        return { ok: true, json: async () => manifest };
      }

      if (url === "/data/root/blocks/history/message/ranges.json") {
        return {
          ok: true,
          json: async () => ({
            layoutVersion: 2,
            vbucketBits: 16,
            blockSize: 262144,
            blocks: [[0, "history-block"]],
          }),
        };
      }

      if (url === "/data/root/blocks/history/message/history-block.json") {
        return {
          ok: true,
          json: async () => ({ welcome: [{ commit: 0 }] }),
        };
      }

      if (url === "/data/root/history/commits.json") {
        return {
          ok: true,
          json: async () => ({
            commits: [{ commit: "abc1234", author: "Catalog Tester", timestamp: "2026-01-01" }],
          }),
        };
      }

      throw new Error(`Unexpected URL: ${url}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await fetchManifest();

    await expect(fetchHistoryPage("data/root/history/message/welcome", 1)).resolves.toEqual({
      page: 1,
      pageSize: 1,
      totalPages: 1,
      entries: [
        {
          commit: "abc1234",
          author: "Catalog Tester",
          timestamp: "2026-01-01",
          entities: [{ type: "message", key: "welcome" }],
        },
      ],
    });
  });

  it("decodes interned aggregate history pages", async function () {
    const manifest = {
      schemaVersion: "1",
      generatedAt: "2026-01-01T00:00:00.000Z",
      sets: false,
      setKeys: [],
      layout: {
        version: 2,
        blockSize: 262144,
        vbucketBits: 16,
        blockedTypes: ["message"],
        blockedHistoryTypes: ["locale", "message", "attribute", "segment", "target"],
      },
      paths: { projectHistory: "data/project/history/page-1.json" },
      counts: { root: { locale: 0, message: 1, attribute: 0, segment: 0, target: 0 } },
    };
    const fetchMock = jest.fn().mockImplementation(async (url: string) => {
      if (url === "/data/manifest.json") {
        return { ok: true, json: async () => manifest };
      }

      if (url === "/data/project/history/page-1.json") {
        return {
          ok: true,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({
            page: 1,
            pageSize: 500,
            totalPages: 1,
            entries: [{ commit: 0, entities: [{ type: "message", key: "welcome" }] }],
          }),
        };
      }

      if (url === "/data/project/history/commits.json") {
        return {
          ok: true,
          json: async () => ({
            commits: [{ commit: "abc1234", author: "Catalog Tester", timestamp: "2026-01-01" }],
          }),
        };
      }

      throw new Error(`Unexpected URL: ${url}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    await fetchManifest();

    await expect(fetchHistoryPage("data/project/history", 1)).resolves.toEqual({
      page: 1,
      pageSize: 500,
      totalPages: 1,
      entries: [
        {
          commit: "abc1234",
          author: "Catalog Tester",
          timestamp: "2026-01-01",
          entities: [{ type: "message", key: "welcome" }],
        },
      ],
    });
  });

  it("decodes keyed aggregate history pages and reconstructs set metadata", async function () {
    const manifest = {
      schemaVersion: "1",
      generatedAt: "2026-01-01T00:00:00.000Z",
      sets: true,
      setKeys: ["dev"],
      layout: {
        version: 3,
        blockSize: 262144,
        vbucketBits: 16,
        blockedTypes: ["message"],
        blockedHistoryTypes: ["locale", "message", "attribute", "segment", "target"],
      },
      paths: { projectHistory: "data/project/history" },
      counts: { dev: { locale: 0, message: 1, attribute: 0, segment: 0, target: 0 } },
    };
    const fetchMock = jest.fn().mockImplementation(async (url: string) => {
      if (url === "/data/manifest.json") {
        return { ok: true, json: async () => manifest };
      }

      if (url === "/data/sets/dev/history/page-1.json") {
        return {
          ok: true,
          json: async () => ({
            page: 1,
            pageSize: 500,
            totalPages: 1,
            totalEntityReferences: 2,
            entries: [{ commit: 0, entities: [0, 1] }],
          }),
        };
      }

      if (url === "/data/sets/dev/history/commits.json") {
        return {
          ok: true,
          json: async () => ({
            commits: [{ commit: "abc1234", author: "Catalog Tester", timestamp: "2026-01-01" }],
          }),
        };
      }

      if (url === "/data/sets/dev/history/keys.json") {
        return {
          ok: true,
          json: async () => ({
            keys: [
              ["message", "welcome"],
              ["locale", "en"],
            ],
          }),
        };
      }

      throw new Error(`Unexpected URL: ${url}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await fetchManifest();

    await expect(fetchHistoryPage("/data/sets/dev/history", 1)).resolves.toEqual({
      page: 1,
      pageSize: 500,
      totalPages: 1,
      totalEntityReferences: 2,
      entries: [
        {
          commit: "abc1234",
          author: "Catalog Tester",
          timestamp: "2026-01-01",
          entities: [
            { type: "message", key: "welcome", set: "dev" },
            { type: "locale", key: "en", set: "dev" },
          ],
        },
      ],
    });
  });

  it("merges set histories into project history on demand", async function () {
    const manifest = {
      schemaVersion: "1",
      generatedAt: "2026-01-01T00:00:00.000Z",
      sets: true,
      setKeys: ["dev", "staging"],
      layout: {
        version: 3,
        blockSize: 262144,
        vbucketBits: 16,
        blockedTypes: ["message"],
        blockedHistoryTypes: ["locale", "message", "attribute", "segment", "target"],
      },
      paths: { projectHistory: "data/project/history" },
      counts: {
        dev: { locale: 0, message: 2, attribute: 0, segment: 0, target: 0 },
        staging: { locale: 0, message: 1, attribute: 0, segment: 0, target: 0 },
      },
    };
    const pages: Record<string, unknown> = {
      "/data/sets/dev/history/page-1.json": {
        page: 1,
        pageSize: 500,
        totalPages: 1,
        totalEntityReferences: 2,
        entries: [
          { commit: 0, entities: [0] },
          { commit: 1, entities: [1] },
        ],
      },
      "/data/sets/staging/history/page-1.json": {
        page: 1,
        pageSize: 500,
        totalPages: 1,
        totalEntityReferences: 1,
        entries: [{ commit: 0, entities: [0] }],
      },
      "/data/sets/dev/history/commits.json": {
        commits: [
          { commit: "dev-new", author: "Dev", timestamp: "2026-01-03" },
          { commit: "dev-old", author: "Dev", timestamp: "2026-01-01" },
        ],
      },
      "/data/sets/staging/history/commits.json": {
        commits: [{ commit: "staging-new", author: "Staging", timestamp: "2026-01-02" }],
      },
      "/data/sets/dev/history/keys.json": {
        keys: [
          ["message", "dev.new"],
          ["message", "dev.old"],
        ],
      },
      "/data/sets/staging/history/keys.json": {
        keys: [["message", "staging.new"]],
      },
    };
    const fetchMock = jest.fn().mockImplementation(async (url: string) => {
      if (url === "/data/manifest.json") {
        return { ok: true, json: async () => manifest };
      }

      if (url in pages) {
        return { ok: true, json: async () => pages[url] };
      }

      throw new Error(`Unexpected URL: ${url}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await fetchManifest();

    await expect(fetchHistoryPage("/data/project/history", 1)).resolves.toEqual({
      page: 1,
      pageSize: 500,
      totalPages: 1,
      totalEntityReferences: 3,
      entries: [
        {
          commit: "dev-new",
          author: "Dev",
          timestamp: "2026-01-03",
          entities: [{ type: "message", key: "dev.new", set: "dev" }],
        },
        {
          commit: "staging-new",
          author: "Staging",
          timestamp: "2026-01-02",
          entities: [{ type: "message", key: "staging.new", set: "staging" }],
        },
        {
          commit: "dev-old",
          author: "Dev",
          timestamp: "2026-01-01",
          entities: [{ type: "message", key: "dev.old", set: "dev" }],
        },
      ],
    });
  });

  it("keeps project history pagination stable when a commit crosses a page boundary", async function () {
    const entityCount = 501;
    const manifest = {
      schemaVersion: "1",
      generatedAt: "2026-01-01T00:00:00.000Z",
      sets: true,
      setKeys: ["dev"],
      layout: {
        version: 3,
        blockSize: 262144,
        vbucketBits: 16,
        blockedTypes: ["message"],
        blockedHistoryTypes: ["locale", "message", "attribute", "segment", "target"],
      },
      paths: { projectHistory: "data/project/history" },
      counts: { dev: { locale: 0, message: entityCount, attribute: 0, segment: 0, target: 0 } },
    };
    const pages: Record<string, unknown> = {
      "/data/sets/dev/history/page-1.json": {
        page: 1,
        pageSize: 500,
        totalPages: 2,
        totalEntityReferences: entityCount,
        entries: [{ commit: 0, entities: Array.from({ length: 500 }, (_, index) => index) }],
      },
      "/data/sets/dev/history/page-2.json": {
        page: 2,
        pageSize: 500,
        totalPages: 2,
        totalEntityReferences: entityCount,
        entries: [{ commit: 0, entities: [500] }],
      },
      "/data/sets/dev/history/commits.json": {
        commits: [{ commit: "large-change", author: "Catalog Tester", timestamp: "2026-01-01" }],
      },
      "/data/sets/dev/history/keys.json": {
        keys: Array.from({ length: entityCount }, (_, index) => ["message", `message.${index}`]),
      },
    };
    const fetchMock = jest.fn().mockImplementation(async (url: string) => {
      if (url === "/data/manifest.json") {
        return { ok: true, json: async () => manifest };
      }

      if (url in pages) {
        return { ok: true, json: async () => pages[url] };
      }

      throw new Error(`Unexpected URL: ${url}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await fetchManifest();

    const firstPage = await fetchHistoryPage("/data/project/history", 1);
    const secondPage = await fetchHistoryPage("/data/project/history", 2);

    expect(firstPage.entries[0].entities).toHaveLength(500);
    expect(secondPage.entries[0].entities).toEqual([
      { type: "message", key: "message.500", set: "dev" },
    ]);
    expect(secondPage.totalPages).toBe(2);
    expect(secondPage.totalEntityReferences).toBe(entityCount);
  });

  it("does not fall back to a missing legacy file when a block lacks the key", async function () {
    const manifest = {
      schemaVersion: "1",
      generatedAt: "2026-01-01T00:00:00.000Z",
      sets: false,
      setKeys: [],
      layout: {
        version: 1,
        blockSize: 262144,
        vbucketBits: 16,
        blockedTypes: ["message"],
      },
      paths: { projectHistory: "data/project/history/page-1.json" },
      counts: { root: { locale: 0, message: 1, attribute: 0, segment: 0, target: 0 } },
    };
    const fetchMock = jest.fn().mockImplementation(async (url: string) => {
      if (url === "/data/manifest.json") {
        return { ok: true, json: async () => manifest };
      }

      if (url === "/data/root/blocks/message/ranges.json") {
        return {
          ok: true,
          json: async () => ({
            layoutVersion: 1,
            vbucketBits: 16,
            blockSize: 262144,
            blocks: [[0, "block-hash"]],
          }),
        };
      }

      if (url === "/data/root/blocks/message/block-hash.json") {
        return { ok: true, json: async () => ({ other: { key: "other" } }) };
      }

      if (url.includes("/entities/message/")) {
        throw new Error("legacy fallback should not be requested");
      }

      throw new Error(`Unexpected URL: ${url}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await fetchManifest();

    await expect(fetchEntityDetail("message", "missing")).rejects.toBeInstanceOf(
      CatalogBlockKeyMissingError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("fetches locale duplicates from the expected root data path", async function () {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        locale: "en-US",
        summary: { duplicateValues: 0, duplicateMessageKeys: 0 },
        duplicateValues: [],
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await fetchLocaleDuplicates("en-US");

    expect(fetchMock).toHaveBeenCalledWith("/data/root/duplicates/locales/en-US.json");
  });

  it("fetches locale duplicates from the expected set data path", async function () {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        locale: "nl-NL",
        summary: { duplicateValues: 0, duplicateMessageKeys: 0 },
        duplicateValues: [],
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await fetchLocaleDuplicates("nl-NL", "staging");

    expect(fetchMock).toHaveBeenCalledWith("/data/sets/staging/duplicates/locales/nl-NL.json");
  });

  it("treats a missing first history page as empty history", async function () {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(fetchHistoryPage("data/root/history/message/common.welcome", 1)).resolves.toEqual({
      page: 1,
      pageSize: 50,
      totalPages: 1,
      entries: [],
    });
  });

  it("treats a browser-router HTML fallback for first history page as empty history", async function () {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "text/html" }),
      json: async () => {
        throw new Error("Should not parse HTML as JSON");
      },
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(fetchHistoryPage("data/root/history/message/common.welcome", 1)).resolves.toEqual({
      page: 1,
      pageSize: 50,
      totalPages: 1,
      entries: [],
    });
  });

  it("keeps later missing history pages as load errors", async function () {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(fetchHistoryPage("data/root/history/message/common.welcome", 2)).rejects.toThrow(
      "Unable to load",
    );
  });
});
