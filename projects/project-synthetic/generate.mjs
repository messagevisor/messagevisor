import { mkdir, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const projectDirectoryPath = path.dirname(fileURLToPath(import.meta.url));
const sets = getNumberOption("sets", 3);
const messages = getNumberOption("messages", 50000);
const localeCount = getNumberOption("locales", 12);
const setNames = ["dev", "staging", "production"].slice(0, sets);
const allLocales = [
  "en-US",
  "en-GB",
  "de-DE",
  "fr-FR",
  "nl-NL",
  "es-ES",
  "it-IT",
  "pt-BR",
  "ja-JP",
  "ko-KR",
  "ar-SA",
  "sv-SE",
];
const locales = allLocales.slice(0, Math.max(1, Math.min(localeCount, allLocales.length)));
const concurrency = getNumberOption("concurrency", 32);
const historyCount = getNonNegativeNumberOption("history", 10);
const varianceEnabled = getVarianceOption();

function getNumberOption(name, fallback) {
  const argument = process.argv.find((value) => value.startsWith(`--${name}=`));
  const value = argument ? Number(argument.slice(name.length + 3)) : fallback;

  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`--${name} must be a positive integer.`);
  }

  return value;
}

function getNonNegativeNumberOption(name, fallback) {
  const argument = process.argv.find((value) => value.startsWith(`--${name}=`));
  const value = argument ? Number(argument.slice(name.length + 3)) : fallback;

  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`--${name} must be a non-negative integer.`);
  }

  return value;
}

function getVarianceOption() {
  const argument = process.argv.find((value) => value.startsWith("--variance="));
  const value = argument ? argument.slice("--variance=".length) : "on";

  if (value === "on") {
    return true;
  }

  if (value === "off") {
    return false;
  }

  throw new Error("--variance must be either on or off.");
}

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function translationLength(rng) {
  const u1 = rng() || 1e-9;
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);

  return Math.min(900, Math.max(20, Math.round(Math.exp(Math.log(60) + 0.62 * z))));
}

function variedTranslation(messageKey, locale, length) {
  const prefix = `Message ${messageKey} in ${locale}: `;
  const filler =
    "This synthetic translation contains realistic variable length content for catalog performance measurements. ";

  if (length <= prefix.length) {
    return prefix.slice(0, length);
  }

  return `${prefix}${filler.repeat(Math.ceil((length - prefix.length) / filler.length))}`.slice(
    0,
    length,
  );
}

function yamlString(value) {
  return JSON.stringify(value);
}

function localeDocument(locale) {
  return [
    `description: ${locale} synthetic locale`,
    `direction: ${locale === "ar-SA" ? "rtl" : "ltr"}`,
    "formats:",
    "  number:",
    "    decimal:",
    "      style: decimal",
    "      minimumFractionDigits: 2",
    "  date:",
    "    short:",
    "      dateStyle: short",
    "  time:",
    "    clock:",
    "      timeStyle: short",
    "",
  ].join("\n");
}

function messageDocument(messageIndex, revision = 0) {
  const key = String(messageIndex).padStart(6, "0");
  const description = revision > 0 ? ` (history revision ${revision})` : "";
  const lines = [`description: Synthetic message ${key}${description}`, "translations:"];
  const rng = mulberry32(messageIndex);
  const baseTranslationLength =
    varianceEnabled && messageIndex !== 1 ? translationLength(rng) : undefined;

  for (const locale of locales) {
    const translation =
      messageIndex === 1
        ? `There are {count, number, decimal} items on {when, date, short} in ${locale}`
        : baseTranslationLength
          ? variedTranslation(key, locale, baseTranslationLength)
          : `Message ${key} in ${locale}`;
    lines.push(`  ${locale}: ${yamlString(translation)}`);
  }

  if (messageIndex === 1) {
    lines.push(
      "examples:",
      "  - locale: en-US",
      "    description: Exercises named number and date formats",
      "    values:",
      "      count: 3",
      "      when: 2025-01-15T12:00:00.000Z",
    );
  }

  if (varianceEnabled && messageIndex !== 1 && rng() < 0.15) {
    lines.push("overrides:");

    const overrideCount = 1 + Math.floor(rng() * 3);
    for (let index = 0; index < overrideCount; index += 1) {
      const overrideKey = `beta-audience-${index + 1}`;
      const overrideLength = translationLength(rng);
      lines.push(
        `  - key: ${overrideKey}`,
        "    segments:",
        "      - synthetic-beta-users",
        "    translations:",
        `      en-US: ${yamlString(variedTranslation(`override ${key}`, "en-US", overrideLength))}`,
      );
    }
  } else if (!varianceEnabled && messageIndex % 1000 === 0) {
    lines.push(
      "overrides:",
      "  - key: beta-audience",
      "    segments:",
      "      - synthetic-beta-users",
      "    translations:",
      `      en-US: ${yamlString(`Beta message ${key}`)}`,
    );
  }

  if (varianceEnabled && messageIndex !== 1 && rng() < 0.02) {
    lines.push(
      "examples:",
      "  - description: Variable length synthetic example",
      "    locale: en-US",
      `    rawMessage: ${yamlString(`Example ${key}`)}`,
    );
  }

  return `${lines.join("\n")}\n`;
}

function targetDocuments() {
  return {
    web: [
      "description: Synthetic web target",
      'includeMessages: "*"',
      `locales: ${JSON.stringify(locales)}`,
      "",
    ].join("\n"),
    mobile: [
      "description: Synthetic mobile target",
      "includeMessages:",
      "  - synthetic.message.00*",
      `locales: ${JSON.stringify(locales)}`,
      "context:",
      "  platform: mobile",
      "",
    ].join("\n"),
    internal: [
      "description: Synthetic internal target",
      "excludeMessages: synthetic.message.00*",
      `locales: ${JSON.stringify(locales)}`,
      "",
    ].join("\n"),
    "used-formats": [
      "description: Synthetic target that keeps only formats used by emitted messages",
      'includeMessages: "synthetic.message.000001"',
      "includeOnlyUsedFormats: true",
      `locales: ${JSON.stringify(locales)}`,
      "",
    ].join("\n"),
  };
}

function repeatedTargetAssertions(targetKey) {
  const lines = [`target: ${targetKey}`, "assertions:"];
  const assertionCount = 20;

  for (let index = 0; index < assertionCount; index += 1) {
    for (const locale of locales) {
      lines.push(
        "  - description: Repeated target assertion",
        `    locale: ${locale}`,
        "    expectedToIncludeMessages:",
        "      - synthetic.message.000001",
      );
    }
  }

  return `${lines.join("\n")}\n`;
}

async function writeBatch(files) {
  for (let index = 0; index < files.length; index += concurrency) {
    await Promise.all(
      files.slice(index, index + concurrency).map(async ([filePath, content]) => {
        await mkdir(path.dirname(filePath), { recursive: true });
        await writeFile(filePath, content);
      }),
    );
  }
}

async function generateSet(setName) {
  const setDirectoryPath = path.join(projectDirectoryPath, "sets", setName);
  await rm(setDirectoryPath, { recursive: true, force: true });

  const files = [];

  for (const locale of locales) {
    files.push([path.join(setDirectoryPath, "locales", `${locale}.yml`), localeDocument(locale)]);
  }

  const webTargetTest = repeatedTargetAssertions("web");
  const internalTargetTest = [
    "target: internal",
    "assertions:",
    "  - locale: en-US",
    "    expectedToNotIncludeMessages:",
    "      - synthetic.message.000001",
    "",
  ].join("\n");
  const usedFormatsTargetTest = [
    "target: used-formats",
    "assertions:",
    "  - locale: en-US",
    "    expectedToIncludeMessages:",
    "      - synthetic.message.000001",
    "    expectedFormats:",
    "      number:",
    "        decimal:",
    "          style: decimal",
    "          minimumFractionDigits: 2",
    "      date:",
    "        short:",
    "          dateStyle: short",
    "",
  ].join("\n");

  files.push(
    [
      path.join(setDirectoryPath, "attributes", "cohort.yml"),
      [
        "description: Synthetic cohort",
        "type: string",
        "enum:",
        "  - control",
        "  - beta",
        "",
      ].join("\n"),
    ],
    [
      path.join(setDirectoryPath, "attributes", "platform.yml"),
      "description: Synthetic platform\ntype: string\n",
    ],
    [
      path.join(setDirectoryPath, "segments", "synthetic-beta-users.yml"),
      [
        "description: Synthetic beta users",
        "conditions:",
        "  - attribute: cohort",
        "    operator: equals",
        "    value: beta",
        "",
      ].join("\n"),
    ],
  );

  for (const [targetKey, content] of Object.entries(targetDocuments())) {
    files.push([path.join(setDirectoryPath, "targets", `${targetKey}.yml`), content]);
  }

  files.push(
    [
      path.join(setDirectoryPath, "tests", "messages", "synthetic", "smoke.spec.yml"),
      [
        "message: synthetic.message.000002",
        "assertions:",
        "  - locale: en-US",
        "    target: web",
        "    expectedTranslation: Message 000002 in en-US",
        "  - locale: de-DE",
        "    target: mobile",
        "    expectedTranslation: Message 000002 in de-DE",
        "",
      ].join("\n"),
    ],
    [path.join(setDirectoryPath, "tests", "targets", "web.spec.yml"), webTargetTest],
    [path.join(setDirectoryPath, "tests", "targets", "internal.spec.yml"), internalTargetTest],
    [
      path.join(setDirectoryPath, "tests", "targets", "used-formats.spec.yml"),
      usedFormatsTargetTest,
    ],
  );

  for (let messageIndex = 1; messageIndex <= messages; messageIndex += 1) {
    const messageKey = String(messageIndex).padStart(6, "0");
    files.push([
      path.join(setDirectoryPath, "messages", "synthetic", "message", `${messageKey}.yml`),
      messageDocument(messageIndex),
    ]);
  }

  await writeBatch(files);
  console.log(`Generated ${setName}: ${messages} messages, ${locales.length} locales.`);
}

function runGit(args) {
  execFileSync("git", args, {
    cwd: projectDirectoryPath,
    stdio: "ignore",
  });
}

async function generateSyntheticHistory() {
  await rm(path.join(projectDirectoryPath, ".git"), { recursive: true, force: true });

  if (historyCount === 0) {
    return;
  }

  runGit(["init", "--quiet"]);
  runGit(["config", "user.name", "Messagevisor Synthetic Fixture"]);
  runGit(["config", "user.email", "synthetic@messagevisor.local"]);
  runGit(["add", "--all", "--force", "--", "sets"]);
  runGit(["commit", "--quiet", "-m", "Initial synthetic catalogue"]);

  const fractions = [0.58, 0.45, 0.36, 0.28, 0.2, 0.15, 0.1, 0.08, 0.05];

  for (let revision = 1; revision < historyCount; revision += 1) {
    const setName = setNames[(revision - 1) % setNames.length];
    const fraction = fractions[(revision - 1) % fractions.length];
    const updateCount = Math.max(1, Math.round(messages * fraction));
    const start = (revision * 7919) % messages;
    const files = [];

    for (let offset = 0; offset < updateCount; offset += 1) {
      const messageIndex = ((start + offset) % messages) + 1;
      const messageKey = String(messageIndex).padStart(6, "0");
      files.push([
        path.join(
          projectDirectoryPath,
          "sets",
          setName,
          "messages",
          "synthetic",
          "message",
          `${messageKey}.yml`,
        ),
        messageDocument(messageIndex, revision),
      ]);
    }

    await writeBatch(files);
    runGit(["add", "--all", "--force", "--", "sets"]);
    runGit(["commit", "--quiet", "-m", `Synthetic catalogue revision ${revision}`]);
  }

  console.log(`Generated ${historyCount} synthetic Git commits.`);
}

async function main() {
  // Generation is intentionally reproducible. A smaller follow-up run must
  // not leave files from a previous larger run behind.
  await rm(path.join(projectDirectoryPath, "sets"), { recursive: true, force: true });
  await mkdir(path.join(projectDirectoryPath, "sets"), { recursive: true });
  for (const setName of setNames) {
    await generateSet(setName);
  }
  await generateSyntheticHistory();

  console.log(
    `Generated ${setNames.length} set(s) and ${historyCount} Git commit(s) under ${path.relative(process.cwd(), projectDirectoryPath)}.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
