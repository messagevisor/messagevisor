import { getTestZodSchema } from "./testSchema";

describe("getTestZodSchema", function () {
  const schema = getTestZodSchema(
    ["auth.signin", "common.welcome"],
    ["adult", "betaUsers"],
    ["en", "nl"],
    ["web", "mobile"],
  );

  it("accepts matrix on all supported test assertion kinds", function () {
    expect(() =>
      schema.parse({
        message: "auth.signin",
        assertions: [
          {
            matrix: {
              name: ["Ada", "Sam"],
              enabled: [true],
            },
            locale: "en",
            target: "web",
            description: "Greeting ${{ name }}",
            withFlags: {
              "new-homepage": "${{ enabled }}",
            },
            values: {
              name: "${{ name }}",
            },
            expectedTranslation: "Hello ${{ name }}",
            expectedByRuntime: {
              go: "Hi ${{ name }}",
            },
          },
        ],
      }),
    ).not.toThrow();

    expect(() =>
      schema.parse({
        segment: "adult",
        assertions: [
          {
            matrix: {
              expected: [true],
            },
            segment: "adult",
            context: {
              age: 21,
            },
            expectedToMatch: "${{ expected }}",
          },
        ],
      }),
    ).not.toThrow();

    expect(() =>
      schema.parse({
        locale: "en",
        assertions: [
          {
            matrix: {
              target: ["web"],
              amount: [12],
            },
            description: "Locale ${{ target }}",
            target: "${{ target }}",
            expectedFormats: {
              number: {
                money: {
                  currency: "USD",
                },
              },
            },
            rawMessage: "{amount, number, money}",
            values: {
              amount: "${{ amount }}",
            },
            expectedTranslation: "$12.00",
            expectedByRuntime: {
              go: "USD12.00",
            },
          },
        ],
      }),
    ).not.toThrow();

    expect(() =>
      schema.parse({
        target: "web",
        assertions: [
          {
            matrix: {
              currency: ["USD"],
            },
            locale: "en",
            expectedFormats: {
              number: {
                money: {
                  currency: "${{ currency }}",
                },
              },
            },
          },
          {
            locale: "en",
            rawMessage: "Total: {amount, number, money}",
            values: {
              amount: 12,
            },
            expectedTranslation: "Total: $12.00",
            expectedByRuntime: {
              go: "Total: USD12.00",
            },
          },
          {
            locale: "en",
            message: "common.welcome",
            expectedTranslation: "Hello Ada",
          },
        ],
      }),
    ).not.toThrow();
  });

  it("accepts stable promotable assertion keys on every test kind", function () {
    const tests = [
      {
        message: "auth.signin",
        assertions: [
          {
            key: "english-web",
            promotable: false,
            locale: "en",
            expectedTranslation: "Sign in",
          },
        ],
      },
      {
        segment: "adult",
        assertions: [
          {
            key: "adult-user",
            promotable: false,
            segment: "adult",
            context: { age: 21 },
            expectedToMatch: true,
          },
        ],
      },
      {
        locale: "en",
        assertions: [
          {
            key: "english-formats",
            promotable: false,
            expectedFormats: {},
          },
        ],
      },
      {
        target: "web",
        assertions: [
          {
            key: "web-messages",
            promotable: false,
            locale: "en",
            expectedToIncludeMessages: ["common.welcome"],
          },
        ],
      },
    ];

    for (const test of tests) {
      expect(() => schema.parse(test)).not.toThrow();
    }
  });

  it("allows mixed keyed and keyless assertions", function () {
    expect(() =>
      schema.parse({
        message: "auth.signin",
        assertions: [
          {
            key: "shared",
            locale: "en",
            expectedTranslation: "Sign in",
          },
          {
            locale: "nl",
            expectedTranslation: "Aanmelden",
          },
        ],
      }),
    ).not.toThrow();
  });

  it("does not require a key when promotable is used", function () {
    expect(() =>
      schema.parse({
        segment: "adult",
        assertions: [
          {
            promotable: false,
            segment: "adult",
            expectedToMatch: true,
          },
        ],
      }),
    ).not.toThrow();
  });

  it("requires assertion keys to be unique when provided", function () {
    expect(() =>
      schema.parse({
        locale: "en",
        assertions: [
          { key: "same", expectedFormats: {} },
          { key: "same", expectedFormats: {} },
        ],
      }),
    ).toThrow("Duplicate assertion key");
  });

  it("rejects empty keys and non-boolean assertion promotable values", function () {
    expect(
      schema.safeParse({
        target: "web",
        assertions: [
          {
            key: "",
            locale: "en",
            expectedToIncludeMessages: ["common.welcome"],
          },
        ],
      }).success,
    ).toEqual(false);

    expect(
      schema.safeParse({
        target: "web",
        assertions: [
          {
            key: "web-messages",
            promotable: "no",
            locale: "en",
            expectedToIncludeMessages: ["common.welcome"],
          },
        ],
      }).success,
    ).toEqual(false);
  });

  it("rejects invalid matrix values", function () {
    const result = schema.safeParse({
      message: "auth.signin",
      assertions: [
        {
          matrix: {
            user: {
              name: "Ada",
            },
          },
          locale: "en",
          target: "web",
          expectedTranslation: "Sign in",
        },
      ],
    });

    expect(result.success).toEqual(false);
    const nestedIssues =
      result.error.issues[0]?.code === "invalid_union"
        ? result.error.issues[0].errors.flat()
        : result.error.issues;
    expect(
      nestedIssues.some(
        (issue) =>
          issue.path.join(".") === "assertions.0.matrix.user" &&
          issue.message.toLowerCase().includes("array"),
      ),
    ).toEqual(true);
  });

  it("requires runtime-specific expected values to be strings", function () {
    const result = schema.safeParse({
      message: "auth.signin",
      assertions: [
        {
          locale: "en",
          target: "web",
          expectedTranslation: "Sign in",
          expectedByRuntime: {
            go: 12,
          },
        },
      ],
    });

    expect(result.success).toEqual(false);
    const nestedIssues =
      result.error.issues[0]?.code === "invalid_union"
        ? result.error.issues[0].errors.flat()
        : result.error.issues;
    expect(
      nestedIssues.some(
        (issue) =>
          issue.path.join(".") === "assertions.0.expectedByRuntime.go" &&
          issue.message.toLowerCase().includes("string"),
      ),
    ).toEqual(true);
  });

  it("rejects empty runtime-specific expected values", function () {
    const result = schema.safeParse({
      message: "auth.signin",
      assertions: [
        {
          locale: "en",
          target: "web",
          expectedTranslation: "Sign in",
          expectedByRuntime: {},
        },
      ],
    });

    expect(result.success).toEqual(false);
    const nestedIssues =
      result.error.issues[0]?.code === "invalid_union"
        ? result.error.issues[0].errors.flat()
        : result.error.issues;
    expect(
      nestedIssues.some(
        (issue) =>
          issue.path.join(".") === "assertions.0.expectedByRuntime" &&
          issue.message.includes("at least one runtime"),
      ),
    ).toEqual(true);
  });

  it("rejects runtime-specific expected values that duplicate expectedTranslation", function () {
    const result = schema.safeParse({
      message: "auth.signin",
      assertions: [
        {
          locale: "en",
          target: "web",
          expectedTranslation: "Sign in",
          expectedByRuntime: {
            java: "Sign in",
          },
        },
      ],
    });

    expect(result.success).toEqual(false);
    const nestedIssues =
      result.error.issues[0]?.code === "invalid_union"
        ? result.error.issues[0].errors.flat()
        : result.error.issues;
    expect(
      nestedIssues.some(
        (issue) =>
          issue.path.join(".") === "assertions.0.expectedByRuntime.java" &&
          issue.message.includes("remove redundant runtime expectations"),
      ),
    ).toEqual(true);
  });

  it("keeps key-like fields strict and literal", function () {
    const result = schema.safeParse({
      message: "auth.signin",
      assertions: [
        {
          matrix: {
            locale: ["en"],
          },
          locale: "${{ locale }}",
          target: "web",
          expectedTranslation: "Sign in",
        },
      ],
    });

    expect(result.success).toEqual(false);
    expect(
      result.error.issues.some(
        (issue) =>
          issue.path.join(".").includes("locale") &&
          issue.message.includes('Unknown locale "${{ locale }}"'),
      ),
    ).toEqual(true);
  });

  it("accepts locale assertions with only raw-message translation or with both purposes", function () {
    expect(() =>
      schema.parse({
        locale: "en",
        assertions: [
          {
            rawMessage: "Hello {name}",
            values: {
              name: "Ada",
            },
            expectedTranslation: "Hello Ada",
          },
          {
            target: "web",
            expectedFormats: {
              number: {
                money: {
                  currency: "USD",
                },
              },
            },
            rawMessage: "{amount, number, money}",
            values: {
              amount: 12,
            },
            expectedTranslation: "$12.00",
          },
        ],
      }),
    ).not.toThrow();
  });

  it("accepts target assertions with structure checks, raw translation, or message translation", function () {
    expect(() =>
      schema.parse({
        target: "web",
        assertions: [
          {
            locale: "en",
            expectedToIncludeMessages: ["common.welcome"],
          },
          {
            locale: "en",
            rawMessage: "Hello {name}",
            values: {
              name: "Ada",
            },
            expectedTranslation: "Hello Ada",
          },
          {
            locale: "en",
            message: "common.welcome",
            expectedTranslation: "Hello Ada",
          },
          {
            locale: "en",
            expectedFormats: {
              number: {
                money: {
                  currency: "USD",
                },
              },
            },
            message: "common.welcome",
            expectedTranslation: "Hello Ada",
          },
        ],
      }),
    ).not.toThrow();
  });

  it("rejects incomplete or empty locale assertions", function () {
    const missingExpectedTranslation = schema.safeParse({
      locale: "en",
      assertions: [
        {
          rawMessage: "Hello {name}",
        },
      ],
    });

    expect(missingExpectedTranslation.success).toEqual(false);
    expect(
      missingExpectedTranslation.error.issues.some((issue) =>
        issue.message.includes("`rawMessage` and `expectedTranslation` together"),
      ),
    ).toEqual(true);

    const missingRawMessage = schema.safeParse({
      locale: "en",
      assertions: [
        {
          expectedTranslation: "Hello Ada",
        },
      ],
    });

    expect(missingRawMessage.success).toEqual(false);
    expect(
      missingRawMessage.error.issues.some((issue) =>
        issue.message.includes("`rawMessage` and `expectedTranslation` together"),
      ),
    ).toEqual(true);

    const emptyAssertion = schema.safeParse({
      locale: "en",
      assertions: [
        {
          description: "No-op",
        },
      ],
    });

    expect(emptyAssertion.success).toEqual(false);
    expect(
      emptyAssertion.error.issues.some((issue) =>
        issue.message.includes("at least one of `expectedFormats` or `rawMessage`"),
      ),
    ).toEqual(true);
  });

  it("rejects invalid target translation assertion combinations", function () {
    const bothSources = schema.safeParse({
      target: "web",
      assertions: [
        {
          locale: "en",
          rawMessage: "Hello {name}",
          message: "common.welcome",
          expectedTranslation: "Hello Ada",
        },
      ],
    });

    expect(bothSources.success).toEqual(false);
    expect(
      bothSources.error.issues.some((issue) =>
        issue.message.includes("either `rawMessage` or `message`, not both"),
      ),
    ).toEqual(true);

    const missingExpectedTranslation = schema.safeParse({
      target: "web",
      assertions: [
        {
          locale: "en",
          rawMessage: "Hello {name}",
        },
      ],
    });

    expect(missingExpectedTranslation.success).toEqual(false);
    expect(
      missingExpectedTranslation.error.issues.some((issue) =>
        issue.message.includes("must also define `expectedTranslation`"),
      ),
    ).toEqual(true);

    const orphanedExpectedTranslation = schema.safeParse({
      target: "web",
      assertions: [
        {
          locale: "en",
          expectedTranslation: "Hello Ada",
        },
      ],
    });

    expect(orphanedExpectedTranslation.success).toEqual(false);
    expect(
      orphanedExpectedTranslation.error.issues.some((issue) =>
        issue.message.includes("must also define `rawMessage` or `message`"),
      ),
    ).toEqual(true);

    const emptyAssertion = schema.safeParse({
      target: "web",
      assertions: [
        {
          locale: "en",
          description: "No-op",
        },
      ],
    });

    expect(emptyAssertion.success).toEqual(false);
    expect(
      emptyAssertion.error.issues.some((issue) =>
        issue.message.includes(
          "must define inclusion/exclusion checks, `expectedFormats`, or translation",
        ),
      ),
    ).toEqual(true);
  });
});
