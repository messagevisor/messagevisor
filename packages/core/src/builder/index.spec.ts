import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { Datasource } from "../datasource";
import { getProjectConfig } from "../config";
import { buildProject, buildProjectSets, mergeFormats } from "./index";

async function writeFile(root: string, relativePath: string, content: string) {
  const filePath = path.join(root, relativePath);
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, content);
}

async function createProject() {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-"));

  await writeFile(root, "messagevisor.config.js", "module.exports = {};\n");
  await writeFile(
    root,
    "locales/en.yml",
    [
      "description: English",
      "formats:",
      "  number:",
      "    decimal:",
      "      maximumFractionDigits: 2",
      "    money:",
      "      style: currency",
      "      currency: USD",
      "      currencyDisplay: symbol",
      "",
    ].join("\n"),
  );
  await writeFile(
    root,
    "locales/en-US.yml",
    "description: English US\ndirection: ltr\ninheritFormatsFrom: en\ninheritTranslationsFrom: en\n",
  );
  await writeFile(
    root,
    "targets/web.yml",
    [
      "description: Web",
      "includeMessages:",
      "  - auth*",
      "locales:",
      "  - en-US",
      "formats:",
      "  en-US:",
      "    number:",
      "      money:",
      "        currency: GBP",
      "",
    ].join("\n"),
  );
  await writeFile(root, "attributes/platform.yml", "description: Platform\ntype: string\n");
  await writeFile(
    root,
    "segments/platform-web.yml",
    "description: Web\npromotable: false\nconditions:\n  - attribute: platform\n    operator: equals\n    value: web\n",
  );
  await writeFile(
    root,
    "messages/auth/signin.yml",
    "description: Sign in\npromotable: false\ntranslations:\n  en: Sign in\n  en-US: Sign in now\noverrides:\n  - key: platform-web\n    segments: platform-web\n    translations:\n      en-US: Sign in on web\n",
  );

  return root;
}

describe("buildProject", function () {
  it("merges format presets by type and style while replacing declared styles", function () {
    const formats = mergeFormats(
      {
        number: {
          decimal: {
            maximumFractionDigits: 2,
          },
          money: {
            style: "currency",
            currency: "USD",
            currencyDisplay: "symbol",
            minimumFractionDigits: 2,
          },
        },
        date: {
          short: {
            month: "numeric",
            day: "numeric",
          },
          long: {
            year: "numeric",
            month: "long",
            day: "numeric",
          },
        },
      },
      {
        number: {
          money: {
            currency: "EUR",
          },
        },
        date: {
          long: {
            hour: "numeric",
            minute: "2-digit",
          },
        },
      } as any,
    );

    expect(formats?.number?.decimal).toEqual({
      maximumFractionDigits: 2,
    });
    expect(formats?.number?.money).toEqual({
      currency: "EUR",
    });
    expect(formats?.date?.short).toEqual({
      month: "numeric",
      day: "numeric",
    });
    expect(formats?.date?.long).toEqual({
      hour: "numeric",
      minute: "2-digit",
    });
  });

  it("builds target-specific locale datafiles and revision", async function () {
    const root = await createProject();
    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);

    const datafiles = await buildProject(projectConfig, datasource);

    expect(datafiles).toHaveLength(1);
    expect(datafiles[0].target).toEqual("web");
    expect(datafiles[0].locale).toEqual("en-US");
    expect(datafiles[0].direction).toEqual("ltr");
    expect(datafiles[0].translations["auth.signin"]).toEqual("Sign in now");
    expect(datafiles[0].messages["auth.signin"].overrides?.[0].translation).toEqual(
      "Sign in on web",
    );
    expect(datafiles[0].formats?.number?.decimal).toEqual({ maximumFractionDigits: 2 });
    expect(datafiles[0].formats?.number?.money).toEqual({ currency: "GBP" });
    expect(datafiles[0].segments["platform-web"].key).toBeUndefined();
    expect(datafiles[0].segments["platform-web"].description).toBeUndefined();
    expect((datafiles[0].segments["platform-web"] as any).promotable).toBeUndefined();
    expect((datafiles[0].messages["auth.signin"] as any).description).toBeUndefined();
    expect((datafiles[0].messages["auth.signin"] as any).promotable).toBeUndefined();
    expect(await datasource.readRevision()).toEqual("1");

    const written = JSON.parse(
      await fs.promises.readFile(path.join(root, "datafiles/messagevisor-web-en-US.json"), "utf8"),
    );
    expect(written.direction).toEqual("ltr");
    expect(written.translations["auth.signin"]).toEqual("Sign in now");
  });

  it("writes nested target datafiles under matching subdirectories", async function () {
    const root = await createProject();
    await writeFile(
      root,
      "targets/apps/web.yml",
      "description: App Web\nincludeMessages:\n  - auth*\nlocales:\n  - en-US\n",
    );
    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const localeBuiltEvents: string[] = [];

    const datafiles = await buildProject(projectConfig, datasource, {
      target: "apps.web",
      onProgress(event) {
        if (event.type === "localeBuilt" && event.filePath) {
          localeBuiltEvents.push(path.relative(root, event.filePath));
        }
      },
    });

    expect(datafiles).toHaveLength(1);
    expect(datafiles[0].target).toEqual("apps.web");
    expect(datafiles[0].translations["auth.signin"]).toEqual("Sign in now");
    expect(localeBuiltEvents).toEqual(["datafiles/apps/messagevisor-web-en-US.json"]);

    const writtenPath = path.join(root, "datafiles/apps/messagevisor-web-en-US.json");
    const written = JSON.parse(await fs.promises.readFile(writtenPath, "utf8"));
    expect(written.target).toEqual("apps.web");
    expect((await datasource.readDatafile("apps.web", "en-US")).target).toEqual("apps.web");
  });

  it("builds independent datafiles and revisions for sets", async function () {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-"));

    await writeFile(root, "messagevisor.config.js", "module.exports = { sets: true };\n");

    for (const set of ["storefront", "admin"]) {
      await writeFile(root, `sets/${set}/locales/en.yml`, "description: English\n");
      await writeFile(
        root,
        `sets/${set}/locales/en-US.yml`,
        "description: English US\ninheritTranslationsFrom: en\n",
      );
      await writeFile(
        root,
        `sets/${set}/targets/web.yml`,
        "description: Web\nincludeMessages:\n  - common*\nlocales:\n  - en-US\n",
      );
      await writeFile(
        root,
        `sets/${set}/messages/common/welcome.yml`,
        `description: Welcome\ntranslations:\n  en: ${set} welcome\n`,
      );
    }

    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const datafiles = await buildProjectSets(projectConfig, datasource);

    expect(datafiles).toHaveLength(2);
    expect(datafiles.map((datafile) => datafile.translations["common.welcome"]).sort()).toEqual([
      "admin welcome",
      "storefront welcome",
    ]);
    expect(await datasource.readRevision()).toEqual("1");
    expect(await datasource.forSet("storefront").readRevision()).toEqual("1");
    expect(await datasource.forSet("admin").readRevision()).toEqual("1");
    expect(
      await fs.promises.readFile(path.join(root, ".messagevisor/sets/storefront/REVISION"), "utf8"),
    ).toEqual("1");
    expect(
      await fs.promises.readFile(path.join(root, ".messagevisor/sets/admin/REVISION"), "utf8"),
    ).toEqual("1");

    const selectedDatafiles = await buildProjectSets(projectConfig, datasource, {
      set: "admin",
    });

    expect(selectedDatafiles).toHaveLength(1);
    expect(selectedDatafiles[0].translations["common.welcome"]).toEqual("admin welcome");
    expect(await datasource.readRevision()).toEqual("2");
    expect(await datasource.forSet("admin").readRevision()).toEqual("2");
    expect(await datasource.forSet("storefront").readRevision()).toEqual("1");

    await buildProjectSets(projectConfig, datasource, {
      set: "storefront",
      noStateFiles: true,
    });

    expect(await datasource.readRevision()).toEqual("2");
    expect(await datasource.forSet("admin").readRevision()).toEqual("2");
    expect(await datasource.forSet("storefront").readRevision()).toEqual("1");

    const storefront = JSON.parse(
      await fs.promises.readFile(
        path.join(root, "datafiles/storefront/messagevisor-web-en-US.json"),
        "utf8",
      ),
    );
    const admin = JSON.parse(
      await fs.promises.readFile(
        path.join(root, "datafiles/admin/messagevisor-web-en-US.json"),
        "utf8",
      ),
    );

    expect(storefront.translations["common.welcome"]).toEqual("storefront welcome");
    expect(admin.translations["common.welcome"]).toEqual("admin welcome");
  });

  it("reports the starting revision before the build and latest revision at completion", async function () {
    const root = await createProject();
    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const events: any[] = [];

    await buildProject(projectConfig, datasource, {
      onProgress: (event) => events.push(event),
    });

    expect(events[0]).toEqual({
      type: "start",
      previousRevision: "0",
      revision: "1",
      targets: ["web"],
    });
    expect(events[events.length - 1]).toMatchObject({
      type: "complete",
      revision: "1",
    });
  });

  it("reports datafile size when requested", async function () {
    const root = await createProject();
    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const events: any[] = [];

    await buildProject(projectConfig, datasource, {
      noStateFiles: true,
      showSize: true,
      onProgress: (event) => events.push(event),
    });

    const localeBuiltEvent = events.find((event) => event.type === "localeBuilt");

    expect(localeBuiltEvent.sizeInBytes).toBeGreaterThan(0);
  });

  it("uses configured namespace character for nested entity keys", async function () {
    const root = await createProject();
    await writeFile(
      root,
      "messagevisor.config.js",
      'module.exports = { namespaceCharacter: ":", exportOverrideKeySeparator: "#" };\n',
    );

    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const datafiles = await buildProject(projectConfig, datasource, {
      target: "web",
      locale: "en-US",
      noStateFiles: true,
    });

    expect(datafiles[0].translations["auth:signin"]).toEqual("Sign in now");
    expect(datafiles[0].messages["auth:signin"].overrides?.[0].translation).toEqual(
      "Sign in on web",
    );
  });

  it("rejects entity path names containing the namespace character", async function () {
    const root = await createProject();
    await writeFile(
      root,
      "messages/auth.signout.yml",
      "description: Sign out\ntranslations:\n  en: Sign out\n",
    );

    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);

    await expect(datasource.listMessages()).rejects.toThrow(
      'namespaceCharacter "." is not allowed in directory or file names',
    );
  });

  it("omits message metadata entries when there is no meaningful metadata", async function () {
    const root = await createProject();
    await writeFile(
      root,
      "messages/auth/signout.yml",
      "description: Sign out\ntranslations:\n  en: Sign out\n",
    );

    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const datafiles = await buildProject(projectConfig, datasource, {
      target: "web",
      locale: "en-US",
      noStateFiles: true,
    });

    expect(datafiles[0].translations["auth.signout"]).toEqual("Sign out");
    expect(datafiles[0].messages["auth.signout"]).toBeUndefined();
  });

  it("includes message metadata entries when meta is present", async function () {
    const root = await createProject();
    await writeFile(
      root,
      "messages/auth/signout.yml",
      [
        "description: Sign out",
        "meta:",
        "  tags:",
        "    - auth",
        "    - exit",
        "  analytics:",
        "    event: signout_click",
        "translations:",
        "  en: Sign out",
        "",
      ].join("\n"),
    );

    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const datafiles = await buildProject(projectConfig, datasource, {
      target: "web",
      locale: "en-US",
      noStateFiles: true,
    });

    expect(datafiles[0].translations["auth.signout"]).toEqual("Sign out");
    expect(datafiles[0].messages["auth.signout"]).toEqual({
      meta: {
        tags: ["auth", "exit"],
        analytics: {
          event: "signout_click",
        },
      },
    });
  });

  it("includes non-archived messages regardless of any former published concept", async function () {
    const root = await createProject();
    await writeFile(
      root,
      "messages/auth/available.yml",
      "description: Available\ntranslations:\n  en: Available\n",
    );
    await writeFile(
      root,
      "messages/auth/also-available.yml",
      "description: Also available\ntranslations:\n  en: Also available\n",
    );

    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const datafiles = await buildProject(projectConfig, datasource, {
      target: "web",
      locale: "en-US",
      noStateFiles: true,
    });

    expect(datafiles[0].translations["auth.available"]).toEqual("Available");
    expect(datafiles[0].translations["auth.also-available"]).toEqual("Also available");
  });

  it("only includes segments referenced by resolved message overrides", async function () {
    const root = await createProject();
    await writeFile(
      root,
      "segments/platform-ios.yml",
      "description: iOS\nconditions:\n  - attribute: platform\n    operator: equals\n    value: ios\n",
    );
    await writeFile(
      root,
      "segments/unused.yml",
      "description: Unused\nconditions:\n  - attribute: platform\n    operator: equals\n    value: unused\n",
    );
    await writeFile(
      root,
      "messages/auth/install.yml",
      "description: Install\ntranslations:\n  en: Install\n  en-US: Install now\noverrides:\n  - key: platform-web\n    segments:\n      or:\n        - platform-web\n        - not:\n            - platform-ios\n    translations:\n      en-US: Install on this device\n",
    );
    await writeFile(
      root,
      "messages/auth/locale-only.yml",
      "description: Locale only\ntranslations:\n  en: Locale only\noverrides:\n  - key: platform-web\n    segments: unused\n    translations:\n      nl: Alleen Nederlands\n",
    );

    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const datafiles = await buildProject(projectConfig, datasource, {
      target: "web",
      locale: "en-US",
      noStateFiles: true,
    });

    expect(Object.keys(datafiles[0].segments).sort()).toEqual(["platform-ios", "platform-web"]);
  });

  it("stringifies datafile conditions and segment groups by default", async function () {
    const root = await createProject();
    await writeFile(
      root,
      "segments/platform-ios.yml",
      "description: iOS\nconditions:\n  - attribute: platform\n    operator: equals\n    value: ios\n",
    );
    await writeFile(
      root,
      "messages/auth/install.yml",
      [
        "description: Install",
        "translations:",
        "  en: Install",
        "  en-US: Install now",
        "overrides:",
        "  - key: audience",
        "    segments:",
        "      or:",
        "        - platform-web",
        "        - not:",
        "            - platform-ios",
        "    translations:",
        "      en-US: Install on this device",
        "  - key: plan",
        "    conditions:",
        "      - attribute: plan",
        "        operator: equals",
        "        value: pro",
        "      - attribute: region",
        "        operator: equals",
        "        value: EU",
        "    translations:",
        "      en-US: Install for Pro EU",
        "  - key: everyone",
        '    conditions: "*"',
        '    segments: "*"',
        "    translations:",
        "      en-US: Install for everyone",
        "",
      ].join("\n"),
    );

    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const datafiles = await buildProject(projectConfig, datasource, {
      target: "web",
      locale: "en-US",
      noStateFiles: true,
    });
    const datafile = datafiles[0];

    expect(datafile.segments["platform-web"].conditions).toEqual(
      JSON.stringify({ attribute: "platform", operator: "equals", value: "web" }),
    );
    expect(datafile.segments["platform-ios"].conditions).toEqual(
      JSON.stringify({ attribute: "platform", operator: "equals", value: "ios" }),
    );
    expect(datafile.messages["auth.install"].overrides).toEqual([
      {
        key: "audience",
        segments: JSON.stringify({
          or: ["platform-web", { not: ["platform-ios"] }],
        }),
        translation: "Install on this device",
      },
      {
        key: "plan",
        conditions: JSON.stringify([
          { attribute: "plan", operator: "equals", value: "pro" },
          { attribute: "region", operator: "equals", value: "EU" },
        ]),
        translation: "Install for Pro EU",
      },
      {
        key: "everyone",
        conditions: "*",
        segments: "*",
        translation: "Install for everyone",
      },
    ]);
  });

  it("preserves structured datafile conditions and segment groups when target stringify is disabled", async function () {
    const root = await createProject();
    await writeFile(
      root,
      "targets/web.yml",
      "description: Web\nincludeMessages:\n  - auth*\nlocales:\n  - en-US\nstringify: false\n",
    );
    await writeFile(
      root,
      "segments/platform-ios.yml",
      "description: iOS\nconditions:\n  - attribute: platform\n    operator: equals\n    value: ios\n",
    );
    await writeFile(
      root,
      "messages/auth/install.yml",
      [
        "description: Install",
        "translations:",
        "  en: Install",
        "  en-US: Install now",
        "overrides:",
        "  - key: audience",
        "    segments:",
        "      or:",
        "        - platform-web",
        "        - platform-ios",
        "    translations:",
        "      en-US: Install on this device",
        "  - key: plan",
        "    conditions:",
        "      attribute: plan",
        "      operator: equals",
        "      value: pro",
        "    translations:",
        "      en-US: Install for Pro",
        "",
      ].join("\n"),
    );

    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const datafiles = await buildProject(projectConfig, datasource, {
      target: "web",
      locale: "en-US",
      noStateFiles: true,
    });
    const datafile = datafiles[0];

    expect(datafile.segments["platform-web"].conditions).toEqual({
      attribute: "platform",
      operator: "equals",
      value: "web",
    });
    expect(datafile.messages["auth.install"].overrides).toEqual([
      {
        key: "audience",
        segments: {
          or: ["platform-web", "platform-ios"],
        },
        translation: "Install on this device",
      },
      {
        key: "plan",
        conditions: { attribute: "plan", operator: "equals", value: "pro" },
        translation: "Install for Pro",
      },
    ]);
  });

  it("applies target-level stringify independently across targets", async function () {
    const root = await createProject();
    await writeFile(
      root,
      "targets/structured.yml",
      "description: Structured\nincludeMessages:\n  - auth*\nlocales:\n  - en-US\nstringify: false\n",
    );
    await writeFile(
      root,
      "messages/auth/install.yml",
      [
        "description: Install",
        "translations:",
        "  en: Install",
        "  en-US: Install now",
        "overrides:",
        "  - key: plan",
        "    conditions:",
        "      attribute: plan",
        "      operator: equals",
        "      value: pro",
        "    translations:",
        "      en-US: Install for Pro",
        "",
      ].join("\n"),
    );

    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const datafiles = await buildProject(projectConfig, datasource, {
      locale: "en-US",
      noStateFiles: true,
    });
    const compact = datafiles.find((datafile) => datafile.target === "web");
    const structured = datafiles.find((datafile) => datafile.target === "structured");

    expect(compact?.messages["auth.install"].overrides?.[0].conditions).toEqual(
      JSON.stringify({ attribute: "plan", operator: "equals", value: "pro" }),
    );
    expect(structured?.messages["auth.install"].overrides?.[0].conditions).toEqual({
      attribute: "plan",
      operator: "equals",
      value: "pro",
    });
  });

  it("writes pretty datafiles for targets with pretty enabled", async function () {
    const root = await createProject();
    await writeFile(
      root,
      "targets/web.yml",
      "description: Web\nincludeMessages:\n  - auth*\nlocales:\n  - en-US\npretty: true\n",
    );

    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);

    await buildProject(projectConfig, datasource, {
      target: "web",
      locale: "en-US",
      noStateFiles: true,
    });

    const content = await fs.promises.readFile(
      path.join(root, "datafiles/messagevisor-web-en-US.json"),
      "utf8",
    );

    expect(content.startsWith("{\n")).toEqual(true);
    expect(content).toContain('  "schemaVersion":');
  });

  it("uses target-level pretty for JSON output and allows CLI pretty to force formatting", async function () {
    const root = await createProject();
    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      await buildProject(projectConfig, datasource, {
        target: "web",
        locale: "en-US",
        noStateFiles: true,
        json: true,
      });

      expect(logSpy.mock.calls[0][0]).not.toContain("\n");

      await writeFile(
        root,
        "targets/web.yml",
        "description: Web\nincludeMessages:\n  - auth*\nlocales:\n  - en-US\npretty: true\n",
      );

      await buildProject(projectConfig, datasource, {
        target: "web",
        locale: "en-US",
        noStateFiles: true,
        json: true,
      });

      expect(logSpy.mock.calls[1][0]).toContain("\n");

      await writeFile(
        root,
        "targets/web.yml",
        "description: Web\nincludeMessages:\n  - auth*\nlocales:\n  - en-US\n",
      );

      await buildProject(projectConfig, datasource, {
        target: "web",
        locale: "en-US",
        noStateFiles: true,
        json: true,
        pretty: true,
      });

      expect(logSpy.mock.calls[2][0]).toContain("\n");
    } finally {
      logSpy.mockRestore();
    }
  });

  it("uses target-level revision hashes and still writes state revisions", async function () {
    const root = await createProject();
    await writeFile(
      root,
      "targets/web.yml",
      "description: Web\nincludeMessages:\n  - auth*\nlocales:\n  - en-US\nrevisionFromHash: true\n",
    );

    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const datafiles = await buildProject(projectConfig, datasource);

    expect(datafiles[0].revision).toMatch(/^[a-f0-9]{40}$/);
    expect(datafiles[0].revision).not.toEqual("1");
    expect(await datasource.readRevision()).toEqual("1");

    const explicit = await buildProject(projectConfig, datasource, {
      target: "web",
      locale: "en-US",
      revision: "manual",
    });

    expect(explicit[0].revision).toMatch(/^[a-f0-9]{40}$/);
    expect(explicit[0].revision).not.toEqual("manual");
    expect(await datasource.readRevision()).toEqual("1");
  });

  it("applies target-level datafile options inside sets", async function () {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "messagevisor-"));

    await writeFile(root, "messagevisor.config.js", "module.exports = { sets: true };\n");
    await writeFile(root, "sets/staging/locales/en.yml", "description: English\n");
    await writeFile(
      root,
      "sets/staging/targets/web.yml",
      "description: Web\nincludeMessages:\n  - auth*\nlocales:\n  - en\nstringify: false\npretty: true\nrevisionFromHash: true\n",
    );
    await writeFile(
      root,
      "sets/staging/messages/auth/signin.yml",
      "description: Sign in\ntranslations:\n  en: Sign in\noverrides:\n  - key: pro\n    conditions:\n      attribute: plan\n      operator: equals\n      value: pro\n    translations:\n      en: Sign in Pro\n",
    );

    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const datafiles = await buildProjectSets(projectConfig, datasource);

    expect(datafiles[0].revision).toMatch(/^[a-f0-9]{40}$/);
    expect(datafiles[0].messages["auth.signin"].overrides?.[0].conditions).toEqual({
      attribute: "plan",
      operator: "equals",
      value: "pro",
    });
    expect(await datasource.readRevision()).toEqual("1");
    expect(await datasource.forSet("staging").readRevision()).toEqual("1");

    const content = await fs.promises.readFile(
      path.join(root, "datafiles/staging/messagevisor-web-en.json"),
      "utf8",
    );
    expect(content.startsWith("{\n")).toEqual(true);
  });

  it("targets overrides and segments using context defined in the target", async function () {
    const root = await createProject();
    await writeFile(
      root,
      "targets/web.yml",
      "description: Web\nincludeMessages:\n  - auth*\nlocales:\n  - en-US\ncontext:\n  platform: web\n",
    );
    await writeFile(
      root,
      "segments/platform-ios.yml",
      "description: iOS\nconditions:\n  - attribute: platform\n    operator: equals\n    value: ios\n",
    );
    await writeFile(
      root,
      "segments/plan-pro.yml",
      "description: Pro plan\nconditions:\n  - attribute: plan\n    operator: equals\n    value: pro\n",
    );
    await writeFile(
      root,
      "messages/auth/install.yml",
      "description: Install\ntranslations:\n  en: Install\n  en-US: Install now\noverrides:\n  - key: platform-web\n    segments: platform-web\n    translations:\n      en-US: Install on web\n  - key: platform-ios\n    segments: platform-ios\n    translations:\n      en-US: Install on iOS\n",
    );
    await writeFile(
      root,
      "messages/auth/pro.yml",
      "description: Pro\ntranslations:\n  en: Pro\n  en-US: Pro\noverrides:\n  - key: platform-web\n    segments:\n      and:\n        - platform-web\n        - plan-pro\n    translations:\n      en-US: Pro on web\n",
    );

    const projectConfig = getProjectConfig(root);
    const datasource = new Datasource(projectConfig, root);
    const datafiles = await buildProject(projectConfig, datasource, {
      target: "web",
      locale: "en-US",
      noStateFiles: true,
    });

    expect(datafiles[0].messages["auth.install"].overrides).toEqual([
      {
        key: "platform-web",
        translation: "Install on web",
      },
    ]);
    expect(datafiles[0].messages["auth.pro"].overrides).toEqual([
      {
        key: "platform-web",
        segments: "plan-pro",
        translation: "Pro on web",
      },
    ]);
    expect(Object.keys(datafiles[0].segments)).toEqual(["plan-pro"]);
  });
});
