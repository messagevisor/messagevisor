import type { Condition, Context, GroupSegment, Segment } from "@messagevisor/types";

import { evaluateCondition, evaluateGroupSegment, evaluateSegment } from "./conditions";

const context: Context = {
  platform: "web",
  plan: "pro",
  age: 42,
  name: "Ada Lovelace",
  email: "ada@example.com",
  beta: true,
  missingValue: null,
  roles: ["admin", "editor"],
  region: "EU",
  createdAt: "2025-01-02T12:00:00Z",
  user: {
    company: {
      tier: "enterprise",
    },
  },
};

const segments: Record<string, Segment> = {
  "platform-web": {
    conditions: { attribute: "platform", operator: "equals", value: "web" },
  },
  "plan-pro": {
    conditions: JSON.stringify({ attribute: "plan", operator: "equals", value: "pro" }),
  },
  "region-eu": {
    conditions: JSON.stringify([
      { attribute: "region", operator: "equals", value: "EU" },
      { attribute: "platform", operator: "equals", value: "web" },
    ]),
  },
  everyone: {
    conditions: "*",
  },
  archived: {
    archived: true,
    conditions: { attribute: "platform", operator: "equals", value: "web" },
  },
  invalid: {
    conditions: '{"attribute":',
  },
};

describe("evaluateCondition", function () {
  it("matches empty and wildcard conditions", function () {
    expect(evaluateCondition(undefined, { context })).toEqual(true);
    expect(evaluateCondition("*", { context })).toEqual(true);
  });

  it("does not treat plain strings as segment keys", function () {
    expect(evaluateCondition("platform-web", { context, segments })).toEqual(false);
    expect(evaluateCondition("not-json", { context })).toEqual(false);
    expect(evaluateCondition('{"attribute":', { context })).toEqual(false);
  });

  it("parses stringified condition objects and arrays", function () {
    expect(
      evaluateCondition(JSON.stringify({ attribute: "plan", operator: "equals", value: "pro" }), {
        context,
      }),
    ).toEqual(true);
    expect(
      evaluateCondition(
        JSON.stringify([
          { attribute: "plan", operator: "equals", value: "pro" },
          { attribute: "region", operator: "equals", value: "EU" },
        ]),
        { context },
      ),
    ).toEqual(true);
    expect(
      evaluateCondition(
        JSON.stringify([
          { attribute: "plan", operator: "equals", value: "pro" },
          { attribute: "region", operator: "equals", value: "US" },
        ]),
        { context },
      ),
    ).toEqual(false);
  });

  it("evaluates equality and existence operators", function () {
    const cases: Array<[Condition, boolean]> = [
      [{ attribute: "platform", operator: "equals", value: "web" }, true],
      [{ attribute: "platform", operator: "equals", value: "ios" }, false],
      [{ attribute: "platform", operator: "notEquals", value: "ios" }, true],
      [{ attribute: "platform", operator: "notEquals", value: "web" }, false],
      [{ attribute: "platform", operator: "exists" }, true],
      [{ attribute: "missing", operator: "exists" }, false],
      [{ attribute: "missingValue", operator: "exists" }, true],
      [{ attribute: "missing", operator: "notExists" }, true],
      [{ attribute: "missingValue", operator: "notExists" }, false],
      [{ attribute: "platform", operator: "notExists" }, false],
      [{ attribute: "user.company.tier", operator: "equals", value: "enterprise" }, true],
    ];

    cases.forEach(([condition, expected]) => {
      expect(evaluateCondition(condition, { context })).toEqual(expected);
    });
  });

  it("evaluates numeric operators", function () {
    const cases: Array<[Condition, boolean]> = [
      [{ attribute: "age", operator: "greaterThan", value: 41 }, true],
      [{ attribute: "age", operator: "greaterThan", value: 42 }, false],
      [{ attribute: "age", operator: "greaterThanOrEquals", value: 42 }, true],
      [{ attribute: "age", operator: "greaterThanOrEquals", value: 43 }, false],
      [{ attribute: "age", operator: "lessThan", value: 43 }, true],
      [{ attribute: "age", operator: "lessThan", value: 42 }, false],
      [{ attribute: "age", operator: "lessThanOrEquals", value: 42 }, true],
      [{ attribute: "age", operator: "lessThanOrEquals", value: 41 }, false],
    ];

    cases.forEach(([condition, expected]) => {
      expect(evaluateCondition(condition, { context })).toEqual(expected);
    });
  });

  it("evaluates string operators", function () {
    const cases: Array<[Condition, boolean]> = [
      [{ attribute: "name", operator: "contains", value: "Love" }, true],
      [{ attribute: "name", operator: "contains", value: "Grace" }, false],
      [{ attribute: "name", operator: "notContains", value: "Grace" }, true],
      [{ attribute: "name", operator: "notContains", value: "Ada" }, false],
      [{ attribute: "email", operator: "startsWith", value: "ada" }, true],
      [{ attribute: "email", operator: "startsWith", value: "bob" }, false],
      [{ attribute: "email", operator: "endsWith", value: "example.com" }, true],
      [{ attribute: "email", operator: "endsWith", value: "example.org" }, false],
    ];

    cases.forEach(([condition, expected]) => {
      expect(evaluateCondition(condition, { context })).toEqual(expected);
    });
  });

  it("evaluates date operators", function () {
    const cases: Array<[Condition, boolean]> = [
      [{ attribute: "createdAt", operator: "before", value: "2025-01-03T00:00:00Z" }, true],
      [{ attribute: "createdAt", operator: "before", value: "2025-01-01T00:00:00Z" }, false],
      [{ attribute: "createdAt", operator: "after", value: "2025-01-01T00:00:00Z" }, true],
      [{ attribute: "createdAt", operator: "after", value: "2025-01-03T00:00:00Z" }, false],
      [{ attribute: "createdAt", operator: "before", value: "not-a-date" }, false],
      [{ attribute: "missing", operator: "after", value: "2025-01-01T00:00:00Z" }, false],
    ];

    cases.forEach(([condition, expected]) => {
      expect(evaluateCondition(condition, { context })).toEqual(expected);
    });
  });

  it("evaluates array and membership operators", function () {
    const cases: Array<[Condition, boolean]> = [
      [{ attribute: "roles", operator: "includes", value: "admin" }, true],
      [{ attribute: "roles", operator: "includes", value: "owner" }, false],
      [{ attribute: "roles", operator: "notIncludes", value: "owner" }, true],
      [{ attribute: "roles", operator: "notIncludes", value: "admin" }, false],
      [{ attribute: "platform", operator: "notIncludes", value: "web" }, false],
      [{ attribute: "region", operator: "in", value: ["EU", "NA"] }, true],
      [{ attribute: "region", operator: "in", value: ["US", "NA"] }, false],
      [{ attribute: "region", operator: "notIn", value: ["US", "NA"] }, true],
      [{ attribute: "region", operator: "notIn", value: ["EU", "NA"] }, false],
      [{ attribute: "region", operator: "notIn", value: "EU" as any }, false],
    ];

    cases.forEach(([condition, expected]) => {
      expect(evaluateCondition(condition, { context })).toEqual(expected);
    });
  });

  it("evaluates and, or, not, and condition arrays", function () {
    expect(
      evaluateCondition(
        [
          { attribute: "platform", operator: "equals", value: "web" },
          { attribute: "plan", operator: "equals", value: "pro" },
        ],
        { context },
      ),
    ).toEqual(true);
    expect(
      evaluateCondition(
        [
          { attribute: "platform", operator: "equals", value: "web" },
          { attribute: "plan", operator: "equals", value: "free" },
        ],
        { context },
      ),
    ).toEqual(false);
    expect(
      evaluateCondition(
        {
          and: [
            { attribute: "platform", operator: "equals", value: "web" },
            { attribute: "plan", operator: "equals", value: "pro" },
          ],
        },
        { context },
      ),
    ).toEqual(true);
    expect(
      evaluateCondition(
        {
          or: [
            { attribute: "platform", operator: "equals", value: "ios" },
            { attribute: "plan", operator: "equals", value: "pro" },
          ],
        },
        { context },
      ),
    ).toEqual(true);
    expect(
      evaluateCondition(
        {
          not: [
            { attribute: "platform", operator: "equals", value: "ios" },
            { attribute: "plan", operator: "equals", value: "free" },
          ],
        },
        { context },
      ),
    ).toEqual(true);
    expect(
      evaluateCondition(
        {
          not: [
            { attribute: "platform", operator: "equals", value: "web" },
            { attribute: "plan", operator: "equals", value: "pro" },
          ],
        },
        { context },
      ),
    ).toEqual(false);
  });

  it("evaluates feature and experiment conditions through resolvers", function () {
    expect(
      evaluateCondition(
        { feature: "new-checkout", operator: "isEnabled" },
        { context, resolveFlag: (key) => key === "new-checkout" },
      ),
    ).toEqual(true);
    expect(
      evaluateCondition(
        { feature: "new-checkout", operator: "isDisabled" },
        { context, resolveFlag: (key) => key !== "new-checkout" },
      ),
    ).toEqual(true);
    expect(
      evaluateCondition({ feature: "new-checkout", operator: "isEnabled" }, { context }),
    ).toEqual(false);
    expect(
      evaluateCondition(
        { experiment: "checkout-copy", operator: "hasVariation", value: "b" },
        { context, resolveVariation: (key) => (key === "checkout-copy" ? "b" : "a") },
      ),
    ).toEqual(true);
    expect(
      evaluateCondition(
        { experiment: "checkout-copy", operator: "hasVariation", value: "c" },
        { context, resolveVariation: () => "b" },
      ),
    ).toEqual(false);
    expect(
      evaluateCondition(
        { experiment: "checkout-copy", operator: "hasVariation", value: "b" },
        { context, resolveVariation: () => null },
      ),
    ).toEqual(false);
    expect(
      evaluateCondition(
        { experiment: "checkout-copy", operator: "hasVariation", value: "b" },
        { context },
      ),
    ).toEqual(false);
  });

  it("returns false for unknown condition operators", function () {
    expect(
      evaluateCondition({ attribute: "platform", operator: "unknown", value: "web" } as any, {
        context,
      }),
    ).toEqual(false);
    expect(evaluateCondition({ feature: "flag", operator: "unknown" } as any, { context })).toEqual(
      false,
    );
    expect(
      evaluateCondition({ experiment: "experiment", operator: "unknown", value: "a" } as any, {
        context,
      }),
    ).toEqual(false);
  });
});

describe("evaluateGroupSegment", function () {
  it("matches empty and wildcard segment groups", function () {
    expect(evaluateGroupSegment(undefined, { context, segments })).toEqual(true);
    expect(evaluateGroupSegment("*", { context, segments })).toEqual(true);
  });

  it("evaluates segment keys and missing or archived segments", function () {
    expect(evaluateGroupSegment("platform-web", { context, segments })).toEqual(true);
    expect(evaluateGroupSegment("missing", { context, segments })).toEqual(false);
    expect(evaluateGroupSegment("archived", { context, segments })).toEqual(false);
    expect(evaluateGroupSegment("invalid", { context, segments })).toEqual(false);
    expect(evaluateGroupSegment("platform-web", { context, segments: undefined })).toEqual(false);
  });

  it("evaluates segment definitions with stringified conditions", function () {
    expect(evaluateGroupSegment("plan-pro", { context, segments })).toEqual(true);
    expect(evaluateGroupSegment("region-eu", { context, segments })).toEqual(true);
    expect(evaluateGroupSegment("everyone", { context: {}, segments })).toEqual(true);
  });

  it("evaluates and, or, not, and segment arrays", function () {
    const cases: Array<[GroupSegment | GroupSegment[], boolean]> = [
      [["platform-web", "plan-pro"], true],
      [["platform-web", "missing"], false],
      [{ and: ["platform-web", "plan-pro"] }, true],
      [{ and: ["platform-web", "missing"] }, false],
      [{ or: ["missing", "plan-pro"] }, true],
      [{ or: ["missing", "archived"] }, false],
      [{ not: ["missing", "archived"] }, true],
      [{ not: ["platform-web", "missing"] }, true],
      [{ not: ["platform-web", "plan-pro"] }, false],
    ];

    cases.forEach(([groupSegment, expected]) => {
      expect(evaluateGroupSegment(groupSegment, { context, segments })).toEqual(expected);
    });
  });

  it("parses stringified segment groups", function () {
    expect(
      evaluateGroupSegment(JSON.stringify({ and: ["platform-web", "plan-pro"] }), {
        context,
        segments,
      }),
    ).toEqual(true);
    expect(
      evaluateGroupSegment(JSON.stringify(["platform-web", "plan-pro"]), {
        context,
        segments,
      }),
    ).toEqual(true);
    expect(
      evaluateGroupSegment(JSON.stringify({ and: ["platform-web", "missing"] }), {
        context,
        segments,
      }),
    ).toEqual(false);
    expect(evaluateGroupSegment('{"and":', { context, segments })).toEqual(false);
  });

  it("returns false for unknown group segment operators", function () {
    expect(evaluateGroupSegment({ nor: ["platform-web"] } as any, { context, segments })).toEqual(
      false,
    );
  });
});

describe("evaluateSegment", function () {
  it("evaluates individual segments", function () {
    expect(evaluateSegment("platform-web", { context, segments })).toEqual(true);
    expect(evaluateSegment("missing", { context, segments })).toEqual(false);
    expect(evaluateSegment("archived", { context, segments })).toEqual(false);
    expect(evaluateSegment("plan-pro", { context, segments })).toEqual(true);
    expect(evaluateSegment("invalid", { context, segments })).toEqual(false);
  });
});
