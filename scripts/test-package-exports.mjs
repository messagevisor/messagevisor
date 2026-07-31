import { readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const packages = [
  ["types", "@messagevisor/types"],
  ["sdk", "@messagevisor/sdk"],
  ["module-featurevisor", "@messagevisor/module-featurevisor"],
  ["module-icu", "@messagevisor/module-icu"],
  ["module-interpolation", "@messagevisor/module-interpolation"],
  ["module-missing-translations", "@messagevisor/module-missing-translations"],
  ["react", "@messagevisor/react"],
  ["react-intl-compat", "@messagevisor/react-intl-compat"],
  ["vue", "@messagevisor/vue"],
  ["catalog", "@messagevisor/catalog"],
  ["parsers", "@messagevisor/parsers"],
  ["core", "@messagevisor/core"],
  ["cli", "@messagevisor/cli", false],
];

function assertTarget(directory, target, label) {
  if (typeof target !== "string") throw new Error(`${label} is not configured`);
  statSync(join(directory, target));
}

function collectTargets(value) {
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object") return [];
  return Object.values(value).flatMap(collectTargets);
}

async function main() {
  for (const [directoryName, packageName, loadRuntime = true] of packages) {
    const directory = join(root, "packages", directoryName);
    const manifest = JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));

    assertTarget(directory, manifest.main, `${packageName} main`);
    if (manifest.types) assertTarget(directory, manifest.types, `${packageName} types`);
    else if (loadRuntime) throw new Error(`${packageName} types is not configured`);
    if (manifest.module) assertTarget(directory, manifest.module, `${packageName} module`);
    for (const [name, target] of Object.entries(manifest.bin || {})) {
      assertTarget(directory, target, `${packageName} bin ${name}`);
    }

    const rootExport = manifest.exports?.["."];
    if (rootExport) {
      for (const target of collectTargets(rootExport))
        assertTarget(directory, target, `${packageName} export`);
    }
    if (manifest.exports?.["./package.json"]) {
      assertTarget(
        directory,
        manifest.exports["./package.json"],
        `${packageName} package.json export`,
      );
    }

    if (loadRuntime) require(packageName);
  }

  const sdk = require("@messagevisor/sdk");
  const importedSdk = await import("@messagevisor/sdk");
  const expectedSdkExports = [
    "createMessagevisor",
    "evaluateCondition",
    "evaluateGroupSegment",
    "evaluateSegment",
  ];
  for (const loaded of [sdk, importedSdk]) {
    const actualExports = Object.keys(loaded).sort();
    if (JSON.stringify(actualExports) !== JSON.stringify(expectedSdkExports)) {
      throw new Error(`@messagevisor/sdk runtime exports differ: ${actualExports.join(", ")}`);
    }
    for (const name of expectedSdkExports) {
      if (typeof loaded[name] !== "function")
        throw new Error(`@messagevisor/sdk is missing ${name}`);
    }
  }

  console.log("Package entry points, declarations, export maps, CommonJS, and ESM are valid.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
