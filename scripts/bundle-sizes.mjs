import { gzipSync } from "node:zlib";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";

import { build } from "vite";

const rootDir = process.cwd();

const packages = [
  {
    name: "@messagevisor/sdk",
    entry: path.join(rootDir, "packages/sdk/src/index.ts"),
    fileName: "messagevisor-sdk",
    external: [],
  },
  {
    name: "@messagevisor/module-icu",
    entry: path.join(rootDir, "packages/module-icu/src/index.ts"),
    fileName: "messagevisor-module-icu",
    external: ["@messagevisor/sdk"],
  },
  {
    name: "@messagevisor/module-interpolation",
    entry: path.join(rootDir, "packages/module-interpolation/src/index.ts"),
    fileName: "messagevisor-module-interpolation",
    external: ["@messagevisor/sdk"],
  },
  {
    name: "@messagevisor/react",
    entry: path.join(rootDir, "packages/react/src/index.ts"),
    fileName: "messagevisor-react",
    external: ["react", "react-dom", "@messagevisor/sdk"],
  },
  {
    name: "@messagevisor/react-intl-compat",
    entry: path.join(rootDir, "packages/react-intl-compat/src/index.ts"),
    fileName: "messagevisor-react-intl-compat",
    external: ["react", "react-dom", "@messagevisor/sdk", "@messagevisor/react"],
  },
];

function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const kilobytes = bytes / 1024;

  return `${kilobytes.toFixed(2)} kB`;
}

function pad(text, width) {
  const value = String(text);

  if (value.length >= width) {
    return value;
  }

  return `${value}${" ".repeat(width - value.length)}`;
}

async function bundlePackage(packageConfig, minify) {
  const tempDir = await mkdtemp(path.join(tmpdir(), "messagevisor-bundle-sizes-"));
  const outDir = path.join(tempDir, minify ? "minified" : "original");

  try {
    await build({
      configFile: false,
      logLevel: "silent",
      build: {
        outDir,
        emptyOutDir: true,
        lib: {
          entry: packageConfig.entry,
          formats: ["es"],
          fileName: () => `${packageConfig.fileName}.js`,
        },
        minify,
        sourcemap: false,
        reportCompressedSize: false,
        target: "es2018",
        rollupOptions: {
          external: packageConfig.external,
        },
      },
    });

    const filePath = path.join(outDir, `${packageConfig.fileName}.js`);
    const content = await readFile(filePath);

    return {
      bytes: content.byteLength,
      gzippedBytes: gzipSync(content).byteLength,
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function main() {
  const rows = [];

  for (const packageConfig of packages) {
    const original = await bundlePackage(packageConfig, false);
    const minified = await bundlePackage(packageConfig, "esbuild");

    rows.push({
      packageName: packageConfig.name,
      original: formatBytes(original.bytes),
      minified: formatBytes(minified.bytes),
      gzipped: formatBytes(minified.gzippedBytes),
    });
  }

  const widths = {
    packageName: Math.max("Package".length, ...rows.map((row) => row.packageName.length)),
    original: Math.max("Original".length, ...rows.map((row) => row.original.length)),
    minified: Math.max("Minified".length, ...rows.map((row) => row.minified.length)),
    gzipped: Math.max("Minified + gzip".length, ...rows.map((row) => row.gzipped.length)),
  };

  const header = [
    pad("Package", widths.packageName),
    pad("Original", widths.original),
    pad("Minified", widths.minified),
    pad("Minified + gzip", widths.gzipped),
  ].join("  ");

  const separator = [
    "-".repeat(widths.packageName),
    "-".repeat(widths.original),
    "-".repeat(widths.minified),
    "-".repeat(widths.gzipped),
  ].join("  ");

  console.log("Messagevisor bundle sizes");
  console.log(header);
  console.log(separator);

  for (const row of rows) {
    console.log(
      [
        pad(row.packageName, widths.packageName),
        pad(row.original, widths.original),
        pad(row.minified, widths.minified),
        pad(row.gzipped, widths.gzipped),
      ].join("  "),
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
