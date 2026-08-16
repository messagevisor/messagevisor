import * as fs from "fs";
import * as path from "path";
import { createInterface } from "readline/promises";
import { Readable } from "stream";

import type { Plugin } from "../cli";
import { MessagevisorCLIError } from "../error";

const tar: any = require("tar");

export const DEFAULT_PROJECT = "yml";
export const EXAMPLES_ORG_NAME = "messagevisor";
export const EXAMPLES_REPO_NAME = "messagevisor";
export const EXAMPLES_BRANCH_NAME = "main";
export const EXAMPLES_TAR_URL = `https://codeload.github.com/${EXAMPLES_ORG_NAME}/${EXAMPLES_REPO_NAME}/tar.gz/${EXAMPLES_BRANCH_NAME}`;

export interface InitProjectOptions {
  overwrite?: boolean;
  tarballUrl?: string;
  tarballPath?: string;
  fetchImpl?: typeof fetch;
}

export interface InitCommandOptions extends InitProjectOptions {
  input?: NodeJS.ReadableStream & { isTTY?: boolean };
  output?: NodeJS.WritableStream & { isTTY?: boolean };
  promptDirectoryName?: (message: string) => Promise<string>;
}

export interface InitProjectResult {
  project: string;
  destinationDirectoryPath: string;
  createdFileCount: number;
  skippedConflictCount: number;
}

function getProjectArchivePath(projectName: string) {
  return `${EXAMPLES_REPO_NAME}-${EXAMPLES_BRANCH_NAME}/projects/project-${projectName}/`;
}

function getExcludedReason(relativePath: string) {
  const normalized = relativePath.replace(/\\/g, "/").replace(/\/+$/, "");

  if (!normalized) {
    return null;
  }

  const topLevelName = normalized.split("/")[0];

  if (["datafiles", "catalog", "exports", "imports", "node_modules"].includes(topLevelName)) {
    return "generated";
  }

  if (normalized === ".DS_Store" || normalized.endsWith("/.DS_Store")) {
    return "generated";
  }

  if (
    normalized === ".messagevisor/REVISION" ||
    normalized.startsWith(".messagevisor/cache/") ||
    normalized.startsWith(".messagevisor/promotions/") ||
    normalized.startsWith(".messagevisor/memory/") ||
    /^\.messagevisor\/sets\/[^/]+\/REVISION$/.test(normalized)
  ) {
    return "generated";
  }

  return null;
}

async function assertDestinationReady(directoryPath: string, overwrite?: boolean) {
  await fs.promises.mkdir(directoryPath, { recursive: true });
  const entries = await fs.promises.readdir(directoryPath);

  if (entries.length > 0 && !overwrite) {
    throw new MessagevisorCLIError(
      `Destination directory is not empty: ${directoryPath}. Pass --overwrite to initialize there and skip conflicting files.`,
    );
  }
}

async function isDirectoryEmpty(directoryPath: string) {
  await fs.promises.mkdir(directoryPath, { recursive: true });
  const entries = await fs.promises.readdir(directoryPath);

  return entries.length === 0;
}

function getInitProjectOptions(options: InitCommandOptions): InitProjectOptions {
  return {
    overwrite: options.overwrite,
    tarballUrl: options.tarballUrl,
    tarballPath: options.tarballPath,
    fetchImpl: options.fetchImpl,
  };
}

function validateNewDirectoryName(directoryName: string) {
  const trimmed = directoryName.trim();

  if (!trimmed) {
    throw new MessagevisorCLIError(
      "Directory name is required to initialize a new Messagevisor project.",
    );
  }

  if (
    path.isAbsolute(trimmed) ||
    trimmed.includes("/") ||
    trimmed.includes("\\") ||
    trimmed === "." ||
    trimmed === ".."
  ) {
    throw new MessagevisorCLIError(
      "Directory name must be a simple folder name, not an absolute path or nested path.",
    );
  }

  return trimmed;
}

async function promptForNewDirectoryName(
  message: string,
  options: InitCommandOptions,
): Promise<string> {
  if (options.promptDirectoryName) {
    return options.promptDirectoryName(message);
  }

  const input = options.input || process.stdin;
  const output = options.output || process.stdout;
  const canPrompt = input.isTTY !== false && output.isTTY !== false;

  if (!canPrompt) {
    throw new MessagevisorCLIError(
      "Current working directory is not empty. Run `messagevisor init` from an empty directory, or pass --overwrite.",
    );
  }

  const readline = createInterface({ input, output });

  try {
    return readline.question(message);
  } finally {
    readline.close();
  }
}

async function getTarballStream(options: InitProjectOptions = {}) {
  if (options.tarballPath) {
    return fs.createReadStream(options.tarballPath);
  }

  const fetchImpl = options.fetchImpl || fetch;
  const response = await fetchImpl(options.tarballUrl || EXAMPLES_TAR_URL);

  if (!response.ok || !response.body) {
    throw new Error(
      `Unable to download Messagevisor examples tarball: ${response.status} ${response.statusText}`,
    );
  }

  return Readable.fromWeb(response.body as any);
}

export async function initProject(
  directoryPath: string,
  projectName: string = DEFAULT_PROJECT,
  options: InitProjectOptions = {},
): Promise<InitProjectResult> {
  await assertDestinationReady(directoryPath, options.overwrite);

  const tarballStream = await getTarballStream(options);
  const projectArchivePath = getProjectArchivePath(projectName);
  let createdFileCount = 0;
  let skippedConflictCount = 0;
  let matchedProjectPath = false;

  await new Promise<void>((resolve, reject) => {
    tarballStream
      .pipe(
        tar.x({
          cwd: directoryPath,
          strip: 3,
          filter: (archivePath: string, entry: { type?: string }) => {
            if (!archivePath.startsWith(projectArchivePath)) {
              return false;
            }

            matchedProjectPath = true;
            const relativePath = archivePath.slice(projectArchivePath.length);

            if (!relativePath) {
              return false;
            }

            if (getExcludedReason(relativePath)) {
              return false;
            }

            const destinationPath = path.join(directoryPath, relativePath);
            const entryType = entry.type;

            if (entryType !== "Directory" && fs.existsSync(destinationPath)) {
              skippedConflictCount += 1;
              return false;
            }

            if (entryType !== "Directory") {
              createdFileCount += 1;
            }

            return true;
          },
        }),
      )
      .on("error", reject)
      .on("finish", resolve);
  });

  if (!matchedProjectPath) {
    throw new MessagevisorCLIError(
      `Unknown project "${projectName}". No matching project-${projectName} found in examples tarball.`,
    );
  }

  return {
    project: projectName,
    destinationDirectoryPath: directoryPath,
    createdFileCount,
    skippedConflictCount,
  };
}

export async function initProjectFromCLI(
  rootDirectoryPath: string,
  projectName: string = DEFAULT_PROJECT,
  options: InitCommandOptions = {},
): Promise<InitProjectResult> {
  if (options.overwrite || (await isDirectoryEmpty(rootDirectoryPath))) {
    return initProject(rootDirectoryPath, projectName, getInitProjectOptions(options));
  }

  const directoryName = validateNewDirectoryName(
    await promptForNewDirectoryName(
      `Current working directory is not empty: ${rootDirectoryPath}\nEnter a new directory name to initialize Messagevisor project: `,
      options,
    ),
  );
  const destinationDirectoryPath = path.join(rootDirectoryPath, directoryName);

  if (!(await isDirectoryEmpty(destinationDirectoryPath))) {
    throw new MessagevisorCLIError(
      `Destination directory is not empty: ${destinationDirectoryPath}. Please choose a different directory name.`,
    );
  }

  return initProject(destinationDirectoryPath, projectName, getInitProjectOptions(options));
}

export const initPlugin: Plugin = {
  command: "init",
  handler: async ({ rootDirectoryPath, parsed }) => {
    const result = await initProjectFromCLI(rootDirectoryPath, parsed.project || DEFAULT_PROJECT, {
      overwrite: parsed.overwrite === true,
    });

    console.log(`Initialized Messagevisor project from "${result.project}"`);
    console.log(`Destination directory: ${result.destinationDirectoryPath}`);
    console.log(`Created files: ${result.createdFileCount}`);

    if (result.skippedConflictCount > 0) {
      console.log(`Skipped conflicts: ${result.skippedConflictCount}`);
    }

    console.log(``);
    console.log(`Please run "npm install" in this directory.`);
  },
  examples: [
    {
      command: "init",
      description: "initialize a Messagevisor project from the default yml starter",
    },
    {
      command: "init --project=json",
      description: "initialize a Messagevisor project from the json starter",
    },
    {
      command: "init --project=environments",
      description: "initialize a Messagevisor project from the sets-based environments starter",
    },
  ],
};
