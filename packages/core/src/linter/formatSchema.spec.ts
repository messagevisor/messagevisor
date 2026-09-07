import { formatPresetsZodSchema } from "./formatSchema";

describe("format preset numeric boundaries", () => {
  it.each([
    { minimumIntegerDigits: 0 },
    { minimumIntegerDigits: 22 },
    { minimumSignificantDigits: 0 },
    { maximumSignificantDigits: 22 },
    { minimumFractionDigits: -1 },
    { maximumFractionDigits: 101 },
    { minimumFractionDigits: 5, maximumFractionDigits: 2 },
    { minimumSignificantDigits: 5, maximumSignificantDigits: 2 },
  ])("rejects %j", (preset) => {
    expect(formatPresetsZodSchema.safeParse({ number: { example: preset } }).success).toBe(false);
  });

  it("accepts valid boundary values", () => {
    expect(
      formatPresetsZodSchema.safeParse({
        number: {
          integer: { minimumIntegerDigits: 21 },
          fractions: { minimumFractionDigits: 0, maximumFractionDigits: 100 },
          significant: { minimumSignificantDigits: 1, maximumSignificantDigits: 21 },
        },
      }).success,
    ).toBe(true);
  });
});
