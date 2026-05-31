import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { getProjectConfig } from "../config";
import { Datasource } from "../datasource";
import { generateCodeForProject, generateCodePlugin } from "./index";

async function writeFile(root: string, relativePath: string, content: string) {
  const filePath = path.join(root, relativePath);

  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, content);
}

async function createProject() {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-codegen-"));

  await writeFile(root, "messagevisor.config.js", "module.exports = {};\n");
  await writeFile(root, "locales/en-US.yml", "description: English\n");
  await writeFile(
    root,
    "targets/web.yml",
    "description: Web\nincludeMessages:\n  - common*\n  - checkout*\nexcludeMessages:\n  - common.hidden\nlocales:\n  - en-US\n",
  );
  await writeFile(
    root,
    "messages/common/welcome.yml",
    "description: Welcome\ntranslations:\n  en-US: Welcome\n",
  );
  await writeFile(
    root,
    "messages/checkout/total.yml",
    "description: Total\ntranslations:\n  en-US: Total\n",
  );
  await writeFile(
    root,
    "messages/common/hidden.yml",
    "description: Hidden\ntranslations:\n  en-US: Hidden\n",
  );
  await writeFile(
    root,
    "messages/common/draft.yml",
    "description: Draft\ntranslations:\n  en-US: Draft\n",
  );
  await writeFile(
    root,
    "messages/common/archived.yml",
    "description: Archived\narchived: true\ntranslations:\n  en-US: Archived\n",
  );

  return root;
}

async function generate(root: string, options: Record<string, unknown>) {
  const projectConfig = getProjectConfig(root);
  const datasource = new Datasource(projectConfig, root);

  return generateCodeForProject(projectConfig, datasource, root, {
    language: "typescript",
    outDir: "generated",
    ...options,
  });
}

async function readGenerated(root: string, fileName: string) {
  return fs.promises.readFile(path.join(root, "generated", fileName), "utf8");
}

describe("generate-code/typescript", function () {
  let roots: string[] = [];
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(function () {
    consoleLogSpy = jest.spyOn(console, "log").mockImplementation(function () {
      // Keep generator unit tests focused on generated files.
    });
  });

  afterEach(async function () {
    consoleLogSpy.mockRestore();

    for (const root of roots) {
      await fs.promises.rm(root, { recursive: true, force: true });
    }

    roots = [];
  });

  it("generates typed SDK helpers without runtime key metadata", async function () {
    const root = await createProject();
    roots.push(root);

    const result = await generate(root, {});
    const messages = await readGenerated(root, "messages.ts");
    const sdk = await readGenerated(root, "sdk.ts");
    const index = await readGenerated(root, "index.ts");

    expect(result.messageKeys).toEqual([
      "checkout.total",
      "common.draft",
      "common.hidden",
      "common.welcome",
    ]);
    expect(messages).toEqual(
      [
        "export type MessagevisorMessageKey =",
        '  | "checkout.total"',
        '  | "common.draft"',
        '  | "common.hidden"',
        '  | "common.welcome";',
        "",
      ].join("\n"),
    );
    expect(messages).not.toContain("const");
    expect(messages).not.toContain("[");
    expect(messages).not.toContain("{");
    expect(sdk).toContain("let instance: Messagevisor | undefined;");
    expect(sdk).toContain("export function setInstance(messagevisor: Messagevisor)");
    expect(sdk).toContain("export function getInstance()");
    expect(sdk).toContain("export function translate(");
    expect(sdk).toContain("export const t = translate;");
    expect(index).toContain('export type * from "./messages";');
    expect(index).toContain('export * from "./sdk";');
    expect(index).not.toContain("./react");
  });

  it("prints expected plugin option errors without throwing", async function () {
    const root = await createProject();
    roots.push(root);
    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    try {
      await expect(
        generateCodePlugin.handler({
          rootDirectoryPath: root,
          projectConfig,
          datasource,
          parsed: {
            outDir: "generated",
          },
        } as any),
      ).resolves.toEqual(false);

      expect(errorSpy).toHaveBeenCalledWith("Option --language is required.");
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("generates React helpers when requested", async function () {
    const root = await createProject();
    roots.push(root);

    await generate(root, { react: true });

    const react = await readGenerated(root, "react.ts");
    const index = await readGenerated(root, "index.ts");

    expect(react).toContain("useBaseTranslation");
    expect(react).toContain("export function useTranslation(");
    expect(react).toContain("export function useMessagevisor()");
    expect(react).toContain("t: messagevisor.t as typeof useTranslation");
    expect(index).toContain('export * from "./react";');
  });

  it("supports target and include/exclude message filters", async function () {
    const root = await createProject();
    roots.push(root);

    await generate(root, {
      target: "web",
      includeMessages: "common*",
      excludeMessages: "common.hidden",
    });

    const messages = await readGenerated(root, "messages.ts");

    expect(messages).toContain('"common.draft"');
    expect(messages).toContain('"common.welcome"');
    expect(messages).not.toContain("checkout.total");
    expect(messages).not.toContain("common.hidden");
    expect(messages).not.toContain("common.archived");
  });

  it("generates never when no messages match", async function () {
    const root = await createProject();
    roots.push(root);

    await generate(root, {
      includeMessages: "missing*",
    });

    await expect(readGenerated(root, "messages.ts")).resolves.toEqual(
      "export type MessagevisorMessageKey = never;\n",
    );
  });

  it("generates union across sets by default and selected set with --set", async function () {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-codegen-"));
    roots.push(root);

    await writeFile(root, "messagevisor.config.js", "module.exports = { sets: true };\n");

    for (const set of ["storefront", "admin"]) {
      await writeFile(root, `sets/${set}/locales/en-US.yml`, "description: English\n");
      await writeFile(
        root,
        `sets/${set}/messages/common/welcome.yml`,
        `description: Welcome\ntranslations:\n  en-US: ${set} welcome\n`,
      );
    }

    await writeFile(
      root,
      "sets/storefront/messages/storefront/cart.yml",
      "description: Cart\ntranslations:\n  en-US: Cart\n",
    );
    await writeFile(
      root,
      "sets/admin/messages/admin/dashboard.yml",
      "description: Dashboard\ntranslations:\n  en-US: Dashboard\n",
    );

    await generate(root, {});
    expect(await readGenerated(root, "messages.ts")).toContain('"admin.dashboard"');
    expect(await readGenerated(root, "messages.ts")).toContain('"storefront.cart"');
    expect(await readGenerated(root, "messages.ts")).toContain('"common.welcome"');

    await fs.promises.rm(path.join(root, "generated"), { recursive: true, force: true });

    await generate(root, { set: "storefront" });
    const messages = await readGenerated(root, "messages.ts");

    expect(messages).not.toContain("admin.dashboard");
    expect(messages).toContain('"storefront.cart"');
    expect(messages).toContain('"common.welcome"');
  });
});
