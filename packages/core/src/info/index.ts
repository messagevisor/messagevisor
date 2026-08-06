import type { Datasource } from "../datasource";
import { MessagevisorCLIError } from "../error";
import { assertProjectSetJsonSelection, getProjectSetExecutions } from "../sets";

export async function getProjectInfo(datasource: Datasource) {
  const [locales, messages, segments, attributes, targets, tests] = await Promise.all([
    datasource.listLocales(),
    datasource.listMessages(),
    datasource.listSegments(),
    datasource.listAttributes(),
    datasource.listTargets(),
    datasource.listTests(),
  ]);

  return {
    locales: locales.length,
    messages: messages.length,
    segments: segments.length,
    attributes: attributes.length,
    targets: targets.length,
    tests: tests.length,
  };
}

export const infoPlugin = {
  command: "info",
  handler: async ({ datasource, parsed }: any) => {
    const projectConfig = datasource.getConfig();
    if (!projectConfig.sets && parsed.set) {
      throw new MessagevisorCLIError(
        "Option --set can only be used when project sets are enabled.",
      );
    }
    assertProjectSetJsonSelection(projectConfig, parsed.set, parsed.json);

    if (projectConfig.sets) {
      const executions = await getProjectSetExecutions(projectConfig, datasource, parsed.set);
      const infoBySet: Record<string, Awaited<ReturnType<typeof getProjectInfo>>> = {};

      for (const execution of executions) {
        infoBySet[execution.set] = await getProjectInfo(execution.datasource);
      }

      if (parsed.json) {
        console.log(parsed.pretty ? JSON.stringify(infoBySet, null, 2) : JSON.stringify(infoBySet));
        return;
      }

      console.log("\nProject info:\n");
      for (const set of Object.keys(infoBySet)) {
        console.log(`Set "${set}":`);
        for (const key of Object.keys(infoBySet[set])) {
          console.log(`  - ${key}: ${(infoBySet[set] as any)[key]}`);
        }
        console.log("");
      }
      return;
    }

    const info = await getProjectInfo(datasource);

    if (parsed.json) {
      console.log(parsed.pretty ? JSON.stringify(info, null, 2) : JSON.stringify(info));
      return;
    }

    console.log("\nProject info:\n");
    for (const key of Object.keys(info)) {
      console.log(`  - ${key}: ${(info as any)[key]}`);
    }
  },
  examples: [{ command: "info", description: "show project entity counts" }],
};
