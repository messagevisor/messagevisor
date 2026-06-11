import * as path from "path";

import type { ProjectConfig } from "./config";

export function getProjectRootDirectoryPath(projectConfig: ProjectConfig) {
  return path.dirname(projectConfig.setsDirectoryPath);
}

export function formatRootRelativePath(rootDirectoryPath: string, filePath: string) {
  const absoluteRootDirectoryPath = path.resolve(rootDirectoryPath);
  const absoluteFilePath = path.resolve(filePath);
  const relativePath = path.relative(absoluteRootDirectoryPath, absoluteFilePath);

  if (!relativePath) {
    return ".";
  }

  if (
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    return absoluteFilePath;
  }

  return relativePath;
}

export function formatProjectPath(projectConfig: ProjectConfig, filePath: string) {
  return formatRootRelativePath(getProjectRootDirectoryPath(projectConfig), filePath);
}
