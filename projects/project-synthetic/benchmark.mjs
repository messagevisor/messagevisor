import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
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
if (!Number.isInteger(repeat) || repeat < 1) {
  throw new Error("--repeat must be a positive integer.");
}

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
      const duration = (performance.now() - startedAt) / 1000;
      if (code === 0) {
        if (commandName === "catalog") {
          countCatalogFiles().then(async ({ catalogFiles, messageFiles }) => {
            const historyFiles = await countHistoryFiles(
              path.join(projectDirectoryPath, ".synthetic-catalog"),
            );
            const historyFileBudget = Math.floor(messageFiles / 50) + 250;
            if (catalogFiles >= messageFiles || historyFiles > historyFileBudget) {
              reject(
                new Error(
                  `Catalog wrote ${catalogFiles} files and ${historyFiles} history files for ${messageFiles} messages; expected fewer total files than messages and no more than ${historyFileBudget} history files.`,
                ),
              );
              return;
            }

            console.log(
              `\n${commandName}: ${duration.toFixed(2)}s (${catalogFiles} files, ${historyFiles} history files, ${messageFiles} message files)\n`,
            );
            resolve(duration);
          }, reject);
        } else {
          console.log(`\n${commandName}: ${duration.toFixed(2)}s\n`);
          resolve(duration);
        }
      } else {
        reject(new Error(`${commandName} failed with ${signal || `exit code ${code}`}.`));
      }
    });
  });
}

async function countFiles(directoryPath, predicate = () => true) {
  let total = 0;
  const entries = await readdir(directoryPath, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);
    total += entry.isDirectory()
      ? await countFiles(entryPath, predicate)
      : predicate(entryPath)
        ? 1
        : 0;
  }

  return total;
}

function countHistoryFiles(directoryPath) {
  return countFiles(directoryPath, (filePath) => filePath.split(path.sep).includes("history"));
}

async function countCatalogFiles() {
  const catalogFiles = await countFiles(path.join(projectDirectoryPath, ".synthetic-catalog"));
  const setEntries = await readdir(path.join(projectDirectoryPath, "sets"), {
    withFileTypes: true,
  });
  let messageFiles = 0;

  for (const entry of setEntries) {
    if (entry.isDirectory()) {
      messageFiles += await countFiles(
        path.join(projectDirectoryPath, "sets", entry.name, "messages"),
      );
    }
  }

  return { catalogFiles, messageFiles };
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
