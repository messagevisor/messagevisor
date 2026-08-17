import { decodeCatalogIndex, encodeCatalogIndex } from "./indexFormat";
import type { CatalogIndex } from "./types";

function makeIndex(): CatalogIndex {
  const locales = Array.from({ length: 40 }, (_, index) => `locale-${index}`).sort((a, b) =>
    a.localeCompare(b),
  );

  return {
    set: "synthetic",
    counts: {
      locale: 1,
      message: 1,
      attribute: 0,
      segment: 0,
      target: 1,
    },
    entities: {
      locale: [
        {
          key: "en",
          description: "English",
          locales,
          targets: ["mobile", "web"],
          overrideCount: 2,
          lastModified: {
            commit: "abc",
            author: "Tester",
            timestamp: "2026-01-01T00:00:00.000Z",
          },
          href: "entities/locale/en.json",
        },
      ],
      message: [
        {
          key: "welcome",
          targets: ["web"],
          locales: ["en"],
          overrideLocales: ["nl"],
          overrideCount: 1,
          href: "entities/message/welcome.json",
        },
      ],
      attribute: [],
      segment: [],
      target: [
        {
          key: "web",
          messageCount: 1,
          href: "entities/target/web.json",
        },
      ],
    },
  };
}

describe("catalog index format", () => {
  it("round trips compact dictionary and list columns", () => {
    const index = makeIndex();
    const encoded = encodeCatalogIndex(index);
    const decoded = decodeCatalogIndex(encoded);

    expect(encoded.formatVersion).toBe(2);
    expect(encoded.dictionaries.locales).toHaveLength(42);
    expect(encoded.entities.message?.columns).not.toContain("href");
    expect(decoded).toEqual(index);
  });

  it("uses bitmasks for small dictionaries and arrays for large dictionaries", () => {
    const encoded = encodeCatalogIndex(makeIndex());
    const localeRow = encoded.entities.locale?.rows[0];
    const messageRow = encoded.entities.message?.rows[0];

    expect(typeof localeRow?.[2]).toBe("number");
    expect(Array.isArray(localeRow?.[3])).toBe(true);
    expect(typeof messageRow?.[2]).toBe("number");
  });

  it("keeps reading legacy unencoded indexes", () => {
    const index = makeIndex();

    expect(decodeCatalogIndex(index)).toBe(index);
  });

  it("rejects unknown index formats", () => {
    expect(() => decodeCatalogIndex({ formatVersion: 3 })).toThrow(
      "unsupported format version (3)",
    );
  });
});
