import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ymlParser } from "./yml";

describe("ymlParser", function () {
  it("parses and writes YAML", function () {
    const value = { foo: 1, items: ["a", "b"] };
    expect(ymlParser.parse(ymlParser.stringify(value))).toEqual(value);
  });

  it("preserves comments while applying the supplied object exactly", function () {
    const directory = mkdtempSync(join(tmpdir(), "messagevisor-parser-"));
    const filePath = join(directory, "message.yml");
    const before =
      "title: Before # title comment\nremoved: value\nnested:\n  kept: Before # kept comment\n";
    writeFileSync(filePath, before);

    const output = ymlParser.stringify(
      { title: "After", nested: { kept: "After", added: true } },
      filePath,
    );

    expect(output).toBe(
      "title: After # title comment\nnested:\n  kept: After # kept comment\n  added: true\n",
    );
    expect(readFileSync(filePath, "utf8")).toBe(before);
    rmSync(directory, { recursive: true, force: true });
  });

  it("rejects a primitive root when preserving an existing document", function () {
    const directory = mkdtempSync(join(tmpdir(), "messagevisor-parser-"));
    const filePath = join(directory, "message.yml");
    writeFileSync(filePath, "title: Before\n");
    expect(() => ymlParser.stringify("After", filePath)).toThrow(
      "Cannot set root document to a primitive value",
    );
    rmSync(directory, { recursive: true, force: true });
  });

  it("preserves scalar styles, flow collections, anchors, aliases, and directives", function () {
    const directory = mkdtempSync(join(tmpdir(), "messagevisor-parser-"));
    const filePath = join(directory, "message.yml");
    const before = [
      "%YAML 1.2",
      "---",
      'title: "Before"',
      "description: |-",
      "  First line",
      "  Second line",
      "defaults: &defaults { tone: calm, retries: 2 }",
      "copy: *defaults",
      "tags: [first, second]",
      "",
    ].join("\n");
    writeFileSync(filePath, before);

    const parsed = ymlParser.parse<Record<string, unknown>>(before);
    const output = ymlParser.stringify({ ...parsed, title: "After" }, filePath);

    expect(output).toContain("%YAML 1.2");
    expect(output).toContain('title: "After"');
    expect(output).toContain("description: |-");
    expect(output).toContain("defaults: &defaults { tone: calm, retries: 2 }");
    expect(output).toContain("copy: *defaults");
    expect(output).toMatch(/tags: \[\s*first, second\s*\]/);
    rmSync(directory, { recursive: true, force: true });
  });

  it("keeps comments attached to duplicate sequence entries", function () {
    const directory = mkdtempSync(join(tmpdir(), "messagevisor-parser-"));
    const filePath = join(directory, "message.yml");
    writeFileSync(filePath, "items:\n  - same # first\n  - same # second\n");

    const output = ymlParser.stringify({ items: ["same", "same"] }, filePath);

    expect(output).toContain("same # first");
    expect(output).toContain("same # second");
    rmSync(directory, { recursive: true, force: true });
  });
});
