import {
  createCatalogIndexFromLayer,
  decodeLayeredCatalogIndexLayer,
  decodeLayeredCatalogIndexMeta,
  encodeLayeredCatalogIndex,
  mergeCatalogIndexLayer,
} from "./layeredIndex";
import type { CatalogIndex } from "./types";

function makeIndex(): CatalogIndex {
  return {
    set: "root",
    counts: { locale: 1, message: 1, attribute: 0, segment: 0, target: 1 },
    entities: {
      locale: [
        {
          key: "en",
          description: "English",
          targets: ["web"],
          locales: ["en"],
          href: "entities/locale/en.json",
          lastModified: { commit: "abc", author: "Tester", timestamp: "2026-01-01" },
        },
      ],
      message: [
        {
          key: "welcome",
          description: "Welcome",
          targets: ["web"],
          locales: ["en"],
          overrideLocales: ["nl"],
          overrideCount: 1,
          href: "entities/message/welcome.json",
          lastModified: { commit: "abc", author: "Tester", timestamp: "2026-01-01" },
        },
      ],
      attribute: [],
      segment: [],
      target: [{ key: "web", messageCount: 1, href: "entities/target/web.json" }],
    },
  };
}

describe("layered Catalog index", () => {
  it("keeps core rows small and interns history values", () => {
    const encoded = encodeLayeredCatalogIndex(makeIndex());

    expect(encoded.meta.formatVersion).toBe(3);
    expect(encoded.meta.dictionaries.commits).toEqual(["abc"]);
    expect(encoded.meta.dictionaries.authors).toEqual(["Tester"]);
    expect(encoded.core.entities.message?.columns).toEqual([
      "key",
      "targets",
      "locales",
      "overrideLocales",
      "archived",
      "deprecated",
    ]);
    expect(encoded.core.entities.message?.columns).not.toContain("description");
    expect(encoded.display.entities.message?.rows[0]).toEqual([
      1,
      null,
      null,
      null,
      [0, 0, "2026-01-01"],
    ]);
  });

  it("merges decoded description and display layers by row position", () => {
    const encoded = encodeLayeredCatalogIndex(makeIndex());
    const meta = decodeLayeredCatalogIndexMeta(encoded.meta);
    let decoded = createCatalogIndexFromLayer(
      meta,
      decodeLayeredCatalogIndexLayer(encoded.core, meta),
    );

    decoded = mergeCatalogIndexLayer(
      decoded,
      decodeLayeredCatalogIndexLayer(encoded.descriptions, meta),
    );
    decoded = mergeCatalogIndexLayer(
      decoded,
      decodeLayeredCatalogIndexLayer(encoded.display, meta),
    );

    expect(decoded).toEqual(makeIndex());
  });
});
