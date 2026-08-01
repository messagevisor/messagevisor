import { jsonParser } from "./json";

describe("jsonParser", function () {
  it("parses and pretty prints JSON", function () {
    const value = { foo: 1, nested: { enabled: true } };
    expect(jsonParser.parse(jsonParser.stringify(value))).toEqual(value);
    expect(jsonParser.stringify(value)).toContain('\n  "foo": 1');
  });

  it("rejects invalid JSON", function () {
    expect(() => jsonParser.parse("not json")).toThrow();
  });
});
