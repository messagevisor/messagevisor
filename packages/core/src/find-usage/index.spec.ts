import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { getProjectConfig } from "../config";
import { Datasource } from "../datasource";
import { findUsage } from "./index";

async function write(root: string, relative: string, content: string) {
  const file = path.join(root, relative);
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  await fs.promises.writeFile(file, content);
}

describe("find usage", function () {
  let root: string;
  let datasource: Datasource;

  beforeEach(async function () {
    root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-usage-"));
    await write(root, "messagevisor.config.js", "module.exports = {};\n");
    await write(root, "attributes/plan.yml", "type: string\n");
    await write(
      root,
      "locales/en.yml",
      "formats:\n  number:\n    money:\n      style: currency\n    money.compact:\n      notation: compact\n",
    );
    await write(root, "locales/en-GB.yml", "inheritTranslationsFrom: en\ninheritFormatsFrom: en\n");
    await write(
      root,
      "segments/premium.yml",
      "conditions:\n  attribute: plan\n  operator: equals\n  value: pro\n",
    );
    await write(
      root,
      "messages/checkout/title.yml",
      "translations:\n  en: 'Total {amount, number, money} {small, number, money.compact}'\noverrides:\n  - key: premium\n    segments: premium\n    conditions:\n      attribute: plan\n      operator: equals\n      value: pro\n    translations:\n      en: Premium\n",
    );
    await write(root, "targets/web.yml", "includeMessages: checkout*\nlocales: [en, en-GB]\n");
    await write(
      root,
      "tests/messages/checkout/title.spec.yml",
      "message: checkout.title\nassertions:\n  - locale: en\n    expectedTranslation: Total\n",
    );
    await write(
      root,
      "tests/targets/web.spec.yml",
      [
        "target: web",
        "assertions:",
        "  - locale: en",
        "    expectedToIncludeMessages: [checkout.title]",
        "    rawMessage: '{amount, number, money}'",
        "    expectedTranslation: '1'",
        "",
      ].join("\n"),
    );
    datasource = new Datasource(getProjectConfig(root), root);
  });

  afterEach(async function () {
    await fs.promises.rm(root, { recursive: true, force: true });
  });

  it("finds message, segment, attribute, locale, and named-format relationships", async function () {
    await expect(findUsage(datasource, { message: "checkout.title" })).resolves.toEqual([
      { type: "target", key: "web", path: "messages" },
      { type: "test", key: "messages.checkout.title", path: "message" },
      { type: "test", key: "targets.web", path: "assertions.0.message" },
    ]);
    await expect(findUsage(datasource, { segment: "premium" })).resolves.toEqual([
      { type: "message", key: "checkout.title", path: "overrides.0.segments" },
    ]);
    expect(await findUsage(datasource, { attribute: "plan" })).toEqual(
      expect.arrayContaining([
        { type: "message", key: "checkout.title", path: "overrides.0.conditions" },
        { type: "segment", key: "premium", path: "conditions" },
      ]),
    );
    expect(await findUsage(datasource, { locale: "en" })).toEqual(
      expect.arrayContaining([
        { type: "locale", key: "en-GB", path: "inheritance" },
        { type: "message", key: "checkout.title", path: "translations.en" },
        { type: "test", key: "messages.checkout.title", path: "assertions.0.locale" },
        { type: "test", key: "targets.web", path: "assertions.0.locale" },
      ]),
    );
    expect(await findUsage(datasource, { format: "number.money" })).toEqual(
      expect.arrayContaining([
        { type: "locale", key: "en", path: "formats.number.money" },
        { type: "message", key: "checkout.title", path: "translations" },
        { type: "test", key: "targets.web", path: "assertions.0.rawMessage" },
      ]),
    );
    expect(await findUsage(datasource, { format: "number.money.compact" })).toEqual(
      expect.arrayContaining([
        { type: "locale", key: "en", path: "formats.number.money.compact" },
        { type: "message", key: "checkout.title", path: "translations" },
      ]),
    );
  });

  it("rejects unknown entities and malformed format queries", async function () {
    await expect(findUsage(datasource, { message: "missing" })).rejects.toThrow(
      'Unknown message "missing".',
    );
    await expect(findUsage(datasource, { attribute: "missing.child" })).rejects.toThrow(
      'Unknown attribute "missing".',
    );
    await expect(findUsage(datasource, { format: "money" })).rejects.toThrow(
      'Invalid format "money".',
    );
  });
});
