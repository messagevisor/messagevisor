/* eslint-disable @typescript-eslint/no-unused-vars */
import { performance } from "perf_hooks";

import { createMessagevisor } from "@messagevisor/sdk";
import type {
  Condition,
  Context,
  DatafileContent,
  FormatPresets,
  GroupSegment,
  Locale,
  Target,
} from "@messagevisor/types";

import { buildDatafile, buildMessageDatafile, resolveFormats } from "../builder";
import type { Plugin } from "../cli";
import type { Datasource } from "../datasource";
import { MessagevisorCLIError, printMessagevisorCLIError } from "../error";
import { getProjectSetExecutions } from "../sets";

function parseJsonOption(optionName: string, value: string) {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new MessagevisorCLIError(`Invalid ${optionName}: expected valid JSON`);
  }
}

function parseIterationCount(value: unknown) {
  const parsed = parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function formatDuration(duration: number) {
  return `${duration.toFixed(3)}ms`;
}

function parseStructuredString(value: string): unknown {
  if (!(value.startsWith("{") || value.startsWith("["))) {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

interface BenchmarkResult {
  value: unknown;
  minDuration: number;
  medianDuration: number;
  maxDuration: number;
  averageDuration: number;
  totalDuration: number;
  iterations: number;
}

interface BenchmarkDatafileCounts {
  messages: number;
  segments: number;
  attributes: number;
}

interface BenchmarkSetup {
  messagevisor: ReturnType<typeof createMessagevisor>;
  datafileCounts: BenchmarkDatafileCounts;
}

function getMedian(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }

  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function benchmarkIterations(run: () => unknown, iterations: number): BenchmarkResult {
  let minDuration = Number.POSITIVE_INFINITY;
  let maxDuration = 0;
  let totalDuration = 0;
  let value: unknown;
  const durations: number[] = [];

  for (let index = 0; index < iterations; index++) {
    const start = performance.now();
    value = run();
    const duration = performance.now() - start;

    minDuration = Math.min(minDuration, duration);
    maxDuration = Math.max(maxDuration, duration);
    totalDuration += duration;
    durations.push(duration);
  }

  return {
    value,
    minDuration: Number.isFinite(minDuration) ? minDuration : 0,
    medianDuration: getMedian(durations),
    maxDuration,
    averageDuration: totalDuration / iterations,
    totalDuration,
    iterations,
  };
}

function collectAttributeKeysFromCondition(
  condition: Condition | Condition[] | "*" | undefined,
  result: Set<string>,
  segments: DatafileContent["segments"],
  seenSegments: Set<string>,
): void {
  if (!condition || condition === "*") {
    return;
  }

  if (Array.isArray(condition)) {
    for (const item of condition) {
      collectAttributeKeysFromCondition(item, result, segments, seenSegments);
    }
    return;
  }

  if (typeof condition === "string") {
    const parsedCondition = parseStructuredString(condition);

    if (parsedCondition !== condition) {
      collectAttributeKeysFromCondition(
        parsedCondition as Condition | Condition[],
        result,
        segments,
        seenSegments,
      );
      return;
    }

    collectAttributeKeysFromGroupSegment(condition, result, segments, seenSegments);
    return;
  }

  if ("attribute" in condition) {
    result.add(condition.attribute);
    return;
  }

  if ("and" in condition) {
    collectAttributeKeysFromCondition(condition.and, result, segments, seenSegments);
    return;
  }

  if ("or" in condition) {
    collectAttributeKeysFromCondition(condition.or, result, segments, seenSegments);
    return;
  }

  if ("not" in condition) {
    collectAttributeKeysFromCondition(condition.not, result, segments, seenSegments);
  }
}

function collectAttributeKeysFromGroupSegment(
  groupSegment: GroupSegment | GroupSegment[] | "*" | undefined,
  result: Set<string>,
  segments: DatafileContent["segments"],
  seenSegments: Set<string>,
): void {
  if (!groupSegment || groupSegment === "*") {
    return;
  }

  if (Array.isArray(groupSegment)) {
    for (const item of groupSegment) {
      collectAttributeKeysFromGroupSegment(item, result, segments, seenSegments);
    }
    return;
  }

  if (typeof groupSegment === "string") {
    const parsedGroupSegment = parseStructuredString(groupSegment);

    if (parsedGroupSegment !== groupSegment) {
      collectAttributeKeysFromGroupSegment(
        parsedGroupSegment as GroupSegment | GroupSegment[],
        result,
        segments,
        seenSegments,
      );
      return;
    }

    if (seenSegments.has(groupSegment)) {
      return;
    }

    seenSegments.add(groupSegment);
    const segment = segments[groupSegment];

    if (segment) {
      collectAttributeKeysFromCondition(segment.conditions, result, segments, seenSegments);
    }
    return;
  }

  if ("and" in groupSegment) {
    collectAttributeKeysFromGroupSegment(groupSegment.and, result, segments, seenSegments);
    return;
  }

  if ("or" in groupSegment) {
    collectAttributeKeysFromGroupSegment(groupSegment.or, result, segments, seenSegments);
    return;
  }

  if ("not" in groupSegment) {
    collectAttributeKeysFromGroupSegment(groupSegment.not, result, segments, seenSegments);
  }
}

function getDatafileCounts(datafile?: DatafileContent): BenchmarkDatafileCounts {
  if (!datafile) {
    return {
      messages: 0,
      segments: 0,
      attributes: 0,
    };
  }

  const attributeKeys = new Set<string>();
  const seenSegments = new Set<string>();

  for (const segmentKey of Object.keys(datafile.segments)) {
    collectAttributeKeysFromGroupSegment(
      segmentKey,
      attributeKeys,
      datafile.segments,
      seenSegments,
    );
  }

  return {
    messages: Object.keys(datafile.translations).length,
    segments: Object.keys(datafile.segments).length,
    attributes: attributeKeys.size,
  };
}

async function readLocales(datasource: Datasource) {
  const localeKeys = await datasource.listLocales();
  const locales = await Promise.all(
    localeKeys.map(
      async (localeKey) => [localeKey, (await datasource.readLocale(localeKey)) as Locale] as const,
    ),
  );

  return Object.fromEntries(locales) as Record<string, Locale>;
}

async function resolveBenchmarkFormats(
  datasource: Datasource,
  locale: string,
  targetKey?: string,
): Promise<FormatPresets | undefined> {
  const locales = await readLocales(datasource);
  const target = targetKey ? ((await datasource.readTarget(targetKey)) as Target) : undefined;

  return resolveFormats(locale, locales, target);
}

async function createBenchmarkMessagevisor(options: {
  projectConfig: any;
  datasource: Datasource;
  locale: string;
  context: Context;
  target?: string;
  revision: string;
  message?: string;
}): Promise<BenchmarkSetup> {
  const { projectConfig, datasource, locale, context, target, revision, message } = options;
  let datafile: DatafileContent | undefined;
  let defaultFormatsByLocale: Record<string, FormatPresets> | undefined;

  if (message) {
    datafile = target
      ? await buildDatafile(projectConfig, datasource, target, locale, revision)
      : await buildMessageDatafile(projectConfig, datasource, message, locale, revision);
  } else if (target) {
    datafile = await buildDatafile(projectConfig, datasource, target, locale, revision);
  } else {
    const resolvedFormats = await resolveBenchmarkFormats(datasource, locale, target);
    if (resolvedFormats) defaultFormatsByLocale = { [locale]: resolvedFormats };
  }

  return {
    messagevisor: createMessagevisor({
      datafile,
      defaultFormats: defaultFormatsByLocale,
      locale,
      context,
      modules: projectConfig.modules || [],
      logLevel: "warn",
    }),
    datafileCounts: getDatafileCounts(datafile),
  };
}

function printBenchmarkSummary(
  target: string,
  locale: string,
  datafileCounts: BenchmarkDatafileCounts,
  result: BenchmarkResult,
) {
  console.log("");
  console.log(`Benchmark target : ${target}`);
  console.log(`Iterations       : ${result.iterations}`);
  console.log(
    `Datafile         : ${datafileCounts.messages} messages, ${datafileCounts.segments} segments, ${datafileCounts.attributes} attributes`,
  );
  console.log(`Locale           : ${locale}`);
  console.log(`Evaluated value  : ${JSON.stringify(result.value)}`);
  console.log(`Total duration   : ${formatDuration(result.totalDuration)}`);
  console.log(`Min duration     : ${formatDuration(result.minDuration)}`);
  console.log(`Median duration  : ${formatDuration(result.medianDuration)}`);
  console.log(`Max duration     : ${formatDuration(result.maxDuration)}`);
  console.log(`Average duration : ${formatDuration(result.averageDuration)}`);
}

export const benchmarkPlugin: Plugin = {
  command: "benchmark",
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

      if (parsed.message && parsed.rawMessage) {
        throw new MessagevisorCLIError(
          "Pass either --message=<key> or --rawMessage=<message>, not both",
        );
      }

      if (!parsed.message && !parsed.rawMessage) {
        throw new MessagevisorCLIError("Pass --message=<key> or --rawMessage=<message>");
      }

      if (!parsed.locale) {
        throw new MessagevisorCLIError("Pass --locale=<locale>");
      }

      const target = parsed.target;
      const locale = parsed.locale;
      const iterations = parseIterationCount(parsed.n);
      const context = parsed.context ? parseJsonOption("--context", parsed.context) : {};
      const values = parsed.values ? parseJsonOption("--values", parsed.values) : undefined;
      const revision = await datasource.readRevision();
      const benchmarkSetup = await createBenchmarkMessagevisor({
        projectConfig,
        datasource,
        locale,
        context,
        target,
        revision,
        message: parsed.message,
      });
      const { messagevisor, datafileCounts } = benchmarkSetup;

      const result = parsed.message
        ? benchmarkIterations(
            () => messagevisor.translate(parsed.message, values, { context }),
            iterations,
          )
        : benchmarkIterations(
            () => messagevisor.formatMessage(parsed.rawMessage, values),
            iterations,
          );

      const output = {
        target: target || null,
        locale,
        context,
        values,
        message: parsed.message || undefined,
        rawMessage: parsed.rawMessage || undefined,
        datafileCounts,
        ...result,
      };

      if (parsed.json) {
        console.log(parsed.pretty ? JSON.stringify(output, null, 2) : JSON.stringify(output));
        return;
      }

      printBenchmarkSummary(parsed.message || parsed.rawMessage, locale, datafileCounts, result);
    } catch (error) {
      if (printMessagevisorCLIError(error, parsed)) {
        return false;
      }

      throw error;
    }
  },
  examples: [
    {
      command:
        'benchmark --message=auth.signin --locale=en-US --context=\'{"plan":"pro"}\' -n=1000',
      description: "benchmark a keyed message evaluation",
    },
    {
      command:
        'benchmark --message=dashboard.welcome --target=web --locale=en-US --values=\'{"name":"Ada"}\' -n=1000',
      description: "benchmark a target-specific keyed message evaluation with values",
    },
    {
      command:
        'benchmark --rawMessage="Hello {name}" --locale=en-US --values=\'{"name":"Ada"}\' -n=1000',
      description: "benchmark a raw message evaluation",
    },
  ],
};
