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
import { compileTargetMessageMatcher, targetIncludesMessage } from "../targeting";
import { generateCodePlugin } from "../generate-code";
import { importPlugin } from "../importer";
import { infoPlugin } from "../info";
import { initPlugin } from "../init";
import { lintPlugin } from "../linter";
import { listPlugin } from "../list";
import { promotePlugin } from "../promoter";
import { getProjectSetExecutions } from "../sets";
import { loadProjectSnapshot } from "../snapshot";
import { testPlugin } from "../tester";
import { expandTestAssertions } from "../tester/matrix";
import {
  formatMessagevisorCLIError,
  getMessagevisorCLIErrorMessage,
  MessagevisorCLIError,
} from "../error";
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
  description?: string;
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
  includeProjectCommands?: boolean;
}

export function getCLIErrorOutput(error: unknown) {
  const cliMessage = getMessagevisorCLIErrorMessage(error);

  if (typeof cliMessage !== "undefined") {
    return cliMessage;
  }

  return error;
}

function getCommandPositionals(command: string) {
  const positionals: string[] = [];
  const pattern = /[<[]([^>\]]+)[>\]]/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(command))) {
    const positional = match[1].split("|")[0].replace(/\.{2,3}$/, "");
    positionals.push(positional);
  }

  return positionals;
}

const projectBasedPlugins = [
  configPlugin,
  createPlugin,
  diffPlugin,
  prunePlugin,
  examplesPlugin,
  createCatalogPlugin({
    reloadProject(rootDirectoryPath) {
      const projectConfig = getProjectConfig(rootDirectoryPath);
      return {
        projectConfig,
        datasource: new Datasource(projectConfig, rootDirectoryPath),
      };
    },
    loadProjectSnapshot,
    mergeFormats,
    resolveFormats,
    buildDatafile,
    getProjectSetExecutions,
    resolveExamples,
    findDuplicateTranslations,
    compileTargetMessageMatcher,
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

function toDashedOptionName(name: string) {
  return name.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`);
}

function getBooleanArgument(args: string[], name: string) {
  const names = new Set([name, toDashedOptionName(name)]);
  let value = false;

  for (const argument of args) {
    for (const optionName of names) {
      if (argument === `--${optionName}` || argument === `--${optionName}=true`) {
        value = true;
      }
      if (argument === `--no-${optionName}` || argument === `--${optionName}=false`) {
        value = false;
      }
    }
  }

  return value;
}

export async function runCLI(runnerOptions: RunnerOptions) {
  const createYargs = require("yargs/yargs");
  const args = process.argv.slice(2);
  const json = getBooleanArgument(args, "json");
  const pretty = getBooleanArgument(args, "pretty");
  let commandFailed = false;
  let y = createYargs(args)
    .scriptName("messagevisor")
    .usage("Usage: $0 <command> [options]")
    .option("rootDirectoryPath", {
      type: "string",
      description: "Messagevisor project directory",
    })
    .strictOptions()
    .exitProcess(false)
    .showHelpOnFail(false)
    .fail((message: string, error: unknown) => {
      if (error) {
        throw error;
      }

      throw new MessagevisorCLIError(message || "Invalid command line arguments.", {
        code: "invalid_cli_arguments",
      });
    });
  const registeredSubcommands: string[] = [];
  const { rootDirectoryPath, projectConfig, datasource } = runnerOptions;

  function registerPlugin(plugin: Plugin) {
    const subcommand = plugin.command.split(" ")[0];

    if (registeredSubcommands.includes(subcommand)) {
      throw new MessagevisorCLIError(`CLI command "${subcommand}" is already registered.`, {
        code: "duplicate_cli_command",
        details: { command: subcommand },
      });
    }

    y = y.command({
      command: plugin.command,
      describe: plugin.description || plugin.examples[0]?.description,
      builder(commandYargs: any) {
        let configuredYargs = commandYargs.options({
          ...getBuiltinCLIOptions(plugin.command),
          ...(plugin.options || {}),
        });

        for (const positional of getCommandPositionals(plugin.command)) {
          configuredYargs = configuredYargs.positional(positional, { type: "string" });
        }

        return configuredYargs.strict();
      },
      handler: async function (parsed: ParsedOptions) {
        const result = await plugin.handler({
          rootDirectoryPath,
          projectConfig,
          datasource,
          parsed,
        } as PluginHandlerOptions);

        if (result === false) {
          commandFailed = true;
        }
      },
    });

    for (const example of plugin.examples) {
      y = y.example(`$0 ${example.command}`, example.description);
    }

    registeredSubcommands.push(subcommand);
  }

  try {
    if (projectConfig && datasource) {
      for (const plugin of [...projectBasedPlugins, ...(projectConfig.plugins || [])]) {
        registerPlugin(plugin);
      }
    } else {
      for (const plugin of nonProjectPlugins) {
        registerPlugin(plugin);
      }

      if (runnerOptions.includeProjectCommands) {
        for (const plugin of projectBasedPlugins) {
          registerPlugin(plugin);
        }
      }
    }

    y = y.command({
      command: "*",
      handler(parsed: ParsedOptions) {
        const unknownCommand = parsed._[0];

        if (unknownCommand) {
          throw new MessagevisorCLIError(`Unknown command "${unknownCommand}".`, {
            code: "unknown_command",
            details: { command: unknownCommand },
          });
        }

        y.showHelp();
      },
    });

    await y.parseAsync();
  } catch (error) {
    console.error(formatMessagevisorCLIError(error, { json, pretty }));
    commandFailed = true;
  }

  if (commandFailed) {
    process.exitCode = 1;
  }

  return !commandFailed;
}

export { getProjectConfig, Datasource };
export type { CLIOptionDefinition, CLIOptionDefinitions } from "./options";
