import type { Datasource } from "../datasource";
import * as snapshots from "../snapshot";
import { readTranslationSelection } from "./selection";

jest.mock("../snapshot", () => ({ loadProjectSnapshot: jest.fn() }));

describe("translation selection at project scale", () => {
  afterEach(() => jest.restoreAllMocks());

  it("selects 50000 messages with an exact filter per message from one snapshot", async () => {
    const messageKeys = Array.from({ length: 50000 }, (_, index) => `message${index}`);
    const messages = Object.fromEntries(
      messageKeys.map((key) => [key, { translations: { en: "Hello", nl: "Hallo" } }]),
    );
    const keys = {
      locale: ["en", "nl"],
      message: messageKeys,
      target: [],
      segment: [],
      attribute: [],
      test: [],
    };
    const snapshot: snapshots.ProjectSnapshot = {
      revision: "test",
      loadedEntityTypes: new Set(["locale", "message", "target", "segment"]),
      keys,
      keySets: {
        locale: new Set(keys.locale),
        message: new Set(keys.message),
        target: new Set(),
        segment: new Set(),
        attribute: new Set(),
        test: new Set(),
      },
      locales: { en: {}, nl: {} },
      messages,
      targets: {},
      segments: {},
      attributes: {},
      tests: {},
    };
    const load = jest.mocked(snapshots.loadProjectSnapshot).mockResolvedValue(snapshot);
    const result = await readTranslationSelection({} as Datasource, {
      includeMessages: messageKeys,
      excludeMessages: ["message49999"],
    });
    expect(load).toHaveBeenCalledTimes(1);
    expect(Object.keys(result.scopes[0].messages)).toHaveLength(49999);
    expect(result.scopes[0].messages.message49999).toBeUndefined();
    expect(snapshot.messages.message49999).toBeDefined();
  });
});
