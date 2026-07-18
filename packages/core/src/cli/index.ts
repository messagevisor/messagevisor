import { createCatalogPlugin } from "@messagevisor/catalog";

import { ProjectConfig, getProjectConfig } from "../config";
import { Datasource } from "../datasource";

import { buildDatafile, buildPlugin } from "../builder";
import { benchmarkPlugin } from "../benchmark";
import { mergeFormats, resolveFormats } from "../builder";
import { configPlugin } from "../config";
import { createPlugin } from "../create";
import { diffPlugin } from "../diff";
import { prunePlugin } from "../prune";
import { examplesPlugin, resolveExamples } from "../examples";
import { evaluatePlugin } from "../evaluate/cli";
import { exportPlugin } from "../exporter";
import { findDuplicateTranslations, findDuplicatesPlugin } from "../find-duplicates";
import { findUsagePlugin } from "../find-usage";
import { targetIncludesMessage } from "../targeting";
import { generateCodePlugin } from "../generate-code";
import { importPlugin } from "../importer";
import { infoPlugin } from "../info";
import { initPlugin } from "../init";
import { lintPlugin } from "../linter";
import { listPlugin } from "../list";
import { promotePlugin } from "../promoter";
import { getProjectSetExecutions } from "../sets";
import { testPlugin } from "../tester";
import { expandTestAssertions } from "../tester/matrix";
import { formatMessagevisorCLIError, getMessagevisorCLIErrorMessage } from "../error";
import { getBuiltinCLIOptions, type CLIOptionDefinitions } from "./options";

export interface ParsedOptions {
  _: string[];
  [key: string]: any;
}

export interface PluginHandlerOptions {
  rootDirectoryPath: string;
  projectConfig: ProjectConfig;
  datasource: Datasource;
  parsed: ParsedOptions;
}

export interface Plugin {
  command: string;
  options?: CLIOptionDefinitions;
  handler: (options: PluginHandlerOptions) => Promise<void | boolean>;
  examples: {
    command: string;
    description: string;
  }[];
}

export interface RunnerOptions {
  rootDirectoryPath: string;
  projectConfig?: ProjectConfig;
  datasource?: Datasource;
}

export function getCLIErrorOutput(error: unknown) {
  const cliMessage = getMessagevisorCLIErrorMessage(error);

  if (typeof cliMessage !== "undefined") {
    return cliMessage;
  }

  return error;
}

const projectBasedPlugins = [
  configPlugin,
  createPlugin,
  diffPlugin,
  prunePlugin,
  examplesPlugin,
  createCatalogPlugin({
    mergeFormats,
    resolveFormats,
    buildDatafile,
    getProjectSetExecutions,
    resolveExamples,
    findDuplicateTranslations,
    targetIncludesMessage,
    expandTestAssertions,
  }),
  benchmarkPlugin,
  lintPlugin,
  listPlugin,
  findDuplicatesPlugin,
  findUsagePlugin,
  buildPlugin,
  testPlugin,
  infoPlugin,
  evaluatePlugin,
  exportPlugin,
  importPlugin,
  generateCodePlugin,
  promotePlugin,
];
const nonProjectPlugins = [initPlugin];

export async function runCLI(runnerOptions: RunnerOptions) {
  const yargs = require("yargs");
  let y = yargs(process.argv.slice(2))
    .usage("Usage: $0 <command> [options]")
    .option("rootDirectoryPath", {
      type: "string",
      description: "Messagevisor project directory",
    })
    .strictOptions();
  const registeredSubcommands: string[] = [];
  const { rootDirectoryPath, projectConfig, datasource } = runnerOptions;

  function registerPlugin(plugin: Plugin) {
    const subcommand = plugin.command.split(" ")[0];

    if (registeredSubcommands.includes(subcommand)) {
      return;
    }

    y = y.command({
      command: plugin.command,
      builder(commandYargs: any) {
        return commandYargs
          .options({ ...getBuiltinCLIOptions(plugin.command), ...(plugin.options || {}) })
          .strictOptions();
      },
      handler: async function (parsed: ParsedOptions) {
        try {
          const result = await plugin.handler({
            rootDirectoryPath,
            projectConfig,
            datasource,
            parsed,
          } as PluginHandlerOptions);

          if (result === false) {
            process.exit(1);
          }
        } catch (error) {
          console.error(
            formatMessagevisorCLIError(error, { json: parsed.json, pretty: parsed.pretty }),
          );
          process.exit(1);
        }
      },
    });

    for (const example of plugin.examples) {
      y = y.example(`$0 ${example.command}`, example.description);
    }

    registeredSubcommands.push(subcommand);
  }

  if (projectConfig && datasource) {
    for (const plugin of [...projectBasedPlugins, ...(projectConfig.plugins || [])]) {
      registerPlugin(plugin);
    }
  } else {
    for (const plugin of nonProjectPlugins) {
      registerPlugin(plugin);
    }
  }

  y.command({
    command: "*",
    handler() {
      y.showHelp();
    },
  }).argv;
}

export { getProjectConfig, Datasource };
export type { CLIOptionDefinition, CLIOptionDefinitions } from "./options";
