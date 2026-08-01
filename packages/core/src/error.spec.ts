import { formatMessagevisorCLIError, getMessagevisorCLIError, MessagevisorCLIError } from "./error";

describe("MessagevisorCLIError", () => {
  it("exposes a stable structured JSON envelope", () => {
    const error = new MessagevisorCLIError("Invalid target", {
      code: "invalid_target",
      details: { target: "missing" },
    });

    expect(error.toJSON()).toEqual({
      error: {
        code: "invalid_target",
        message: "Invalid target",
        details: { target: "missing" },
      },
    });
    expect(JSON.parse(formatMessagevisorCLIError(error, { json: true }) as string)).toEqual(
      error.toJSON(),
    );
    expect(formatMessagevisorCLIError(error)).toBe("Invalid target");
  });

  it("normalizes CLI-like errors without discarding details", () => {
    const error = getMessagevisorCLIError({
      cliMessage: "Failed",
      code: "failed",
      details: { reason: "test" },
    });

    expect(error?.toJSON()).toEqual({
      error: { code: "failed", message: "Failed", details: { reason: "test" } },
    });
  });
});
