import { MessagevisorCLIError } from "../error";

import { getCLIErrorOutput, runCLI } from "./index";

describe("getCLIErrorOutput", function () {
  it("returns friendly CLI text for MessagevisorCLIError instances", function () {
    const error = new MessagevisorCLIError(
      [
        'Promotion from "dev" to "production" is not allowed by this project\'s configured promotionFlows.',
        "Allowed flows: dev -> staging, staging -> production.",
        "Choose one of the allowed promotion paths or update messagevisor.config.js if this flow should be permitted.",
      ].join("\n"),
    );

    expect(getCLIErrorOutput(error)).toEqual(error.cliMessage);
  });

  it("returns regular Error instances unchanged", function () {
    const error = new Error("Boom");

    expect(getCLIErrorOutput(error)).toBe(error);
    expect(getCLIErrorOutput("plain string")).toEqual("plain string");
  });
});

describe("runCLI", function () {
  const originalArgv = process.argv;

  afterEach(function () {
    process.argv = originalArgv;
    jest.restoreAllMocks();
  });

  it("exits with a failure code when a command handler returns false", async function () {
    process.argv = ["node", "messagevisor", "expected-failure"];
    const exitSpy = jest.spyOn(process, "exit").mockImplementation(() => undefined as never);

    await runCLI({
      rootDirectoryPath: "/tmp/messagevisor-test",
      projectConfig: {
        plugins: [
          {
            command: "expected-failure",
            handler: async () => false,
            examples: [],
          },
        ],
      } as any,
      datasource: {} as any,
    });

    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
