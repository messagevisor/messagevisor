import {
  runCLI,
  getProjectConfig,
  Datasource,
  formatMessagevisorCLIError,
  MessagevisorCLIError,
} from "@messagevisor/core";
import * as path from "path";

import {
  findProjectRootDirectoryPath,
  getCLICommand,
  getRootDirectoryPathArgument,
} from "./project";

function hasBooleanArgument(args: string[], name: string) {
  return args.some((argument) => argument === `--${name}` || argument === `--${name}=true`);
}

async function main() {
  let args = process.argv.slice(2);

  if (args.length === 1 && (args[0] === "version" || args[0] === "-v")) {
    args = ["--version"];
    process.argv = [...process.argv.slice(0, 2), ...args];
  }

  const helpCommandIndex = args.indexOf("help");
  if (helpCommandIndex !== -1) {
    args = [...args.slice(0, helpCommandIndex), ...args.slice(helpCommandIndex + 1), "--help"];
    process.argv = [...process.argv.slice(0, 2), ...args];
  }

  const rootDirectoryPathOption = getRootDirectoryPathArgument(args);
  const requestedDirectoryPath = rootDirectoryPathOption
    ? path.resolve(process.cwd(), rootDirectoryPathOption)
    : process.cwd();
  const command = getCLICommand(args);
  const wantsHelp = args.some((argument) => argument === "--help" || argument === "-h");
  const wantsVersion = args.some(
    (argument) => argument === "--version" || argument === "-v" || argument === "version",
  );
  const json = hasBooleanArgument(args, "json");
  const pretty = hasBooleanArgument(args, "pretty");
  const projectRootDirectoryPath =
    command === "init" ? undefined : findProjectRootDirectoryPath(requestedDirectoryPath);

  if (!projectRootDirectoryPath) {
    if (command && command !== "init" && !wantsHelp && !wantsVersion) {
      const error = new MessagevisorCLIError(
        `No Messagevisor project found from ${requestedDirectoryPath}. Run this command inside a project or pass --rootDirectoryPath=<path>.`,
        {
          code: "project_not_found",
          details: { directoryPath: requestedDirectoryPath },
        },
      );
      console.error(formatMessagevisorCLIError(error, { json, pretty }));
      process.exitCode = 1;
      return;
    }

    await runCLI({
      rootDirectoryPath: requestedDirectoryPath,
      includeProjectCommands: command !== "init",
    });
    return;
  }

  try {
    const projectConfig = getProjectConfig(projectRootDirectoryPath);
    const datasource = new Datasource(projectConfig, projectRootDirectoryPath);

    await runCLI({
      rootDirectoryPath: projectRootDirectoryPath,
      projectConfig,
      datasource,
    });
  } catch (error) {
    if (wantsHelp || wantsVersion) {
      await runCLI({
        rootDirectoryPath: projectRootDirectoryPath,
        includeProjectCommands: true,
      });
      return;
    }

    const configError = new MessagevisorCLIError(
      `Could not load Messagevisor project configuration: ${error instanceof Error ? error.message : String(error)}`,
      { code: "invalid_project_configuration" },
    );
    console.error(formatMessagevisorCLIError(configError, { json, pretty }));
    process.exitCode = 1;
  }
}

void main();
