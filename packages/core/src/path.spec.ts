import * as path from "path";

import { formatRootRelativePath } from "./path";

describe("path formatting", function () {
  it("formats paths relative to the selected project root", function () {
    const root = path.join(path.sep, "tmp", "messagevisor-project");

    expect(formatRootRelativePath(root, path.join(root, "messages/auth/signin.yml"))).toEqual(
      path.join("messages", "auth", "signin.yml"),
    );
  });

  it("keeps paths outside the selected project root absolute", function () {
    const root = path.join(path.sep, "tmp", "messagevisor-project");
    const outside = path.join(path.sep, "tmp", "other", "translations.csv");

    expect(formatRootRelativePath(root, outside)).toEqual(outside);
  });
});
