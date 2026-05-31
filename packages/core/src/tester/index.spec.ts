import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { getProjectConfig } from "../config";
import { Datasource } from "../datasource";
import { testProject } from "./index";

async function writeFile(root: string, relativePath: string, content: string) {
  const filePath = path.join(root, relativePath);
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, content);
}

async function createProject(configContent = "module.exports = {};\n") {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-tester-"));

  await writeFile(root, "messagevisor.config.js", configContent);
  await writeFile(
    root,
    "locales/en.yml",
    [
      "description: English",
      "formats:",
      "  number:",
      "    money:",
      "      style: currency",
      "      currency: USD",
      "      currencyDisplay: symbol",
      "    decimal:",
      "      maximumFractionDigits: 2",
      "  date:",
      "    short:",
      "      year: numeric",
      "      month: numeric",
      "      day: numeric",
      "",
    ].join("\n"),
  );
  await writeFile(
    root,
    "targets/web.yml",
    ["description: Web", "includeMessages:", "  - common*", "locales:", "  - en", ""].join("\n"),
  );
  await writeFile(
    root,
    "messages/common/welcome.yml",
    ["description: Welcome", "translations:", "  en: Welcome", ""].join("\n"),
  );
  await writeFile(
    root,
    "tests/locales/en.spec.yml",
    [
      "locale: en",
      "assertions:",
      "  - expectedFormats:",
      "      number:",
      "        money:",
      "          currency: USD",
      "",
    ].join("\n"),
  );

  return root;
}

describe("testProject", function () {
  it("allows locale expectedFormats to assert a partial nested subset", async function () {
    const root = await createProject();
    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);

    const result = await testProject(projectConfig, datasource, {
      keyPattern: "^locales",
    });

    expect(result.hasError).toEqual(false);
    expect(result.testsCount).toEqual({
      passed: 1,
      failed: 0,
    });
    expect(result.assertionsCount).toEqual({
      passed: 1,
      failed: 0,
    });
  });

  it("supports locale raw-message translation, ad hoc formats, and target-aware format overrides", async function () {
    const icuModulePath = path.join(
      path.resolve(__dirname, "../../../.."),
      "packages/module-icu/src/index.ts",
    );
    const root = await createProject(
      [
        `const { createICUModule } = require(${JSON.stringify(icuModulePath)});`,
        "module.exports = {",
        "  modules: [createICUModule()],",
        "};",
        "",
      ].join("\n"),
    );

    await writeFile(
      root,
      "targets/preview.yml",
      [
        "description: Preview",
        "locales:",
        "  - en",
        "formats:",
        "  en:",
        "    number:",
        "      money:",
        "        style: currency",
        "        currency: GBP",
        "",
      ].join("\n"),
    );
    await writeFile(
      root,
      "tests/locales/en.spec.yml",
      [
        "locale: en",
        "assertions:",
        "  - description: Base locale formats and translation",
        "    expectedFormats:",
        "      number:",
        "        money:",
        "          currency: USD",
        "    rawMessage: '{amount, number, money}'",
        "    values:",
        "      amount: 12",
        "    expectedTranslation: '$12.00'",
        "  - description: Ad hoc formats are merged for translation",
        "    rawMessage: '{value, number, signed}'",
        "    values:",
        "      value: 7",
        "    formats:",
        "      number:",
        "        signed:",
        "          signDisplay: always",
        "          maximumFractionDigits: 0",
        "    expectedTranslation: '+7'",
        "  - description: Target overrides affect locale formats and translation",
        "    target: preview",
        "    expectedFormats:",
        "      number:",
        "        money:",
        "          currency: GBP",
        "    rawMessage: '{amount, number, money}'",
        "    values:",
        "      amount: 12",
        "    expectedTranslation: '£12.00'",
        "  - matrix:",
        "      name: [Ada, Sam]",
        "    description: Greeting ${{ name }}",
        "    rawMessage: 'Hello {name}'",
        "    values:",
        "      name: ${{ name }}",
        "    expectedTranslation: 'Hello ${{ name }}'",
        "",
      ].join("\n"),
    );

    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const result = await testProject(projectConfig, datasource, {
      keyPattern: "^locales",
    });

    expect(result.hasError).toEqual(false);
    expect(result.testsCount).toEqual({
      passed: 1,
      failed: 0,
    });
    expect(result.assertionsCount).toEqual({
      passed: 5,
      failed: 0,
    });
  });

  it("supports target raw-message and message translation through built target datafiles", async function () {
    const icuModulePath = path.join(
      path.resolve(__dirname, "../../../.."),
      "packages/module-icu/src/index.ts",
    );
    const interpolationModulePath = path.join(
      path.resolve(__dirname, "../../../.."),
      "packages/module-interpolation/src/index.ts",
    );
    const root = await createProject(
      [
        `const { createICUModule } = require(${JSON.stringify(icuModulePath)});`,
        `const { createInterpolationModule } = require(${JSON.stringify(interpolationModulePath)});`,
        "module.exports = {",
        "  modules: [createInterpolationModule(), createICUModule()],",
        "};",
        "",
      ].join("\n"),
    );

    await writeFile(
      root,
      "targets/mobile.yml",
      [
        "description: Mobile",
        "includeMessages:",
        "  - common.welcome",
        "locales:",
        "  - en",
        "context:",
        "  platform: mobile",
        "",
      ].join("\n"),
    );
    await writeFile(
      root,
      "messages/common/welcome.yml",
      [
        "description: Welcome",
        "translations:",
        "  en: Hello {name}",
        "overrides:",
        "  - key: mobile",
        "    conditions:",
        "      attribute: platform",
        "      operator: equals",
        "      value: mobile",
        "    translations:",
        "      en: Hello mobile {name}",
        "",
      ].join("\n"),
    );
    await writeFile(
      root,
      "messages/common/hidden.yml",
      ["description: Hidden", "translations:", "  en: Hidden target message", ""].join("\n"),
    );
    await writeFile(
      root,
      "tests/targets/mobile.spec.yml",
      [
        "target: mobile",
        "assertions:",
        "  - description: Target structure and raw translation",
        "    locale: en",
        "    expectedToIncludeMessages:",
        "      - common.welcome",
        "    expectedToNotIncludeMessages:",
        "      - common.hidden",
        "    expectedFormats:",
        "      number:",
        "        money:",
        "          currency: USD",
        "    rawMessage: 'Total: {amount, number, money}'",
        "    values:",
        "      amount: 12",
        "    expectedTranslation: 'Total: $12.00'",
        "  - description: Target message translation uses built target datafile",
        "    locale: en",
        "    message: common.welcome",
        "    values:",
        "      name: Ada",
        "    context:",
        "      platform: mobile",
        "    expectedTranslation: Hello mobile Ada",
        "  - description: Missing translation follows normal SDK behavior",
        "    locale: en",
        "    message: common.hidden",
        "    expectedTranslation: common.hidden",
        "  - matrix:",
        "      amount: [7, 8]",
        "    description: Matrix target raw ${{ amount }}",
        "    locale: en",
        "    rawMessage: 'Amount: {amount, number, money}'",
        "    values:",
        "      amount: ${{ amount }}",
        "    expectedTranslation: 'Amount: $${{ amount }}.00'",
        "",
      ].join("\n"),
    );

    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const result = await testProject(projectConfig, datasource, {
      keyPattern: "^targets",
    });

    expect(result.hasError).toEqual(false);
    expect(result.testsCount).toEqual({
      passed: 1,
      failed: 0,
    });
    expect(result.assertionsCount).toEqual({
      passed: 5,
      failed: 0,
    });
  });

  it("keeps raw ICU-looking message text when project config does not register modules", async function () {
    const root = await createProject();

    await writeFile(
      root,
      "messages/common/welcome.yml",
      ["description: Welcome", "translations:", "  en: Welcome {name}", ""].join("\n"),
    );
    await writeFile(
      root,
      "tests/messages/common/welcome.spec.yml",
      [
        "message: common.welcome",
        "assertions:",
        "  - locale: en",
        "    target: web",
        "    values:",
        "      name: Ada",
        "    expectedTranslation: Welcome {name}",
        "",
      ].join("\n"),
    );

    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const result = await testProject(projectConfig, datasource, {
      keyPattern: "^messages",
    });

    expect(projectConfig.modules).toEqual([]);
    expect(result.hasError).toEqual(false);
    expect(result.assertionsCount).toEqual({
      passed: 1,
      failed: 0,
    });
  });

  it("uses withFlags and withVariations for feature and experiment assertions", async function () {
    const root = await createProject();

    await writeFile(
      root,
      "messages/common/welcome.yml",
      [
        "description: Welcome",
        "translations:",
        "  en: Default welcome",
        "overrides:",
        "  - key: feature",
        "    conditions:",
        "      feature: new-homepage",
        "      operator: isEnabled",
        "    translations:",
        "      en: Feature welcome",
        "  - key: variation",
        "    conditions:",
        "      experiment: homepage-copy",
        "      operator: hasVariation",
        "      value: bold",
        "    translations:",
        "      en: Bold welcome",
        "",
      ].join("\n"),
    );
    await writeFile(
      root,
      "tests/messages/common/welcome.spec.yml",
      [
        "message: common.welcome",
        "assertions:",
        "  - locale: en",
        "    target: web",
        "    expectedTranslation: Default welcome",
        "  - locale: en",
        "    target: web",
        "    withFlags:",
        "      new-homepage: true",
        "    expectedTranslation: Feature welcome",
        "  - locale: en",
        "    target: web",
        "    withVariations:",
        "      homepage-copy: bold",
        "    expectedTranslation: Bold welcome",
        "",
      ].join("\n"),
    );

    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const result = await testProject(projectConfig, datasource, {
      keyPattern: "^messages",
    });

    expect(result.hasError).toEqual(false);
    expect(result.assertionsCount).toEqual({
      passed: 3,
      failed: 0,
    });
  });

  it("expands matrix assertions across message, segment, locale, and target tests", async function () {
    const interpolationModulePath = path.join(
      path.resolve(__dirname, "../../../.."),
      "packages/module-interpolation/src/index.ts",
    );
    const root = await createProject(
      [
        `const { createInterpolationModule } = require(${JSON.stringify(interpolationModulePath)});`,
        "module.exports = {",
        "  modules: [createInterpolationModule()],",
        "};",
        "",
      ].join("\n"),
    );

    await writeFile(
      root,
      "messages/common/welcome.yml",
      [
        "description: Welcome",
        "translations:",
        "  en: Hello {name}",
        "overrides:",
        "  - key: adult",
        "    segments: adult",
        "    translations:",
        "      en: Hello adult",
        "",
      ].join("\n"),
    );
    await writeFile(
      root,
      "segments/adult.yml",
      [
        "description: Adult",
        "conditions:",
        "  - attribute: age",
        "    operator: greaterThanOrEquals",
        "    value: 18",
        "",
      ].join("\n"),
    );
    await writeFile(
      root,
      "tests/messages/common/welcome.spec.yml",
      [
        "message: common.welcome",
        "assertions:",
        "  - matrix:",
        "      name: [Ada, Sam]",
        "    locale: en",
        "    target: web",
        "    description: Greeting ${{ name }}",
        "    values:",
        "      name: ${{ name }}",
        "    expectedTranslation: Hello ${{ name }}",
        "  - matrix:",
        "      age: [21, 22]",
        "      expected: [Hello adult]",
        "    locale: en",
        "    target: web",
        "    description: Adult check ${{ age }}",
        "    context:",
        "      age: ${{ age }}",
        "    expectedTranslation: ${{ expected }}",
        "",
      ].join("\n"),
    );
    await writeFile(
      root,
      "tests/segments/adult.spec.yml",
      [
        "segment: adult",
        "assertions:",
        "  - matrix:",
        "      age: [21, 22]",
        "      expected: [true]",
        "    description: Segment ${{ age }}",
        "    segment: adult",
        "    context:",
        "      age: ${{ age }}",
        "    expectedToMatch: ${{ expected }}",
        "",
      ].join("\n"),
    );
    await writeFile(
      root,
      "tests/locales/en.spec.yml",
      [
        "locale: en",
        "assertions:",
        "  - matrix:",
        "      label: [primary, secondary]",
        "      currency: [USD]",
        "    description: Locale ${{ label }}",
        "    expectedFormats:",
        "      number:",
        "        money:",
        "          currency: ${{ currency }}",
        "",
      ].join("\n"),
    );
    await writeFile(
      root,
      "tests/targets/web.spec.yml",
      [
        "target: web",
        "assertions:",
        "  - matrix:",
        "      label: [web-a, web-b]",
        "      currency: [USD]",
        "    description: Target ${{ label }}",
        "    locale: en",
        "    expectedFormats:",
        "      number:",
        "        money:",
        "          currency: ${{ currency }}",
        "",
      ].join("\n"),
    );

    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const result = await testProject(projectConfig, datasource);

    expect(result.hasError).toEqual(false);
    expect(result.assertionsCount).toEqual({
      passed: 10,
      failed: 0,
    });
  });

  it("filters expanded matrix assertions by resolved description", async function () {
    const root = await createProject();

    await writeFile(
      root,
      "tests/segments/adult.spec.yml",
      [
        "segment: adult",
        "assertions:",
        "  - matrix:",
        "      city: [Amsterdam, Rotterdam]",
        "    description: Segment ${{ city }}",
        "    segment: adult",
        "    context:",
        "      age: 21",
        "    expectedToMatch: true",
        "",
      ].join("\n"),
    );
    await writeFile(
      root,
      "segments/adult.yml",
      [
        "description: Adult",
        "conditions:",
        "  - attribute: age",
        "    operator: greaterThanOrEquals",
        "    value: 18",
        "",
      ].join("\n"),
    );

    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const result = await testProject(projectConfig, datasource, {
      keyPattern: "^segments",
      assertionPattern: "Rotterdam",
    });

    expect(result.hasError).toEqual(false);
    expect(result.assertionsCount).toEqual({
      passed: 1,
      failed: 0,
    });
  });
});
