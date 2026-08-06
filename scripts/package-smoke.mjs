/* global process */

import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const packageDirectories = [
  "types",
  "parsers",
  "sdk",
  "module-featurevisor",
  "module-icu",
  "module-interpolation",
  "module-missing-translations",
  "react",
  "react-intl-compat",
  "vue",
  "catalog",
  "core",
  "cli",
];
const temporaryRoot = mkdtempSync(join(tmpdir(), "messagevisor-packages-"));
const modulesRoot = join(temporaryRoot, "node_modules");
const cache = join(temporaryRoot, "npm-cache");
const manifestsByName = new Map();
const packagePathsByName = new Map();
// Core optionally discovers the host CLI version for generated datafile metadata.
// It is guarded at runtime and core must remain independently installable.
const optionalHostImports = new Map([
  [
    "@messagevisor/core",
    new Set([
      "@messagevisor/cli",
      // This name appears inside generated React source text, not as a core runtime import.
      "@messagevisor/react",
    ]),
  ],
]);

function linkExternalDependency(name) {
  const destination = join(modulesRoot, name);
  if (existsSync(destination)) return;
  mkdirSync(dirname(destination), { recursive: true });
  symlinkSync(join(root, "node_modules", name), destination, "junction");
}

function findInternalImports(directory) {
  const imports = new Set();
  const visit = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const entryPath = join(current, entry.name);
      if (entry.isDirectory()) {
        visit(entryPath);
        continue;
      }
      if (!/\.(?:[cm]?js|d\.ts)$/.test(entry.name)) continue;
      const content = readFileSync(entryPath, "utf8");
      const importPattern =
        /(?:\brequire\s*\(|\brequire\.resolve\s*\(|\bimport\s*\(|\bfrom\s+)["']@messagevisor\/([a-z0-9._-]+)/gi;
      for (const match of content.matchAll(importPattern)) {
        imports.add(`@messagevisor/${match[1]}`);
      }
    }
  };
  visit(directory);
  return imports;
}

function collectExportTargets(value) {
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object") return [];
  return Object.values(value).flatMap(collectExportTargets);
}

try {
  mkdirSync(modulesRoot, { recursive: true });
  const manifests = [];

  for (const directory of packageDirectories) {
    const packageRoot = join(root, "packages", directory);
    const output = JSON.parse(
      execFileSync("npm", ["pack", "--json", "--pack-destination", temporaryRoot], {
        cwd: packageRoot,
        env: { ...process.env, npm_config_cache: cache },
        encoding: "utf8",
      }),
    );
    const packedFiles = output[0].files.map(({ path }) => path);
    const unwantedFiles = packedFiles.filter(
      (file) =>
        file.endsWith(".DS_Store") ||
        /\.spec\.[cm]?[jt]sx?(?:\.map)?$/.test(file) ||
        /(?:^|\/)(?:jest\.config\.[cm]?js|tsconfig(?:\.[^/]+)?\.json)$/.test(file) ||
        file.includes("test-fixtures") ||
        (directory !== "types" && (file === "src" || file.startsWith("src/"))),
    );
    if (unwantedFiles.length > 0) {
      throw new Error(
        `${directory} contains source/test files that should not be published: ${unwantedFiles.join(", ")}`,
      );
    }
    const tarball = join(temporaryRoot, output[0].filename);
    const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
    const destination = join(modulesRoot, manifest.name);
    mkdirSync(destination, { recursive: true });
    execFileSync("tar", ["-xzf", tarball, "--strip-components=1", "-C", destination]);
    manifests.push(manifest);
    manifestsByName.set(manifest.name, manifest);
    packagePathsByName.set(manifest.name, destination);
  }

  for (const manifest of manifests.filter(({ name }) => name.startsWith("@messagevisor/module-"))) {
    if (manifest.dependencies?.["@messagevisor/sdk"]) {
      throw new Error(`${manifest.name} must declare @messagevisor/sdk as a peerDependency.`);
    }
    const peerRange = manifest.peerDependencies?.["@messagevisor/sdk"];
    if (!peerRange) {
      throw new Error(`${manifest.name} must declare @messagevisor/sdk as a peerDependency.`);
    }
    if (Number.parseInt(manifest.version, 10) >= 1 && /(?:^|\s|\|)[~^<>=]*0\./.test(peerRange)) {
      throw new Error(`${manifest.name} v1+ must not accept a pre-v1 @messagevisor/sdk peer.`);
    }
  }

  for (const manifest of manifests) {
    for (const dependency of Object.keys({
      ...(manifest.dependencies || {}),
      ...(manifest.peerDependencies || {}),
    })) {
      if (!dependency.startsWith("@messagevisor/")) linkExternalDependency(dependency);
    }
  }

  for (const manifest of manifests) {
    const declared = new Set([
      manifest.name,
      ...Object.keys(manifest.dependencies || {}),
      ...Object.keys(manifest.peerDependencies || {}),
    ]);
    for (const imported of findInternalImports(packagePathsByName.get(manifest.name))) {
      if (!declared.has(imported) && !optionalHostImports.get(manifest.name)?.has(imported)) {
        throw new Error(`${manifest.name} imports undeclared internal package ${imported}.`);
      }
    }
  }

  function collectInternalDependencies(manifest, collected = new Set()) {
    if (collected.has(manifest.name)) return collected;
    collected.add(manifest.name);
    const dependencies = {
      ...(manifest.dependencies || {}),
      ...(manifest.peerDependencies || {}),
    };
    for (const dependency of Object.keys(dependencies)) {
      const internal = manifestsByName.get(dependency);
      if (internal) collectInternalDependencies(internal, collected);
    }
    return collected;
  }

  for (const manifest of manifests.filter(({ name }) => name !== "@messagevisor/cli")) {
    const consumer = join(temporaryRoot, `consumer-${manifest.name.replace("@messagevisor/", "")}`);
    const consumerModules = join(consumer, "node_modules");
    mkdirSync(consumerModules, { recursive: true });

    for (const dependencyName of collectInternalDependencies(manifest)) {
      const destination = join(consumerModules, dependencyName);
      mkdirSync(dirname(destination), { recursive: true });
      symlinkSync(packagePathsByName.get(dependencyName), destination, "junction");
    }

    const externalDependencies = new Set();
    for (const dependencyName of collectInternalDependencies(manifest)) {
      const dependencyManifest = manifestsByName.get(dependencyName);
      for (const externalName of Object.keys({
        ...(dependencyManifest.dependencies || {}),
        ...(dependencyManifest.peerDependencies || {}),
      })) {
        if (!externalName.startsWith("@messagevisor/")) externalDependencies.add(externalName);
      }
    }
    for (const externalName of externalDependencies) {
      const destination = join(consumerModules, externalName);
      if (existsSync(destination)) continue;
      mkdirSync(dirname(destination), { recursive: true });
      symlinkSync(join(root, "node_modules", externalName), destination, "junction");
    }

    execFileSync(process.execPath, ["-e", `require(${JSON.stringify(manifest.name)})`], {
      cwd: consumer,
      stdio: "inherit",
    });
  }

  for (const manifest of manifests) {
    if (manifest.main && !existsSync(join(modulesRoot, manifest.name, manifest.main))) {
      throw new Error(`${manifest.name} is missing main entry ${manifest.main}`);
    }
    if (manifest.types && !existsSync(join(modulesRoot, manifest.name, manifest.types))) {
      throw new Error(`${manifest.name} is missing types entry ${manifest.types}`);
    }
    for (const [subpath, target] of Object.entries(manifest.exports || {})) {
      for (const resolvedTarget of collectExportTargets(target)) {
        if (!existsSync(join(modulesRoot, manifest.name, resolvedTarget))) {
          throw new Error(
            `${manifest.name} is missing packed export ${subpath}: ${resolvedTarget}`,
          );
        }
      }
    }
  }

  execFileSync(
    process.execPath,
    [
      "-e",
      `for (const name of ${JSON.stringify(
        packageDirectories.filter((name) => name !== "cli").map((name) => `@messagevisor/${name}`),
      )}) require(name);`,
    ],
    { cwd: temporaryRoot, stdio: "inherit" },
  );
  execFileSync(
    process.execPath,
    ["--input-type=module", "-e", `await import('@messagevisor/sdk')`],
    { cwd: temporaryRoot, stdio: "inherit" },
  );

  const consumerRoot = join(temporaryRoot, "typescript-consumer");
  linkExternalDependency("@types/node");
  linkExternalDependency("@types/react");
  linkExternalDependency("@types/react-dom");
  mkdirSync(consumerRoot);
  writeFileSync(
    join(consumerRoot, "index.ts"),
    [
      'import { createMessagevisor, type Messagevisor, type MessagevisorOptions } from "@messagevisor/sdk";',
      ...packageDirectories
        .filter((name) => !["sdk", "cli"].includes(name))
        .map(
          (name) => `import type * as ${name.replaceAll("-", "_")} from "@messagevisor/${name}";`,
        ),
      'const options: MessagevisorOptions = { locale: "en" };',
      "const messagevisor: Messagevisor = createMessagevisor(options);",
      "void messagevisor;",
    ].join("\n"),
  );
  writeFileSync(
    join(consumerRoot, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          lib: ["ES2022", "DOM", "ES2022.Intl"],
          module: "NodeNext",
          moduleResolution: "NodeNext",
          noEmit: true,
          skipLibCheck: false,
          strict: true,
          target: "ES2022",
        },
        files: ["index.ts"],
      },
      null,
      2,
    ),
  );
  execFileSync(
    process.execPath,
    [join(root, "node_modules/typescript/bin/tsc"), "-p", consumerRoot],
    {
      cwd: consumerRoot,
      stdio: "inherit",
    },
  );

  const cliBin = join(packagePathsByName.get("@messagevisor/cli"), "bin.js");
  const projectOneRoot = join(root, "projects", "project-1");
  const runPackedCLI = (args, expectedStatus = 0) => {
    const result = spawnSync(process.execPath, [cliBin, ...args], {
      cwd: temporaryRoot,
      encoding: "utf8",
    });

    if (result.status !== expectedStatus) {
      throw new Error(
        `Packed CLI ${args.join(" ")} exited ${result.status}; expected ${expectedStatus}.\n${result.stdout}\n${result.stderr}`,
      );
    }

    return result;
  };

  const versionResult = runPackedCLI(["--version"]);
  if (!versionResult.stdout.includes(manifestsByName.get("@messagevisor/cli").version)) {
    throw new Error(`Packed CLI returned an unexpected version: ${versionResult.stdout}`);
  }

  const nestedProjectResult = runPackedCLI([
    "info",
    "--rootDirectoryPath",
    join(projectOneRoot, "messages"),
    "--json",
  ]);
  const nestedProjectInfo = JSON.parse(nestedProjectResult.stdout);
  if (nestedProjectInfo.messages < 1 || nestedProjectInfo.locales < 1) {
    throw new Error("Packed CLI did not discover project-1 from a nested directory.");
  }

  const unknownCommandResult = runPackedCLI(
    ["unknown-command", "--rootDirectoryPath", projectOneRoot],
    1,
  );
  if (!unknownCommandResult.stderr.includes('Unknown command "unknown-command"')) {
    throw new Error(`Packed CLI did not reject an unknown command: ${unknownCommandResult.stderr}`);
  }

  const structuredErrorResult = runPackedCLI(
    ["find-usage", "--rootDirectoryPath", projectOneRoot, "--json"],
    1,
  );
  const structuredError = JSON.parse(structuredErrorResult.stderr);
  if (structuredError.error?.code !== "cli_error") {
    throw new Error(`Packed CLI returned an invalid JSON error: ${structuredErrorResult.stderr}`);
  }

  const missingProjectResult = runPackedCLI(
    ["lint", "--rootDirectoryPath", temporaryRoot, "--json"],
    1,
  );
  const missingProjectError = JSON.parse(missingProjectResult.stderr);
  if (missingProjectError.error?.code !== "project_not_found") {
    throw new Error(
      `Packed CLI returned an invalid missing-project error: ${missingProjectResult.stderr}`,
    );
  }

  const helpWithoutProjectResult = runPackedCLI([
    "lint",
    "--rootDirectoryPath",
    temporaryRoot,
    "--help",
  ]);
  if (!helpWithoutProjectResult.stdout.includes("messagevisor lint")) {
    throw new Error("Packed CLI could not show command help outside a project.");
  }

  const globalOptionBeforeInitResult = runPackedCLI([
    "--rootDirectoryPath",
    temporaryRoot,
    "init",
    "--help",
  ]);
  if (!globalOptionBeforeInitResult.stdout.includes("messagevisor init")) {
    throw new Error("Packed CLI could not parse a global option before init.");
  }

  const dashedAssetsResult = runPackedCLI(
    ["catalog", "export", "--rootDirectoryPath", projectOneRoot, "--no-assets", "--port=3001"],
    1,
  );
  if (!dashedAssetsResult.stderr.includes("--port can only be used")) {
    throw new Error(`Packed CLI rejected --no-assets incorrectly: ${dashedAssetsResult.stderr}`);
  }

  console.log(`Validated ${manifests.length} packed Messagevisor packages.`);
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
