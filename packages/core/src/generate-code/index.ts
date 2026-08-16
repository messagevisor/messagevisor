import * as fs from "fs";
import * as path from "path";

import type { Plugin } from "../cli";
import type { ProjectConfig } from "../config";
import type { Datasource } from "../datasource";
import { MessagevisorCLIError, printMessagevisorCLIError } from "../error";
import {
  generateTypeScriptCodeForProject,
  type TypeScriptCodeGenerationOptions,
} from "./typescript";

export const ALLOWED_LANGUAGES_FOR_CODE_GENERATION = ["typescript"];

export interface GenerateCodeOptions extends TypeScriptCodeGenerationOptions {
  language?: string;
  outDir?: string;
}

export async function generateCodeForProject(
  projectConfig: ProjectConfig,
  datasource: Datasource,
  rootDirectoryPath: string,
  options: GenerateCodeOptions,
) {
  if (!options.language) {
    throw new MessagevisorCLIError("Option --language is required.", {
      code: "missing_required_option",
      details: { option: "language" },
    });
  }

  if (!options.outDir) {
    throw new MessagevisorCLIError("Option --out-dir is required.", {
      code: "missing_required_option",
      details: { option: "out-dir" },
    });
  }

  if (ALLOWED_LANGUAGES_FOR_CODE_GENERATION.indexOf(options.language) === -1) {
    throw new MessagevisorCLIError(
      `Language ${options.language} is not supported. Supported languages: ${ALLOWED_LANGUAGES_FOR_CODE_GENERATION.join(", ")}.`,
      { code: "invalid_option", details: { option: "language", value: options.language } },
    );
  }

  const outDir = path.isAbsolute(options.outDir)
    ? options.outDir
    : path.join(rootDirectoryPath, options.outDir);

  await fs.promises.mkdir(outDir, { recursive: true });

  const result = await generateTypeScriptCodeForProject(projectConfig, datasource, outDir, {
    set: options.set,
    target: options.target,
    includeMessages: options.includeMessages,
    excludeMessages: options.excludeMessages,
    react: options.react,
  });

  console.log(
    `Generated ${result.files.length} TypeScript file(s) for ${result.messageKeys.length} message key(s) in ${outDir}`,
  );

  return result;
}

export const generateCodePlugin: Plugin = {
  command: "generate-code",
  handler: async ({ rootDirectoryPath, projectConfig, datasource, parsed }) => {
    try {
      await generateCodeForProject(projectConfig, datasource, rootDirectoryPath, {
        language: parsed.language,
        outDir: parsed.outDir,
        set: parsed.set,
        target: parsed.target,
        includeMessages: parsed.includeMessages,
        excludeMessages: parsed.excludeMessages,
        react: parsed.react,
      });
    } catch (error) {
      if (printMessagevisorCLIError(error, parsed)) {
        return false;
      }

      throw error;
    }
  },
  examples: [
    {
      command: "generate-code --language typescript --out-dir src/generated",
      description: "Generate TypeScript message key helpers",
    },
    {
      command: "generate-code --language typescript --out-dir src/generated --react",
      description: "Generate TypeScript and React message key helpers",
    },
  ],
};
