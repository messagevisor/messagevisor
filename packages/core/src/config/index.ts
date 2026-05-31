import * as path from "path";
import * as util from "util";

import { Parser, parsers } from "@featurevisor/parsers";
import type { MessagevisorModule } from "@messagevisor/sdk";

import { FilesystemAdapter } from "../datasource/filesystemAdapter";
import type { Plugin } from "../cli";

export const LOCALES_DIRECTORY_NAME = "locales";
export const MESSAGES_DIRECTORY_NAME = "messages";
export const SEGMENTS_DIRECTORY_NAME = "segments";
export const ATTRIBUTES_DIRECTORY_NAME = "attributes";
export const TARGETS_DIRECTORY_NAME = "targets";
export const TESTS_DIRECTORY_NAME = "tests";
export const SETS_DIRECTORY_NAME = "sets";
export const STATE_DIRECTORY_NAME = ".messagevisor";
export const DATAFILES_DIRECTORY_NAME = "datafiles";
export const EXPORTS_DIRECTORY_NAME = "exports";
export const CATALOG_DIRECTORY_NAME = "catalog";
export const DATAFILE_NAME_PATTERN = "messagevisor-%s.json";
export const REVISION_FILE_NAME = "REVISION";
export const CONFIG_MODULE_NAME = "messagevisor.config.js";
export const ROOT_DIR_PLACEHOLDER = "<rootDir>";
export const DEFAULT_NAMESPACE_CHARACTER = ".";
export const DEFAULT_EXPORT_OVERRIDE_KEY_SEPARATOR = ":";
export const DEFAULT_PARSER: Parser = "yml";
export const DEFAULT_ICU_SKELETON = false;
export const DEFAULT_SETS = false;
export const SCHEMA_VERSION = "1";

export interface ProjectConfig {
  promotionFlows?: Array<{
    from: string;
    to: string;
  }>;
  namespaceCharacter: string;
  exportOverrideKeySeparator: string;
  icuSkeleton: boolean;
  modules: MessagevisorModule[];
  sets: boolean;
  setsDirectoryPath: string;
  localesDirectoryPath: string;
  messagesDirectoryPath: string;
  segmentsDirectoryPath: string;
  attributesDirectoryPath: string;
  targetsDirectoryPath: string;
  testsDirectoryPath: string;
  stateDirectoryPath: string;
  datafilesDirectoryPath: string;
  exportsDirectoryPath: string;
  catalogDirectoryPath: string;
  datafileNamePattern: string;
  revisionFileName: string;
  adapter: any;
  plugins: Plugin[];
  parser: Parser;
}

export function getProjectConfig(rootDirectoryPath: string): ProjectConfig {
  const baseConfig: ProjectConfig = {
    namespaceCharacter: DEFAULT_NAMESPACE_CHARACTER,
    exportOverrideKeySeparator: DEFAULT_EXPORT_OVERRIDE_KEY_SEPARATOR,
    icuSkeleton: DEFAULT_ICU_SKELETON,
    modules: [],
    sets: DEFAULT_SETS,
    promotionFlows: undefined,
    parser: DEFAULT_PARSER,
    adapter: FilesystemAdapter,
    plugins: [],
    setsDirectoryPath: path.join(rootDirectoryPath, SETS_DIRECTORY_NAME),
    localesDirectoryPath: path.join(rootDirectoryPath, LOCALES_DIRECTORY_NAME),
    messagesDirectoryPath: path.join(rootDirectoryPath, MESSAGES_DIRECTORY_NAME),
    segmentsDirectoryPath: path.join(rootDirectoryPath, SEGMENTS_DIRECTORY_NAME),
    attributesDirectoryPath: path.join(rootDirectoryPath, ATTRIBUTES_DIRECTORY_NAME),
    targetsDirectoryPath: path.join(rootDirectoryPath, TARGETS_DIRECTORY_NAME),
    testsDirectoryPath: path.join(rootDirectoryPath, TESTS_DIRECTORY_NAME),
    stateDirectoryPath: path.join(rootDirectoryPath, STATE_DIRECTORY_NAME),
    datafilesDirectoryPath: path.join(rootDirectoryPath, DATAFILES_DIRECTORY_NAME),
    exportsDirectoryPath: path.join(rootDirectoryPath, EXPORTS_DIRECTORY_NAME),
    catalogDirectoryPath: path.join(rootDirectoryPath, CATALOG_DIRECTORY_NAME),
    datafileNamePattern: DATAFILE_NAME_PATTERN,
    revisionFileName: REVISION_FILE_NAME,
  };

  const customConfig = require(path.join(rootDirectoryPath, CONFIG_MODULE_NAME));
  const mergedConfig: Record<string, any> = {};

  Object.keys(baseConfig).forEach((key) => {
    mergedConfig[key] =
      typeof customConfig[key] !== "undefined" ? customConfig[key] : (baseConfig as any)[key];

    if (key.endsWith("Path") && mergedConfig[key].indexOf(ROOT_DIR_PLACEHOLDER) !== -1) {
      mergedConfig[key] = mergedConfig[key].replace(ROOT_DIR_PLACEHOLDER, rootDirectoryPath);
    }
  });

  const finalConfig = mergedConfig as ProjectConfig;

  if (
    typeof finalConfig.namespaceCharacter !== "string" ||
    finalConfig.namespaceCharacter.length === 0 ||
    finalConfig.namespaceCharacter === "/" ||
    finalConfig.namespaceCharacter === "\\"
  ) {
    throw new Error(
      `Invalid namespaceCharacter: ${finalConfig.namespaceCharacter}. It must be a non-empty string and cannot be a path separator.`,
    );
  }

  if (
    typeof finalConfig.exportOverrideKeySeparator !== "string" ||
    finalConfig.exportOverrideKeySeparator.length === 0 ||
    finalConfig.exportOverrideKeySeparator === "/" ||
    finalConfig.exportOverrideKeySeparator === "\\"
  ) {
    throw new Error(
      `Invalid exportOverrideKeySeparator: ${finalConfig.exportOverrideKeySeparator}. It must be a non-empty string and cannot be a path separator.`,
    );
  }

  if (finalConfig.exportOverrideKeySeparator === finalConfig.namespaceCharacter) {
    throw new Error(
      `Invalid exportOverrideKeySeparator: it cannot be the same as namespaceCharacter "${finalConfig.namespaceCharacter}".`,
    );
  }

  if (typeof finalConfig.icuSkeleton !== "boolean") {
    throw new Error(`Invalid icuSkeleton: ${finalConfig.icuSkeleton}. It must be a boolean.`);
  }

  if (!Array.isArray(finalConfig.modules)) {
    throw new Error(`Invalid modules: ${finalConfig.modules}. It must be an array.`);
  }

  if (typeof finalConfig.sets !== "boolean") {
    throw new Error(`Invalid sets: ${finalConfig.sets}. It must be a boolean.`);
  }

  if (typeof finalConfig.promotionFlows !== "undefined") {
    if (!Array.isArray(finalConfig.promotionFlows)) {
      throw new Error(
        `Invalid promotionFlows: ${finalConfig.promotionFlows}. It must be an array.`,
      );
    }

    finalConfig.promotionFlows.forEach((entry: any, index: number) => {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
        throw new Error(
          `Invalid promotionFlows[${index}]: ${entry}. Each entry must be an object with exactly "from" and "to" string fields.`,
        );
      }

      const keys = Object.keys(entry).sort();

      if (keys.length !== 2 || keys[0] !== "from" || keys[1] !== "to") {
        throw new Error(
          `Invalid promotionFlows[${index}]: ${JSON.stringify(entry)}. Each entry must contain exactly "from" and "to".`,
        );
      }

      if (typeof entry.from !== "string" || typeof entry.to !== "string") {
        throw new Error(
          `Invalid promotionFlows[${index}]: ${JSON.stringify(entry)}. "from" and "to" must be strings.`,
        );
      }
    });
  }

  if (typeof finalConfig.parser === "string") {
    const allowedParsers = Object.keys(parsers);

    if (allowedParsers.indexOf(finalConfig.parser) === -1) {
      throw new Error(`Invalid parser: ${finalConfig.parser}`);
    }

    finalConfig.parser = parsers[finalConfig.parser];
  }

  return finalConfig;
}

export function getProjectConfigForSet(projectConfig: ProjectConfig, set: string): ProjectConfig {
  const setRootDirectoryPath = path.join(projectConfig.setsDirectoryPath, set);

  return {
    ...projectConfig,
    localesDirectoryPath: path.join(setRootDirectoryPath, LOCALES_DIRECTORY_NAME),
    messagesDirectoryPath: path.join(setRootDirectoryPath, MESSAGES_DIRECTORY_NAME),
    segmentsDirectoryPath: path.join(setRootDirectoryPath, SEGMENTS_DIRECTORY_NAME),
    attributesDirectoryPath: path.join(setRootDirectoryPath, ATTRIBUTES_DIRECTORY_NAME),
    targetsDirectoryPath: path.join(setRootDirectoryPath, TARGETS_DIRECTORY_NAME),
    testsDirectoryPath: path.join(setRootDirectoryPath, TESTS_DIRECTORY_NAME),
    stateDirectoryPath: path.join(projectConfig.stateDirectoryPath, SETS_DIRECTORY_NAME, set),
    datafilesDirectoryPath: path.join(projectConfig.datafilesDirectoryPath, set),
  };
}

export function formatDatafileName(projectConfig: ProjectConfig, parts: string[]) {
  return util.format(projectConfig.datafileNamePattern, parts.join("-"));
}

export function formatDatafilePath(
  projectConfig: ProjectConfig,
  targetKey: string,
  localeKey: string,
) {
  const targetPathSegments = targetKey.split(projectConfig.namespaceCharacter);
  const targetFileKey = targetPathSegments.pop() || targetKey;

  return path.join(
    ...targetPathSegments,
    formatDatafileName(projectConfig, [targetFileKey, localeKey]),
  );
}

export interface ShowProjectConfigOptions {
  json?: boolean;
  pretty?: boolean;
}

export function showProjectConfig(
  projectConfig: ProjectConfig,
  options: ShowProjectConfigOptions = {},
) {
  if (options.json) {
    console.log(
      options.pretty ? JSON.stringify(projectConfig, null, 2) : JSON.stringify(projectConfig),
    );
    return;
  }

  console.log("\nProject configuration:\n");

  for (const key of Object.keys(projectConfig)) {
    if (["adapter", "parser", "plugins", "modules"].includes(key)) {
      continue;
    }

    console.log(`  - ${key}: ${(projectConfig as any)[key]}`);
  }
}

export const configPlugin: Plugin = {
  command: "config",
  handler: async ({ projectConfig, parsed }) => {
    showProjectConfig(projectConfig, {
      json: parsed.json,
      pretty: parsed.pretty,
    });
  },
  examples: [
    { command: "config", description: "show the project configuration" },
    {
      command: "config --json --pretty",
      description: "show the project configuration as pretty JSON",
    },
  ],
};
