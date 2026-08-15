import { mkdir, rm, writeFile } from "node:fs/promises";
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

function getNumberOption(name, fallback) {
  const argument = process.argv.find((value) => value.startsWith(`--${name}=`));
  const value = argument ? Number(argument.slice(name.length + 3)) : fallback;

  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`--${name} must be a positive integer.`);
  }

  return value;
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
    "",
  ].join("\n");
}

function messageDocument(messageIndex) {
  const key = String(messageIndex).padStart(6, "0");
  const lines = [`description: Synthetic message ${key}`, "translations:"];

  for (const locale of locales) {
    lines.push(`  ${locale}: ${yamlString(`Message ${key} in ${locale}`)}`);
  }

  if (messageIndex % 1000 === 0) {
    lines.push(
      "overrides:",
      "  - key: beta-audience",
      "    segments:",
      "      - synthetic-beta-users",
      "    translations:",
      `      en-US: ${yamlString(`Beta message ${key}`)}`,
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
  };
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

  const targetTest =
    messages >= 10000
      ? [
          "target: internal",
          "assertions:",
          "  - locale: en-US",
          "    expectedToIncludeMessages:",
          "      - synthetic.message.010000",
          "    expectedToNotIncludeMessages:",
          "      - synthetic.message.000001",
          "",
        ]
      : [
          "target: internal",
          "assertions:",
          "  - locale: en-US",
          "    expectedToNotIncludeMessages:",
          "      - synthetic.message.000001",
          "",
        ];

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
        "message: synthetic.message.000001",
        "assertions:",
        "  - locale: en-US",
        "    target: web",
        "    expectedTranslation: Message 000001 in en-US",
        "  - locale: de-DE",
        "    target: mobile",
        "    expectedTranslation: Message 000001 in de-DE",
        "",
      ].join("\n"),
    ],
    [path.join(setDirectoryPath, "tests", "targets", "smoke.spec.yml"), targetTest.join("\n")],
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

async function main() {
  await mkdir(path.join(projectDirectoryPath, "sets"), { recursive: true });
  for (const setName of setNames) {
    await generateSet(setName);
  }

  console.log(
    `Generated ${setNames.length} set(s) under ${path.relative(process.cwd(), projectDirectoryPath)}.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
