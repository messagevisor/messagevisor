import * as path from "path";

import type { ProjectConfig } from "./config";
import type { Datasource } from "./datasource";
import { MessagevisorCLIError } from "./error";
import { formatProjectPath } from "./path";

export interface ProjectSetExecution {
  set: string;
  projectConfig: ProjectConfig;
  datasource: Datasource;
}

export async function getProjectSetExecutions(
  projectConfig: ProjectConfig,
  datasource: Datasource,
  selectedSet?: string,
): Promise<ProjectSetExecution[]> {
  if (!projectConfig.sets) {
    if (selectedSet) {
      throw new MessagevisorCLIError(
        "Option --set can only be used when project sets are enabled.",
        { code: "sets_not_enabled", details: { option: "set" } },
      );
    }

    return [{ set: "", projectConfig, datasource }];
  }

  const availableSetKeys = await datasource.listSets();

  if (selectedSet && !availableSetKeys.includes(selectedSet)) {
    throw new MessagevisorCLIError(
      `Unknown set "${selectedSet}". Available sets: ${availableSetKeys.join(", ") || "none"}.`,
      { code: "unknown_set", details: { set: selectedSet } },
    );
  }

  const setKeys = selectedSet ? [selectedSet] : availableSetKeys;

  if (setKeys.length === 0) {
    throw new MessagevisorCLIError(`No sets found in ${projectConfig.setsDirectoryPath}.`, {
      code: "no_sets",
    });
  }

  return setKeys.map((set) => {
    const setDatasource = datasource.forSet(set);

    return {
      set,
      projectConfig: setDatasource.getConfig(),
      datasource: setDatasource,
    };
  });
}

export function assertProjectSetJsonSelection(
  projectConfig: ProjectConfig,
  selectedSet: string | undefined,
  json: boolean | undefined,
) {
  if (projectConfig.sets && json && !selectedSet) {
    throw new MessagevisorCLIError(
      "Pass --set=<set> when using --json in a project with sets enabled.",
      { code: "set_required_for_json", details: { option: "set" } },
    );
  }
}

export function getProjectSetRelativeFilePath(
  projectConfig: ProjectConfig,
  set: string,
  filePath: string,
) {
  const setDirectoryPath = formatProjectPath(
    projectConfig,
    path.join(projectConfig.setsDirectoryPath, set),
  );

  if (filePath === setDirectoryPath || filePath.startsWith(`${setDirectoryPath}${path.sep}`)) {
    return filePath;
  }

  return path.join(setDirectoryPath, filePath);
}
