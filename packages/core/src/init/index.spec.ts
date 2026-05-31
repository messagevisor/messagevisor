import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { Datasource } from "../datasource";
import { getProjectConfig } from "../config";
import { lintProject } from "../linter";
import { DEFAULT_PROJECT, initProject, initProjectFromCLI } from "./index";

const tar: any = require("tar");

const REPO_ROOT = path.resolve(__dirname, "../../../..");
const PROJECT_FIXTURES = [
  "projects/project-yml",
  "projects/project-json",
  "projects/project-raw",
  "projects/project-environments",
  "projects/project-test-envs",
];

let tarballPathPromise: Promise<string> | undefined;

async function getFixtureTarballPath() {
  if (!tarballPathPromise) {
    tarballPathPromise = (async () => {
      const tempDirectoryPath = await fs.promises.mkdtemp(
        path.join(os.tmpdir(), "messagevisor-init-tarball-"),
      );
      const tarballPath = path.join(tempDirectoryPath, "examples.tar.gz");

      await tar.c(
        {
          gzip: true,
          file: tarballPath,
          cwd: REPO_ROOT,
          prefix: "messagevisor-main/",
        },
        PROJECT_FIXTURES,
      );

      return tarballPath;
    })();
  }

  return tarballPathPromise;
}

async function createDestinationDirectory() {
  return fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-init-destination-"));
}

async function installModuleIcuStub(directoryPath: string) {
  const moduleDirectoryPath = path.join(
    directoryPath,
    "node_modules",
    "@messagevisor",
    "module-icu",
  );

  await fs.promises.mkdir(moduleDirectoryPath, { recursive: true });
  await fs.promises.writeFile(
    path.join(moduleDirectoryPath, "index.js"),
    "exports.createICUModule = function () { return { name: 'icu' }; };\n",
  );
}

describe("initProject", function () {
  it("defaults to the yml starter and strips generated artifacts", async function () {
    const directoryPath = await createDestinationDirectory();
    const tarballPath = await getFixtureTarballPath();

    const result = await initProject(directoryPath, DEFAULT_PROJECT, {
      tarballPath,
    });

    expect(result.project).toEqual("yml");
    expect(fs.existsSync(path.join(directoryPath, "messagevisor.config.js"))).toBe(true);
    expect(fs.existsSync(path.join(directoryPath, "messages/nav/contact.yml"))).toBe(true);
    expect(fs.existsSync(path.join(directoryPath, "tests/messages/nav/contact.spec.yml"))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(directoryPath, "datafiles"))).toBe(false);
    expect(fs.existsSync(path.join(directoryPath, ".messagevisor", "REVISION"))).toBe(false);

    await installModuleIcuStub(directoryPath);
    const projectConfig = getProjectConfig(directoryPath);
    const datasource = new Datasource(projectConfig, directoryPath);
    const lintResult = await lintProject(projectConfig, datasource);
    expect(lintResult.hasError).toBe(false);
  });

  it("scaffolds the json starter", async function () {
    const directoryPath = await createDestinationDirectory();
    const tarballPath = await getFixtureTarballPath();

    await initProject(directoryPath, "json", { tarballPath });

    expect(fs.existsSync(path.join(directoryPath, "locales/en.json"))).toBe(true);
    expect(fs.existsSync(path.join(directoryPath, "tests/messages/nav/contact.spec.json"))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(directoryPath, "messagevisor.config.js"))).toBe(true);
  });

  it("scaffolds the environments starter with sets and strips generated artifacts", async function () {
    const directoryPath = await createDestinationDirectory();
    const tarballPath = await getFixtureTarballPath();

    await initProject(directoryPath, "environments", { tarballPath });

    expect(fs.existsSync(path.join(directoryPath, "sets/dev/messages/nav/contact.yml"))).toBe(true);
    expect(fs.existsSync(path.join(directoryPath, "sets/staging/tests/targets/web.spec.yml"))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(directoryPath, "datafiles"))).toBe(false);
    expect(
      fs.existsSync(path.join(directoryPath, ".messagevisor", "sets", "dev", "REVISION")),
    ).toBe(false);
  });

  it("fails clearly for unknown projects", async function () {
    const directoryPath = await createDestinationDirectory();
    const tarballPath = await getFixtureTarballPath();

    await expect(
      initProject(directoryPath, "nope", {
        tarballPath,
      }),
    ).rejects.toThrow(
      'Unknown project "nope". No matching project-nope found in examples tarball.',
    );
  });

  it("fails in a non-empty destination without overwrite", async function () {
    const directoryPath = await createDestinationDirectory();
    const tarballPath = await getFixtureTarballPath();
    await fs.promises.writeFile(path.join(directoryPath, "existing.txt"), "hello");

    await expect(
      initProject(directoryPath, "yml", {
        tarballPath,
      }),
    ).rejects.toThrow("Pass --overwrite to initialize there and skip conflicting files.");
  });

  it("skips conflicting files when overwrite is enabled", async function () {
    const directoryPath = await createDestinationDirectory();
    const tarballPath = await getFixtureTarballPath();
    const configPath = path.join(directoryPath, "messagevisor.config.js");
    await fs.promises.writeFile(configPath, "module.exports = { custom: true };\n");

    const result = await initProject(directoryPath, "yml", {
      tarballPath,
      overwrite: true,
    });

    expect(result.skippedConflictCount).toBeGreaterThanOrEqual(1);
    expect(await fs.promises.readFile(configPath, "utf8")).toEqual(
      "module.exports = { custom: true };\n",
    );
    expect(fs.existsSync(path.join(directoryPath, "locales/en.yml"))).toBe(true);
  });
});

describe("initProjectFromCLI", function () {
  it("initializes in place when the current directory is empty without prompting", async function () {
    const directoryPath = await createDestinationDirectory();
    const tarballPath = await getFixtureTarballPath();
    const promptDirectoryName = jest.fn();

    const result = await initProjectFromCLI(directoryPath, DEFAULT_PROJECT, {
      tarballPath,
      promptDirectoryName,
    });

    expect(result.destinationDirectoryPath).toEqual(directoryPath);
    expect(promptDirectoryName).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(directoryPath, "messagevisor.config.js"))).toBe(true);
  });

  it("prompts for a child directory when the current directory is not empty", async function () {
    const directoryPath = await createDestinationDirectory();
    const tarballPath = await getFixtureTarballPath();
    await fs.promises.writeFile(path.join(directoryPath, "existing.txt"), "hello");

    const result = await initProjectFromCLI(directoryPath, DEFAULT_PROJECT, {
      tarballPath,
      promptDirectoryName: async () => "my-project",
    });
    const projectDirectoryPath = path.join(directoryPath, "my-project");

    expect(result.destinationDirectoryPath).toEqual(projectDirectoryPath);
    expect(fs.existsSync(path.join(directoryPath, "existing.txt"))).toBe(true);
    expect(fs.existsSync(path.join(projectDirectoryPath, "messagevisor.config.js"))).toBe(true);
  });

  it("rejects a blank prompted directory name", async function () {
    const directoryPath = await createDestinationDirectory();
    const tarballPath = await getFixtureTarballPath();
    await fs.promises.writeFile(path.join(directoryPath, "existing.txt"), "hello");

    await expect(
      initProjectFromCLI(directoryPath, DEFAULT_PROJECT, {
        tarballPath,
        promptDirectoryName: async () => "   ",
      }),
    ).rejects.toThrow("Directory name is required to initialize a new Messagevisor project.");
  });

  it("rejects absolute and nested prompted directory names", async function () {
    const directoryPath = await createDestinationDirectory();
    const tarballPath = await getFixtureTarballPath();
    await fs.promises.writeFile(path.join(directoryPath, "existing.txt"), "hello");

    await expect(
      initProjectFromCLI(directoryPath, DEFAULT_PROJECT, {
        tarballPath,
        promptDirectoryName: async () => path.join(directoryPath, "project"),
      }),
    ).rejects.toThrow("Directory name must be a simple folder name");

    await expect(
      initProjectFromCLI(directoryPath, DEFAULT_PROJECT, {
        tarballPath,
        promptDirectoryName: async () => "nested/project",
      }),
    ).rejects.toThrow("Directory name must be a simple folder name");
  });

  it("rejects an existing non-empty child directory", async function () {
    const directoryPath = await createDestinationDirectory();
    const tarballPath = await getFixtureTarballPath();
    const childDirectoryPath = path.join(directoryPath, "my-project");
    await fs.promises.writeFile(path.join(directoryPath, "existing.txt"), "hello");
    await fs.promises.mkdir(childDirectoryPath);
    await fs.promises.writeFile(path.join(childDirectoryPath, "existing.txt"), "hello");

    await expect(
      initProjectFromCLI(directoryPath, DEFAULT_PROJECT, {
        tarballPath,
        promptDirectoryName: async () => "my-project",
      }),
    ).rejects.toThrow("Please choose a different directory name.");
  });

  it("initializes in the current directory without prompting when overwrite is enabled", async function () {
    const directoryPath = await createDestinationDirectory();
    const tarballPath = await getFixtureTarballPath();
    const promptDirectoryName = jest.fn();
    await fs.promises.writeFile(path.join(directoryPath, "existing.txt"), "hello");

    const result = await initProjectFromCLI(directoryPath, DEFAULT_PROJECT, {
      tarballPath,
      overwrite: true,
      promptDirectoryName,
    });

    expect(result.destinationDirectoryPath).toEqual(directoryPath);
    expect(promptDirectoryName).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(directoryPath, "existing.txt"))).toBe(true);
    expect(fs.existsSync(path.join(directoryPath, "messagevisor.config.js"))).toBe(true);
  });

  it("fails clearly for non-interactive non-empty current directories", async function () {
    const directoryPath = await createDestinationDirectory();
    const tarballPath = await getFixtureTarballPath();
    await fs.promises.writeFile(path.join(directoryPath, "existing.txt"), "hello");

    await expect(
      initProjectFromCLI(directoryPath, DEFAULT_PROJECT, {
        tarballPath,
        input: { isTTY: false } as NodeJS.ReadableStream & { isTTY: boolean },
        output: { isTTY: false } as NodeJS.WritableStream & { isTTY: boolean },
      }),
    ).rejects.toThrow(
      "Current working directory is not empty. Run `messagevisor init` from an empty directory, or pass --overwrite.",
    );
  });
});
