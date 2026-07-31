/* global process */

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
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

function linkExternalDependency(name) {
  const destination = join(modulesRoot, name);
  if (existsSync(destination)) return;
  mkdirSync(dirname(destination), { recursive: true });
  symlinkSync(join(root, "node_modules", name), destination, "junction");
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
    if (manifest.main && !existsSync(join(modulesRoot, manifest.name, manifest.main))) {
      throw new Error(`${manifest.name} is missing main entry ${manifest.main}`);
    }
    if (manifest.types && !existsSync(join(modulesRoot, manifest.name, manifest.types))) {
      throw new Error(`${manifest.name} is missing types entry ${manifest.types}`);
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

  console.log(`Validated ${manifests.length} packed Messagevisor packages.`);
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
