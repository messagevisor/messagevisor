import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { Readable } from "stream";

import { getProjectConfig } from "../config";
import { Datasource } from "../datasource";
import { lintProject } from "../linter";
import { createPlugin } from "./index";

async function writeFile(root: string, relativePath: string, content: string) {
  const filePath = path.join(root, relativePath);
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, content);
}

async function createProject(configContent = "module.exports = {};\n") {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-create-"));
  await writeFile(root, "messagevisor.config.js", configContent);
  return root;
}

async function createSetsProject() {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-create-sets-"));
  await writeFile(root, "messagevisor.config.js", "module.exports = { sets: true };\n");
  await fs.promises.mkdir(path.join(root, "sets/dev"), { recursive: true });
  await fs.promises.mkdir(path.join(root, "sets/production"), { recursive: true });
  return root;
}

function mockStdin(content: string) {
  const originalDescriptor = Object.getOwnPropertyDescriptor(process, "stdin");
  const stdin = Readable.from([content]) as NodeJS.ReadableStream & { isTTY?: boolean };
  stdin.isTTY = false;

  Object.defineProperty(process, "stdin", {
    configurable: true,
    value: stdin,
  });

  return () => {
    if (originalDescriptor) {
      Object.defineProperty(process, "stdin", originalDescriptor);
      return;
    }

    delete (process as any).stdin;
  };
}

function pluginOptions(projectConfig: any, datasource: any, parsed: Record<string, unknown>) {
  return {
    rootDirectoryPath: "",
    projectConfig,
    datasource,
    parsed: {
      _: [],
      ...parsed,
    },
  };
}

describe("createPlugin", function () {
  it("creates missing message definitions from --keys and respects namespace paths", async function () {
    const root = await createProject();
    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);

    await createPlugin.handler(
      pluginOptions(projectConfig, datasource, {
        locales: true,
        keys: "en\n",
      }),
    );

    await createPlugin.handler(
      pluginOptions(projectConfig, datasource, {
        messages: true,
        keys: "auth.signin\nauth.signout\n",
      }),
    );

    expect(fs.existsSync(path.join(root, "messages/auth/signin.yml"))).toBe(true);
    expect(fs.existsSync(path.join(root, "messages/auth/signout.yml"))).toBe(true);

    const lintResult = await lintProject(projectConfig, datasource);
    expect(lintResult.hasError).toBe(false);
  });

  it("creates missing locale, target, attribute, and segment definitions with lint-valid shells", async function () {
    const root = await createProject();
    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);

    await createPlugin.handler(
      pluginOptions(projectConfig, datasource, {
        locales: true,
        keys: "en\nnl\n",
      }),
    );
    await createPlugin.handler(
      pluginOptions(projectConfig, datasource, {
        targets: true,
        keys: "web\n",
      }),
    );
    await createPlugin.handler(
      pluginOptions(projectConfig, datasource, {
        attributes: true,
        keys: "plan\n",
      }),
    );
    await createPlugin.handler(
      pluginOptions(projectConfig, datasource, {
        segments: true,
        keys: "everyone\n",
      }),
    );

    const lintResult = await lintProject(projectConfig, datasource);
    expect(lintResult.hasError).toBe(false);
  });

  it("reads keys from stdin, trims whitespace, ignores blank lines, and dedupes duplicates", async function () {
    const root = await createProject();
    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);

    await createPlugin.handler(
      pluginOptions(projectConfig, datasource, {
        locales: true,
        keys: "en\n",
      }),
    );

    const restoreStdin = mockStdin(" auth.signin \n\nauth.signin\naccount.profile\n");

    try {
      await createPlugin.handler(
        pluginOptions(projectConfig, datasource, {
          messages: true,
        }),
      );
    } finally {
      restoreStdin();
    }

    expect((await datasource.listMessages()).sort()).toEqual(["account.profile", "auth.signin"]);
  });

  it("skips existing files and reports a JSON summary", async function () {
    const root = await createProject();
    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    await createPlugin.handler(
      pluginOptions(projectConfig, datasource, {
        locales: true,
        keys: "en\n",
      }),
    );

    await createPlugin.handler(
      pluginOptions(projectConfig, datasource, {
        messages: true,
        keys: "auth.signin\n",
      }),
    );

    await createPlugin.handler(
      pluginOptions(projectConfig, datasource, {
        messages: true,
        keys: "auth.signin\nauth.signout\n",
        json: true,
      }),
    );

    const summary = JSON.parse(String(logSpy.mock.calls[logSpy.mock.calls.length - 1][0]));
    expect(summary.entityType).toEqual("messages");
    expect(summary.requestedKeys).toEqual(["auth.signin", "auth.signout"]);
    expect(summary.createdKeys).toEqual(["auth.signout"]);
    expect(summary.skippedKeys).toEqual(["auth.signin"]);
    expect(summary.createdFilePaths).toEqual([
      path.relative(process.cwd(), path.join(root, "messages/auth/signout.yml")),
    ]);
    logSpy.mockRestore();
  });

  it("errors when creating messages without any locales", async function () {
    const root = await createProject();
    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    try {
      await expect(
        createPlugin.handler(
          pluginOptions(projectConfig, datasource, {
            messages: true,
            keys: "auth.signin\n",
          }),
        ),
      ).resolves.toEqual(false);

      expect(errorSpy).toHaveBeenCalledWith(
        "Cannot create messages without at least one locale. Create a locale first.",
      );
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("requires exactly one selector flag", async function () {
    const root = await createProject();
    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    try {
      await expect(
        createPlugin.handler(
          pluginOptions(projectConfig, datasource, {
            keys: "auth.signin\n",
          }),
        ),
      ).resolves.toEqual(false);
      expect(errorSpy).toHaveBeenCalledWith(
        "Nothing to create. Pass exactly one of --messages, --locales, --targets, --attributes, or --segments.",
      );

      errorSpy.mockClear();

      await expect(
        createPlugin.handler(
          pluginOptions(projectConfig, datasource, {
            messages: true,
            locales: true,
            keys: "auth.signin\n",
          }),
        ),
      ).resolves.toEqual(false);
      expect(errorSpy).toHaveBeenCalledWith(
        "Pass exactly one of --messages, --locales, --targets, --attributes, or --segments.",
      );
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("requires --set in sets-enabled projects", async function () {
    const root = await createSetsProject();
    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    try {
      await expect(
        createPlugin.handler(
          pluginOptions(projectConfig, datasource, {
            messages: true,
            keys: "auth.signin\n",
          }),
        ),
      ).resolves.toEqual(false);

      expect(errorSpy).toHaveBeenCalledWith("Pass --set=<set>");
    } finally {
      errorSpy.mockRestore();
    }
  });
});
