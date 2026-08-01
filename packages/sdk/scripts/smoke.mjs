import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const packageDirectory = path.resolve(scriptDirectory, "..");
const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "messagevisor-sdk-package-"));

async function main() {
  try {
    const packOutput = execFileSync(
      "npm",
      [
        "pack",
        "--json",
        "--ignore-scripts",
        "--cache",
        path.join(temporaryDirectory, ".npm-cache"),
        "--pack-destination",
        temporaryDirectory,
      ],
      { cwd: packageDirectory, encoding: "utf8" },
    );
    const [{ filename, files }] = JSON.parse(packOutput);
    const tarballPath = path.join(temporaryDirectory, filename);
    execFileSync("tar", ["-xzf", tarballPath, "-C", temporaryDirectory]);
    // npm tarballs always contain a top-level `package` directory.
    const packedPackageDirectory = path.join(temporaryDirectory, "package");
    const packedPaths = files.map((file) => file.path);

    if (!packedPaths.includes("cjs/index.js") || !packedPaths.includes("node-esm/index.js")) {
      throw new Error("Packed SDK is missing a CommonJS or ESM entry");
    }
    if (packedPaths.some((file) => file.endsWith(".spec.ts"))) {
      throw new Error("Packed SDK unexpectedly contains test sources");
    }

    const consumerDirectory = path.join(temporaryDirectory, "consumer");
    const scopeDirectory = path.join(consumerDirectory, "node_modules", "@messagevisor");
    mkdirSync(scopeDirectory, { recursive: true });
    symlinkSync(packedPackageDirectory, path.join(scopeDirectory, "sdk"), "dir");
    const assertion =
      "if(typeof entry.createMessagevisor!=='function')throw new Error('missing createMessagevisor');" +
      "if(typeof entry.Messagevisor!=='undefined'||typeof entry.evaluateCondition!=='undefined')" +
      "throw new Error('internal runtime API exposed')";

    execFileSync("node", ["-e", `const entry=require('@messagevisor/sdk');${assertion}`], {
      cwd: consumerDirectory,
    });
    execFileSync(
      "node",
      ["--input-type=module", "-e", `import * as entry from '@messagevisor/sdk';${assertion}`],
      { cwd: consumerDirectory },
    );

    // Ensure exports resolve through package metadata, rather than direct build paths.
    JSON.parse(readFileSync(path.join(packedPackageDirectory, "package.json"), "utf8"));
    console.log("SDK packed-package smoke test passed for CommonJS and ESM.");
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

void main();
