import type { Segment } from "@messagevisor/types";

import { createTargetContextSpecializer } from "./applyContextToTarget";

const segments: Record<string, Segment> = {
  web: { conditions: { attribute: "platform", operator: "equals", value: "web" } },
  premium: { conditions: { attribute: "plan", operator: "equals", value: "pro" } },
  archived: { archived: true, conditions: "*" },
  everyone: { conditions: "*" },
};

describe("target context specialization", function () {
  it("removes conditions decided by target context while retaining unresolved children", function () {
    const specializer = createTargetContextSpecializer(segments, { platform: "web" });

    expect(
      specializer.applyContextToCondition({
        and: [
          { attribute: "platform", operator: "equals", value: "web" },
          { attribute: "plan", operator: "equals", value: "pro" },
        ],
      }),
    ).toEqual({
      state: "partial",
      value: { attribute: "plan", operator: "equals", value: "pro" },
    });
  });

  it("does not broaden an impossible not expression", function () {
    const specializer = createTargetContextSpecializer(segments, { platform: "web", plan: "pro" });

    expect(specializer.applyContextToGroupSegment({ not: ["web", "premium"] })).toEqual({
      state: "false",
    });
  });

  it("retains only unresolved children inside not", function () {
    const specializer = createTargetContextSpecializer(segments, { platform: "web" });

    expect(specializer.applyContextToGroupSegment({ not: ["web", "premium"] })).toEqual({
      state: "partial",
      value: { not: ["premium"] },
    });
    expect(specializer.specializedSegments.premium).toEqual(
      expect.objectContaining({ conditions: segments.premium.conditions }),
    );
  });

  it("treats missing and archived segment references as false", function () {
    const specializer = createTargetContextSpecializer(segments);
    expect(specializer.applyContextToGroupSegment("missing")).toEqual({ state: "false" });
    expect(specializer.applyContextToGroupSegment("archived")).toEqual({ state: "false" });
  });

  it("preserves wildcard segment truth while specializing target context", function () {
    const specializer = createTargetContextSpecializer(segments, { platform: "web" });
    expect(specializer.applyContextToGroupSegment("everyone")).toEqual({ state: "true" });
  });
});
