import { runCLI, getProjectConfig, Datasource, getCLIErrorOutput } from "@messagevisor/core";

const rootDirectoryPath = process.cwd();

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
