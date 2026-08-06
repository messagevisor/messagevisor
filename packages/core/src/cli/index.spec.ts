import { MessagevisorCLIError } from "../error";

import type { Plugin } from "./index";
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
  const originalExitCode = process.exitCode;

  afterEach(function () {
    process.argv = originalArgv;
    process.exitCode = originalExitCode;
    jest.restoreAllMocks();
  });

  it("sets a failure code when a command handler returns false", async function () {
    process.argv = ["node", "messagevisor", "expected-failure"];

    const successful = await runCLI({
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

    expect(successful).toBe(false);
    expect(process.exitCode).toBe(1);
  });

  it("rejects unknown command options before invoking a handler", async function () {
    process.argv = ["node", "messagevisor", "strict-command", "--typo=true"];
    const handler = jest.fn(async () => undefined);
    jest.spyOn(console, "error").mockImplementation(() => undefined);

    await runCLI({
      rootDirectoryPath: "/tmp/messagevisor-test",
      projectConfig: {
        plugins: [{ command: "strict-command", handler, examples: [] }],
      } as any,
      datasource: {} as any,
    });

    expect(handler).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("accepts options declared by custom plugins", async function () {
    process.argv = [
      "node",
      "messagevisor",
      "custom-command",
      "--dry-run",
      "--locale=en",
      "--locale=nl",
    ];
    const handler = jest.fn(async () => undefined);
    const plugin: Plugin = {
      command: "custom-command",
      options: {
        dryRun: { type: "boolean" },
        locale: { type: "array" },
      },
      handler,
      examples: [],
    };

    await runCLI({
      rootDirectoryPath: "/tmp/messagevisor-test",
      projectConfig: { plugins: [plugin] } as any,
      datasource: {} as any,
    });

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        parsed: expect.objectContaining({ dryRun: true, locale: ["en", "nl"] }),
      }),
    );
  });

  it("accepts positional arguments declared by commands", async function () {
    process.argv = ["node", "messagevisor", "custom-command", "export"];
    const handler = jest.fn(async () => undefined);

    await runCLI({
      rootDirectoryPath: "/tmp/messagevisor-test",
      projectConfig: {
        plugins: [
          {
            command: "custom-command [subcommand]",
            handler,
            examples: [],
          },
        ],
      } as any,
      datasource: {} as any,
    });

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        parsed: expect.objectContaining({ subcommand: "export" }),
      }),
    );
  });

  it("awaits asynchronous command handlers", async function () {
    process.argv = ["node", "messagevisor", "async-command"];
    let completed = false;

    await runCLI({
      rootDirectoryPath: "/tmp/messagevisor-test",
      projectConfig: {
        plugins: [
          {
            command: "async-command",
            handler: async () => {
              await new Promise((resolve) => setTimeout(resolve, 10));
              completed = true;
            },
            examples: [],
          },
        ],
      } as any,
      datasource: {} as any,
    });

    expect(completed).toBe(true);
  });

  it("rejects unexpected positional arguments", async function () {
    process.argv = ["node", "messagevisor", "strict-command", "unexpected"];
    const handler = jest.fn(async () => undefined);
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);

    await runCLI({
      rootDirectoryPath: "/tmp/messagevisor-test",
      projectConfig: {
        plugins: [{ command: "strict-command", handler, examples: [] }],
      } as any,
      datasource: {} as any,
    });

    expect(handler).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith("Unknown argument: unexpected");
    expect(process.exitCode).toBe(1);
  });

  it("prints structured parser failures when JSON output is requested", async function () {
    process.argv = ["node", "messagevisor", "strict-command", "--unknown", "--json"];
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);

    await runCLI({
      rootDirectoryPath: "/tmp/messagevisor-test",
      projectConfig: {
        plugins: [
          {
            command: "strict-command",
            options: { json: { type: "boolean" } },
            handler: async () => undefined,
            examples: [],
          },
        ],
      } as any,
      datasource: {} as any,
    });

    expect(JSON.parse(errorSpy.mock.calls[0][0])).toEqual({
      error: {
        code: "invalid_cli_arguments",
        message: "Unknown argument: unknown",
        details: {},
      },
    });
  });

  it("rejects duplicate project plugin commands", async function () {
    process.argv = ["node", "messagevisor", "config"];
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);

    await runCLI({
      rootDirectoryPath: "/tmp/messagevisor-test",
      projectConfig: {
        plugins: [{ command: "config", handler: async () => undefined, examples: [] }],
      } as any,
      datasource: {} as any,
    });

    expect(errorSpy).toHaveBeenCalledWith('CLI command "config" is already registered.');
    expect(process.exitCode).toBe(1);
  });
});
