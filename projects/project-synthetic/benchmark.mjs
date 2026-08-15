import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

const projectDirectoryPath = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.resolve(projectDirectoryPath, "../../packages/cli/bin.js");
const requestedCommand = process.argv.find((value) => value.startsWith("--command="));
const command = requestedCommand ? requestedCommand.slice("--command=".length) : "all";
const commands = command === "all" ? ["build", "lint", "test", "export", "catalog"] : [command];

function run(commandName) {
  const args =
    commandName === "catalog"
      ? ["catalog", "export", "--outDir=.synthetic-catalog", "--assets=false"]
      : commandName === "export"
        ? [
            "export",
            "--set=dev",
            "--locale=en-US",
            "--target=web",
            "--output=exports/synthetic.csv",
            "--force",
          ]
        : [commandName];

  return new Promise((resolve, reject) => {
    const startedAt = performance.now();
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd: projectDirectoryPath,
      stdio: "inherit",
      env: process.env,
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      const duration = ((performance.now() - startedAt) / 1000).toFixed(2);
      if (code === 0) {
        console.log(`\n${commandName}: ${duration}s\n`);
        resolve();
      } else {
        reject(new Error(`${commandName} failed with ${signal || `exit code ${code}`}.`));
      }
    });
  });
}

async function main() {
  for (const commandName of commands) {
    await run(commandName);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
