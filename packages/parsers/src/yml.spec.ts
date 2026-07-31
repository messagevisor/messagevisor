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
});
