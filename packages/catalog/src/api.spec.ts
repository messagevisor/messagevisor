import { fetchLocaleDuplicates, setCatalogRouterMode } from "./api";

describe("catalog api", function () {
  const originalFetch = global.fetch;

  afterEach(function () {
    global.fetch = originalFetch;
    setCatalogRouterMode("browser");
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
});
