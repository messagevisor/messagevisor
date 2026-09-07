import { extractIcuStyleReferences } from "./icuStyleReferences";

describe("ICU style references", () => {
  it("distinguishes quoted syntax from actual arguments", () => {
    expect(extractIcuStyleReferences("This '{' literal {amount, number, money}")).toEqual([
      { type: "number", style: "money", isSkeleton: false },
    ]);
    expect(extractIcuStyleReferences("'{value, number, fake}'")).toEqual([]);
    expect(extractIcuStyleReferences("It''s {amount, number, money}")).toEqual([
      { type: "number", style: "money", isSkeleton: false },
    ]);
  });

  it("visits nested choices and rich tags", () => {
    expect(
      extractIcuStyleReferences(
        "{n, plural, one {<b>{d, date, short}</b>} other {{x, select, a {{t, time, clock}} other {none}}}}",
      ),
    ).toEqual([
      { type: "date", style: "short", isSkeleton: false },
      { type: "time", style: "clock", isSkeleton: false },
    ]);
  });

  it("identifies skeletons without treating them as named presets", () => {
    expect(extractIcuStyleReferences("{n, number, ::currency/USD} {d, date, ::yyyyMMdd}")).toEqual([
      { type: "number", style: "::currency/USD", isSkeleton: true },
      { type: "date", style: "::yyyyMMdd", isSkeleton: true },
    ]);
  });

  it("does not silently accept malformed syntax", () => {
    expect(() => extractIcuStyleReferences("{broken")).toThrow();
  });
});
