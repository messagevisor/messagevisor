import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const temporaryDirectory = mkdtempSync(join(tmpdir(), "messagevisor-browser-"));
const browserCandidates = [
  process.env.MESSAGEVISOR_BROWSER_BIN,
  process.env.CHROME_BIN,
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", ...options });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed\n${result.stderr || ""}`);
  }
  return result.stdout || "";
}

try {
  const packageRoot = join(temporaryDirectory, "node_modules", "@messagevisor", "sdk");
  mkdirSync(packageRoot, { recursive: true });
  const packed = JSON.parse(
    run("npm", ["pack", "--json", "--pack-destination", temporaryDirectory], {
      cwd: join(root, "packages", "sdk"),
      env: { ...process.env, npm_config_cache: join(temporaryDirectory, "npm-cache") },
    }),
  );
  run("tar", [
    "-xzf",
    join(temporaryDirectory, packed[0].filename),
    "--strip-components=1",
    "-C",
    packageRoot,
  ]);

  const entryPath = join(temporaryDirectory, "entry.js");
  const bundlePath = join(temporaryDirectory, "bundle.js");
  const htmlPath = join(temporaryDirectory, "index.html");

  writeFileSync(
    entryPath,
    `
import { createMessagevisor } from "@messagevisor/sdk";

const messagevisor = createMessagevisor({
  logLevel: "fatal",
  datafile: {
    schemaVersion: "1",
    messagevisorVersion: "browser",
    revision: "browser",
    target: "web",
    locale: "en",
    segments: {
      pro: { conditions: { attribute: "plan", operator: "equals", value: "pro" } },
    },
    messages: {
      greeting: { overrides: [{ key: "pro", segments: "pro", translation: "Hello pro" }] },
    },
    translations: { greeting: "Hello" },
  },
  context: { plan: "pro" },
});

document.body.dataset.result = messagevisor.translate("greeting") === "Hello pro" ? "passed" : "failed";
`,
  );

  run(join(root, "node_modules", ".bin", "esbuild"), [
    entryPath,
    "--bundle",
    "--format=iife",
    "--platform=browser",
    "--target=es2022",
    `--outfile=${bundlePath}`,
  ]);
  writeFileSync(
    htmlPath,
    '<!doctype html><html><body><script src="./bundle.js"></script></body></html>',
  );

  const browser = browserCandidates.find(
    (candidate) => spawnSync(candidate, ["--version"], { stdio: "ignore" }).status === 0,
  );
  if (!browser) {
    throw new Error(
      "No Chrome or Chromium executable found. Set MESSAGEVISOR_BROWSER_BIN to run the browser smoke test.",
    );
  }

  const html = run(
    browser,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-background-networking",
      "--disable-extensions",
      "--no-first-run",
      "--dump-dom",
      pathToFileURL(htmlPath).href,
    ],
    { timeout: 30000 },
  );
  if (!html.includes('data-result="passed"')) {
    throw new Error(`Browser smoke test did not pass:\n${html}`);
  }

  console.log("Packed browser SDK bundle and evaluation smoke test passed in current Chrome.");
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
