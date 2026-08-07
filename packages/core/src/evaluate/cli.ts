/* eslint-disable @typescript-eslint/no-unused-vars */
import { createMessagevisor } from "@messagevisor/sdk";
import type { Segment } from "@messagevisor/types";

import { buildDatafile } from "../builder";
import { MessagevisorCLIError, printMessagevisorCLIError } from "../error";
import { getProjectSetExecutions } from "../sets";
import { evaluateSegment } from "./index";

async function readAllSegments(datasource: any) {
  const segmentKeys = await datasource.listSegments();
  const entries = await Promise.all(
    segmentKeys.map(async (segmentKey: string) => {
      const segment = (await datasource.readSegment(segmentKey)) as Segment;
      return [segmentKey, segment] as const;
    }),
  );

  return Object.fromEntries(entries);
}

function parseJsonOption(optionName: string, value: string) {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new MessagevisorCLIError(`Invalid ${optionName}: expected valid JSON`);
  }
}

export const evaluatePlugin = {
  command: "evaluate",
  handler: async ({ projectConfig, datasource, parsed }: any) => {
    try {
      if (!projectConfig.sets && parsed.set) {
        throw new MessagevisorCLIError(
          "Option --set can only be used when project sets are enabled.",
        );
      }

      if (projectConfig.sets && !parsed.set) {
        throw new MessagevisorCLIError("Pass --set=<set>");
      }

      if (projectConfig.sets) {
        const [execution] = await getProjectSetExecutions(projectConfig, datasource, parsed.set);
        projectConfig = execution.projectConfig;
        datasource = execution.datasource;
      }

      const target = parsed.target;
      const context = parsed.context ? parseJsonOption("--context", parsed.context) : {};
      const values = parsed.values ? parseJsonOption("--values", parsed.values) : undefined;

      const subjects = [parsed.message, parsed.rawMessage, parsed.segment].filter(Boolean);
      if (subjects.length > 1) {
        throw new MessagevisorCLIError(
          "Pass exactly one of --message=<key>, --rawMessage=<message>, or --segment=<key>.",
        );
      }

      if (subjects.length === 0) {
        throw new MessagevisorCLIError(
          "Pass --message=<key>, --rawMessage=<message>, or --segment=<key>",
        );
      }

      if (parsed.segment) {
        const segments = await readAllSegments(datasource);
        const matched = evaluateSegment(parsed.segment, {
          segments,
          context,
        });
        const result = { segment: parsed.segment, matched };
        console.log(
          parsed.json
            ? JSON.stringify(result, null, parsed.pretty ? 2 : 0)
            : `Segment "${parsed.segment}" matched: ${matched}`,
        );
        return;
      }

      if (!parsed.locale) {
        throw new MessagevisorCLIError("Pass --locale=<locale>");
      }

      const locale = parsed.locale;
      const revision = await datasource.readRevision();
      const datafile = await buildDatafile(projectConfig, datasource, target, locale, revision);
      const messagevisor = createMessagevisor({
        datafile,
        context,
        modules: projectConfig.modules || [],
        logLevel: "warn",
      });

      if (parsed.message) {
        const translation = messagevisor.translate(parsed.message, values, { context });
        const result = { message: parsed.message, translation };
        console.log(
          parsed.json ? JSON.stringify(result, null, parsed.pretty ? 2 : 0) : translation,
        );
        return;
      }

      if (parsed.rawMessage) {
        const translation = messagevisor.formatMessage(parsed.rawMessage, values);
        const result = { rawMessage: parsed.rawMessage, translation };
        console.log(
          parsed.json ? JSON.stringify(result, null, parsed.pretty ? 2 : 0) : translation,
        );
        return;
      }

      throw new MessagevisorCLIError("Unable to evaluate the requested subject.");
    } catch (error) {
      if (printMessagevisorCLIError(error, parsed)) {
        return false;
      }

      throw error;
    }
  },
  examples: [
    {
      command: "evaluate --message=auth.signin --locale=en-US",
      description: "evaluate a message translation",
    },
    {
      command: 'evaluate --message=dashboard.welcome --locale=en-US --values=\'{"name":"Ada"}\'',
      description: "evaluate a message translation with JSON values",
    },
    {
      command: 'evaluate --rawMessage="Hello {name}" --locale=en-US --values=\'{"name":"Ada"}\'',
      description: "evaluate a raw message string with JSON values",
    },
    {
      command: 'evaluate --segment=platform-web --context=\'{"platform":"web"}\'',
      description: "evaluate a segment",
    },
  ],
};
