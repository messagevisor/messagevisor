import * as path from "path";
import * as ts from "typescript";

it("compiles root and child framework consumers without advertising root ownership methods", () => {
  const root = path.resolve(__dirname, "../../..");
  const file = path.join(root, "packages/sdk/src/__provider_consumer__.tsx");
  const source = `
    import * as React from "react";
    import { h } from "vue";
    import { createMessagevisor, type MessagevisorConsumer } from "@messagevisor/sdk";
    import { MessagevisorProvider as ReactProvider, useSdk as useReactSdk, useMessagevisor as useReactApi } from "@messagevisor/react";
    import { MessagevisorProvider as VueProvider, createMessagevisorProvider, useSdk as useVueSdk, useMessagevisor as useVueApi } from "@messagevisor/vue";
    import { createIntlFromMessagevisor } from "@messagevisor/react-intl-compat";
    const root = createMessagevisor({ locale: "en" });
    const child = root.spawn({}, { locale: "nl" });
    const consumers: MessagevisorConsumer[] = [root, child];
    for (const instance of consumers) {
      const react = <ReactProvider instance={instance}><span /></ReactProvider>;
      const vue = h(VueProvider, { instance });
      createMessagevisorProvider({ instance });
      const intl = createIntlFromMessagevisor(instance);
      intl.formatMessage({ defaultMessage: "hello" });
      // @ts-expect-error A consumer does not own datafiles.
      intl.messagevisor.setDatafile({});
    }
    function ReactConsumer() {
      const sdk = useReactSdk();
      sdk.setLocale("fr");
      sdk.setContext({ request: "react" });
      // @ts-expect-error Framework consumers do not own datafiles.
      sdk.setDatafile({});
      // @ts-expect-error Framework consumers cannot register root modules.
      sdk.addModule({});
      // @ts-expect-error Framework consumers cannot remove root modules.
      sdk.removeModule("icu");
      // @ts-expect-error Framework consumers cannot spawn another child.
      sdk.spawn();
      const api = useReactApi();
      // @ts-expect-error The bound API does not promise root setters either.
      api.setDatafile({});
      return <>{api.t("hello")}</>;
    }
    function vueSetup() {
      const sdk = useVueSdk();
      sdk.setLocale("fr");
      sdk.setContext({ request: "vue" });
      // @ts-expect-error Framework consumers do not own datafiles.
      sdk.setDatafile({});
      // @ts-expect-error Framework consumers cannot register root modules.
      sdk.addModule({});
      // @ts-expect-error Framework consumers cannot remove root modules.
      sdk.removeModule("icu");
      // @ts-expect-error Framework consumers cannot spawn another child.
      sdk.spawn();
      const api = useVueApi();
      // @ts-expect-error The bound API does not promise root setters either.
      api.setDatafile({});
      return () => h("span", api.t("hello"));
    }
  `;
  const packages = ["sdk", "react", "vue", "react-intl-compat"];
  const options: ts.CompilerOptions = {
    noEmit: true,
    strict: true,
    skipLibCheck: true,
    esModuleInterop: true,
    target: ts.ScriptTarget.ES2018,
    module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.Node10,
    jsx: ts.JsxEmit.React,
    lib: ["lib.es2021.d.ts", "lib.es2021.intl.d.ts", "lib.dom.d.ts"],
    baseUrl: root,
    paths: Object.fromEntries(
      packages.map((name) => [`@messagevisor/${name}`, [`packages/${name}/src/index.ts`]]),
    ),
  };
  const host = ts.createCompilerHost(options);
  const readFile = host.readFile;
  const fileExists = host.fileExists;
  host.readFile = (name) => (name === file ? source : readFile(name));
  host.fileExists = (name) => name === file || fileExists(name);
  const program = ts.createProgram([file], options, host);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  expect(
    diagnostics.map(
      (d) =>
        `${d.file?.fileName}:${d.start}: ${ts.flattenDiagnosticMessageText(d.messageText, "\n")}`,
    ),
  ).toEqual([]);
});
