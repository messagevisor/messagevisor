import { runCLI, getProjectConfig, Datasource, getCLIErrorOutput } from "@messagevisor/core";
import * as path from "path";

function getRootDirectoryPathFromArgs(args: string[]) {
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];

    if (arg.startsWith("--rootDirectoryPath=")) {
      return arg.slice("--rootDirectoryPath=".length);
    }

    if (arg.startsWith("--root-directory-path=")) {
      return arg.slice("--root-directory-path=".length);
    }

    if (arg === "--rootDirectoryPath" || arg === "--root-directory-path") {
      return args[index + 1];
    }
  }

  return undefined;
}

const rootDirectoryPathOption = getRootDirectoryPathFromArgs(process.argv.slice(2));
const rootDirectoryPath = rootDirectoryPathOption
  ? path.resolve(process.cwd(), rootDirectoryPathOption)
  : process.cwd();

let projectConfig;
let datasource;

try {
  projectConfig = getProjectConfig(rootDirectoryPath);
  datasource = new Datasource(projectConfig, rootDirectoryPath);
} catch (error) {
  const command = process.argv.slice(2)[0];

  if (command !== "init" && command !== "help" && command !== "--help" && command !== "-h") {
    console.error(getCLIErrorOutput(error));
    process.exit(1);
  }
}

runCLI({
  rootDirectoryPath,
  projectConfig,
  datasource,
}).catch((error) => {
  console.error(getCLIErrorOutput(error));
  process.exit(1);
});
