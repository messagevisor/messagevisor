import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import {
  findProjectRootDirectoryPath,
  getCLICommand,
  getRootDirectoryPathArgument,
} from "./project";

describe("CLI project discovery", () => {
  it("reads camel-cased and dashed root directory arguments", () => {
    expect(getRootDirectoryPathArgument(["info", "--rootDirectoryPath=/tmp/project"])).toBe(
      "/tmp/project",
    );
    expect(getRootDirectoryPathArgument(["--root-directory-path", "/tmp/project", "info"])).toBe(
      "/tmp/project",
    );
  });

  it("finds commands when global options come first", () => {
    expect(getCLICommand(["--rootDirectoryPath", "/tmp/project", "init", "--project=1"])).toBe(
      "init",
    );
  });

  it("discovers a project from a nested directory", async () => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-cli-project-"));
    const nested = path.join(root, "messages", "account");
    await fs.promises.mkdir(nested, { recursive: true });
    await fs.promises.writeFile(
      path.join(root, "messagevisor.config.js"),
      "module.exports = {};\n",
    );

    expect(findProjectRootDirectoryPath(nested)).toBe(root);
  });
});
