import * as sdk from "./index";

describe("SDK root exports", function () {
  it("exposes only the intended runtime API", function () {
    expect(Object.keys(sdk).sort()).toEqual([
      "createMessagevisor",
      "evaluateCondition",
      "evaluateGroupSegment",
      "evaluateSegment",
    ]);
  });
});
