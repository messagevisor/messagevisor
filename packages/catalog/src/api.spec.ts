import { fetchHistoryPage, fetchLocaleDuplicates, setCatalogRouterMode } from "./api";

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
