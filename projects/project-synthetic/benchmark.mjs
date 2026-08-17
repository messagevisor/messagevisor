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
const requestedRepeat = process.argv.find((value) => value.startsWith("--repeat="));
const repeat = requestedRepeat ? Number(requestedRepeat.slice("--repeat=".length)) : 1;
const requestedCatalogLayout = process.argv.find((value) => value.startsWith("--layout="));
const catalogLayout = requestedCatalogLayout
  ? requestedCatalogLayout.slice("--layout=".length)
  : undefined;

if (!Number.isInteger(repeat) || repeat < 1) {
  throw new Error("--repeat must be a positive integer.");
}

function run(commandName) {
  const args =
    commandName === "catalog"
      ? [
          "catalog",
          "export",
          "--outDir=.synthetic-catalog",
          "--assets=false",
          ...(catalogLayout ? [`--layout=${catalogLayout}`] : []),
        ]
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
      const duration = (performance.now() - startedAt) / 1000;
      if (code === 0) {
        console.log(`\n${commandName}: ${duration.toFixed(2)}s\n`);
        resolve(duration);
      } else {
        reject(new Error(`${commandName} failed with ${signal || `exit code ${code}`}.`));
      }
    });
  });
}

async function main() {
  for (const commandName of commands) {
    const durations = [];

    for (let index = 0; index < repeat; index += 1) {
      durations.push(await run(commandName));
    }

    if (durations.length > 1) {
      const minimum = Math.min(...durations);
      const maximum = Math.max(...durations);
      const average = durations.reduce((sum, duration) => sum + duration, 0) / durations.length;
      console.log(
        `${commandName} summary: min ${minimum.toFixed(2)}s, avg ${average.toFixed(2)}s, max ${maximum.toFixed(2)}s\n`,
      );
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
