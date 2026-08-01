import * as fs from "fs";
import * as path from "path";

import { createMessagevisor, type MessageValues } from "@messagevisor/sdk";

import type { ProjectConfig } from "../config";
import type { Datasource } from "../datasource";
import { buildDatafile, resolveFormats } from "../builder";
import { evaluateSegment } from "../evaluate";
import { formatProjectPath } from "../path";
import {
  assertProjectSetJsonSelection,
  getProjectSetExecutions,
  getProjectSetRelativeFilePath,
} from "../sets";
import { CLI_FORMAT_BOLD, CLI_FORMAT_GREEN, CLI_FORMAT_RED } from "./cliFormat";
import {
  expandLocaleAssertions,
  expandMessageAssertions,
  expandTargetAssertions,
  expandSegmentAssertions,
} from "./matrix";
import { prettyDuration } from "./prettyDuration";
import { printTestResult } from "./printTestResult";
import type {
  TestAssertionError,
  TestProjectOptions,
  TestResult,
  TestResultAssertion,
} from "./types";

export interface TestFailure {
  test: string;
  message: string;
}

export interface TestProjectSetsOptions extends TestProjectOptions {
  set?: string;
}

interface TestProjectResult {
  hasError: boolean;
  results: TestResult[];
  failures: TestFailure[];
  assertionsCount: {
    passed: number;
    failed: number;
  };
  testsCount: {
    passed: number;
    failed: number;
  };
  duration: number;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function containsSubset(actual: unknown, expected: unknown): boolean {
  if (isPlainObject(expected)) {
    if (!isPlainObject(actual)) {
      return false;
    }

    return Object.keys(expected).every((key) => containsSubset(actual[key], expected[key]));
  }

  if (Array.isArray(expected)) {
    return (
      Array.isArray(actual) &&
      expected.length === actual.length &&
      expected.every((value, index) => containsSubset(actual[index], value))
    );
  }

  return actual === expected;
}

function normalizeTestValue(value: unknown): unknown {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
    const date = new Date(value);

    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }

  if (Array.isArray(value)) {
    return value.map(normalizeTestValue);
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, normalizeTestValue(entry)]),
    );
  }

  return value;
}

function createAssertion(description: string): TestResultAssertion {
  return {
    description,
    duration: 0,
    passed: true,
    errors: [],
  };
}

function failAssertion(assertion: TestResultAssertion, error: TestAssertionError) {
  assertion.passed = false;
  assertion.errors.push(error);
}

function shouldRunAssertion(description: string, options: TestProjectOptions) {
  if (!options.assertionPattern) {
    return true;
  }

  return new RegExp(options.assertionPattern).test(description);
}

function getAssertionPrefix(assertion: { assertionIndex?: number; matrixIndex?: number }) {
  if (typeof assertion.matrixIndex === "number") {
    return `Assertion #${(assertion.assertionIndex || 0) + 1}, matrix #${assertion.matrixIndex + 1}: `;
  }

  return "";
}

function getMessageAssertionDescription(messageKey: string, assertion: any) {
  if (assertion.description) {
    return assertion.description;
  }

  return `${getAssertionPrefix(assertion)}${assertion.target || "web"}/${assertion.locale}: ${messageKey}`;
}

function getSegmentAssertionDescription(testSegmentKey: string, assertion: any) {
  if (assertion.description) {
    return assertion.description;
  }

  return `${getAssertionPrefix(assertion)}${
    assertion.segment || testSegmentKey
  } with ${JSON.stringify(assertion.context || {})}`;
}

function getTargetAssertionDescription(targetKey: string, assertion: any) {
  if (assertion.description) {
    return assertion.description;
  }

  const hasStructureChecks =
    typeof assertion.expectedFormats !== "undefined" ||
    (assertion.expectedToIncludeMessages || []).length > 0 ||
    (assertion.expectedToNotIncludeMessages || []).length > 0;
  const hasEvaluation =
    typeof assertion.rawMessage !== "undefined" || typeof assertion.message !== "undefined";

  if (hasStructureChecks && hasEvaluation) {
    return `${getAssertionPrefix(assertion)}${targetKey}/${assertion.locale} structure + evaluation`;
  }

  if (hasEvaluation) {
    return `${getAssertionPrefix(assertion)}${targetKey}/${assertion.locale} evaluation`;
  }

  return `${getAssertionPrefix(assertion)}${targetKey}/${assertion.locale}`;
}

function getLocaleAssertionDescription(localeKey: string, assertion: any) {
  if (assertion.description) {
    return assertion.description;
  }

  const targetSuffix = assertion.target ? `/${assertion.target}` : "";
  const hasFormats = typeof assertion.expectedFormats !== "undefined";
  const hasEvaluation =
    typeof assertion.rawMessage !== "undefined" &&
    typeof assertion.expectedTranslation !== "undefined";

  if (hasFormats && hasEvaluation) {
    return `${getAssertionPrefix(assertion)}${localeKey}${targetSuffix} formats + evaluation`;
  }

  if (hasEvaluation) {
    return `${getAssertionPrefix(assertion)}${localeKey}${targetSuffix} evaluation`;
  }

  return `${getAssertionPrefix(assertion)}${localeKey}${targetSuffix} formats`;
}

function getTestFilePath(projectConfig: ProjectConfig, testKey: string) {
  const extension = (projectConfig.parser as any).extension || "yml";
  const basePath = path.join(
    projectConfig.testsDirectoryPath,
    ...testKey.split(projectConfig.namespaceCharacter),
  );
  const specPath = `${basePath}.spec.${extension}`;
  const legacyPath = `${basePath}.${extension}`;

  return formatProjectPath(projectConfig, fs.existsSync(specPath) ? specPath : legacyPath);
}

async function runTest(
  projectConfig: ProjectConfig,
  datasource: Datasource,
  testKey: string,
  test: any,
  revision: string,
  options: TestProjectOptions,
): Promise<TestResult | undefined> {
  const startTime = Date.now();
  const type: TestResult["type"] = test.message
    ? "message"
    : test.segment
      ? "segment"
      : test.target
        ? "target"
        : "locale";
  const subject = test.message || test.segment || test.target || test.locale;
  const filePath = getTestFilePath(projectConfig, testKey);
  const result: TestResult = {
    key: testKey,
    filePath,
    type,
    subject,
    duration: 0,
    passed: true,
    assertions: [],
  };

  if (test.message) {
    for (const rawAssertion of expandMessageAssertions(test.assertions || [])) {
      const description = getMessageAssertionDescription(test.message, rawAssertion);
      if (!shouldRunAssertion(description, options)) continue;

      const assertionStartTime = Date.now();
      const assertion = createAssertion(description);
      const target = rawAssertion.target || "web";
      const datafile = await buildDatafile(
        projectConfig,
        datasource,
        target,
        rawAssertion.locale,
        revision,
      );

      if (options.showDatafile) {
        console.log("");
        console.log(JSON.stringify(datafile, null, 2));
        console.log("");
      }

      const flags = rawAssertion.withFlags || {};
      const variations = rawAssertion.withVariations || {};
      const messagevisor = createMessagevisor({
        datafile,
        context: rawAssertion.context,
        resolveFlag: (featureKey) => flags[featureKey] === true,
        resolveVariation: (experimentKey) => variations[experimentKey],
        modules: projectConfig.modules || [],
        logLevel: "warn",
      });
      const actual = messagevisor.translate(
        test.message,
        normalizeTestValue(rawAssertion.values) as MessageValues<string>,
        {
          context: rawAssertion.context,
          currency: rawAssertion.currency,
          timeZone: rawAssertion.timeZone,
          formats: rawAssertion.formats,
        },
      );

      if (actual !== rawAssertion.expectedTranslation) {
        failAssertion(assertion, {
          message: "Translation mismatch",
          expected: rawAssertion.expectedTranslation,
          actual,
        });
      }

      assertion.duration = Date.now() - assertionStartTime;
      result.assertions.push(assertion);
    }
  }

  if (test.segment) {
    const segmentKeys = await datasource.listSegments();
    const segments = Object.fromEntries(
      await Promise.all(segmentKeys.map(async (key) => [key, await datasource.readSegment(key)])),
    );

    for (const rawAssertion of expandSegmentAssertions(test.assertions || [])) {
      const description = getSegmentAssertionDescription(test.segment, rawAssertion);
      if (!shouldRunAssertion(description, options)) continue;

      const assertionStartTime = Date.now();
      const assertion = createAssertion(description);
      const actual = evaluateSegment(rawAssertion.segment || test.segment, {
        segments,
        context: rawAssertion.context,
      });

      if (actual !== rawAssertion.expectedToMatch) {
        failAssertion(assertion, {
          message: "Segment match mismatch",
          expected: rawAssertion.expectedToMatch,
          actual,
        });
      }

      assertion.duration = Date.now() - assertionStartTime;
      result.assertions.push(assertion);
    }
  }

  if (test.target) {
    for (const rawAssertion of expandTargetAssertions(test.assertions || [])) {
      const description = getTargetAssertionDescription(test.target, rawAssertion);
      if (!shouldRunAssertion(description, options)) continue;

      const assertionStartTime = Date.now();
      const assertion = createAssertion(description);
      const datafile = await buildDatafile(
        projectConfig,
        datasource,
        test.target,
        rawAssertion.locale,
        revision,
      );

      if (options.showDatafile) {
        console.log("");
        console.log(JSON.stringify(datafile, null, 2));
        console.log("");
      }

      const translationKeys = Object.keys(datafile.translations);

      for (const messageKey of rawAssertion.expectedToIncludeMessages || []) {
        if (!translationKeys.includes(messageKey)) {
          failAssertion(assertion, {
            message: `Expected datafile to include message "${messageKey}"`,
            expected: true,
            actual: false,
          });
        }
      }

      for (const messageKey of rawAssertion.expectedToNotIncludeMessages || []) {
        if (translationKeys.includes(messageKey)) {
          failAssertion(assertion, {
            message: `Expected datafile to not include message "${messageKey}"`,
            expected: false,
            actual: true,
          });
        }
      }

      if (
        rawAssertion.expectedFormats &&
        !containsSubset(datafile.formats || {}, rawAssertion.expectedFormats)
      ) {
        failAssertion(assertion, {
          message: "Formats subset mismatch",
          expected: rawAssertion.expectedFormats,
          actual: datafile.formats || {},
        });
      }

      if (
        typeof rawAssertion.rawMessage !== "undefined" ||
        typeof rawAssertion.message !== "undefined"
      ) {
        const messagevisor = createMessagevisor({
          datafile,
          locale: rawAssertion.locale,
          context: rawAssertion.context as any,
          modules: projectConfig.modules || [],
          logLevel: "warn",
        });
        const values = normalizeTestValue(rawAssertion.values) as MessageValues<string>;
        const actual =
          typeof rawAssertion.rawMessage !== "undefined"
            ? messagevisor.formatMessage(rawAssertion.rawMessage, values, {
                formats: rawAssertion.formats,
                currency: rawAssertion.currency,
                timeZone: rawAssertion.timeZone,
              })
            : messagevisor.translate<string>(rawAssertion.message as string, values, {
                context: rawAssertion.context as any,
                formats: rawAssertion.formats,
                currency: rawAssertion.currency,
                timeZone: rawAssertion.timeZone,
              });

        if (actual !== rawAssertion.expectedTranslation) {
          failAssertion(assertion, {
            message: "Translation mismatch",
            expected: rawAssertion.expectedTranslation,
            actual,
          });
        }
      }

      assertion.duration = Date.now() - assertionStartTime;
      result.assertions.push(assertion);
    }
  }

  if (test.locale) {
    const [localeKeys, targetKeys] = await Promise.all([
      datasource.listLocales(),
      datasource.listTargets(),
    ]);
    const [locales, targets] = await Promise.all([
      Promise.all(localeKeys.map(async (key) => [key, await datasource.readLocale(key)])),
      Promise.all(targetKeys.map(async (key) => [key, await datasource.readTarget(key)])),
    ]);
    const localesByKey = Object.fromEntries(locales);
    const targetsByKey = Object.fromEntries(targets);

    for (const rawAssertion of expandLocaleAssertions(test.assertions || [])) {
      const description = getLocaleAssertionDescription(test.locale, rawAssertion);
      if (!shouldRunAssertion(description, options)) continue;

      const assertionStartTime = Date.now();
      const assertion = createAssertion(description);
      const target = rawAssertion.target ? targetsByKey[rawAssertion.target] : undefined;
      const formats = resolveFormats(test.locale, localesByKey, target);

      if (options.showDatafile) {
        console.log("");
        console.log(JSON.stringify(formats || {}, null, 2));
        console.log("");
      }

      if (
        rawAssertion.expectedFormats &&
        !containsSubset(formats || {}, rawAssertion.expectedFormats)
      ) {
        failAssertion(assertion, {
          message: "Formats subset mismatch",
          expected: rawAssertion.expectedFormats,
          actual: formats || {},
        });
      }

      if (typeof rawAssertion.rawMessage !== "undefined") {
        const messagevisor = createMessagevisor({
          locale: test.locale,
          context: rawAssertion.context as any,
          defaultFormats: {
            [test.locale]: formats || {},
          },
          modules: projectConfig.modules || [],
          logLevel: "warn",
        });
        const actual = messagevisor.formatMessage(
          rawAssertion.rawMessage,
          normalizeTestValue(rawAssertion.values) as MessageValues,
          {
            formats: rawAssertion.formats,
            currency: rawAssertion.currency,
            timeZone: rawAssertion.timeZone,
          },
        );

        if (actual !== rawAssertion.expectedTranslation) {
          failAssertion(assertion, {
            message: "Translation mismatch",
            expected: rawAssertion.expectedTranslation,
            actual,
          });
        }
      }

      assertion.duration = Date.now() - assertionStartTime;
      result.assertions.push(assertion);
    }
  }

  result.passed = result.assertions.every((assertion) => assertion.passed);
  result.duration = Date.now() - startTime;

  if (result.assertions.length === 0) {
    return undefined;
  }

  return result;
}

export async function testProject(
  projectConfig: ProjectConfig,
  datasource: Datasource,
  options: TestProjectOptions = {},
): Promise<TestProjectResult> {
  const startTime = Date.now();
  const testKeys = await datasource.listTests();
  const keyPattern = options.keyPattern ? new RegExp(options.keyPattern) : null;
  const revision = await datasource.readRevision();
  const results: TestResult[] = [];

  for (const testKey of testKeys) {
    if (keyPattern && !keyPattern.test(testKey)) {
      continue;
    }

    const test = (await datasource.readTest(testKey)) as any;
    const result = await runTest(projectConfig, datasource, testKey, test, revision, options);

    if (!result) {
      continue;
    }

    results.push(result);
  }

  const failures = results.flatMap((result) =>
    result.assertions
      .filter((assertion) => !assertion.passed)
      .flatMap((assertion) =>
        assertion.errors.map((error) => ({
          test: result.key,
          message: `${assertion.description} - ${error.message}`,
        })),
      ),
  );
  const passedAssertions = results.reduce(
    (sum, result) => sum + result.assertions.filter((assertion) => assertion.passed).length,
    0,
  );
  const failedAssertions = results.reduce(
    (sum, result) => sum + result.assertions.filter((assertion) => !assertion.passed).length,
    0,
  );
  const passedTests = results.filter((result) => result.passed).length;
  const failedTests = results.filter((result) => !result.passed).length;

  return {
    hasError: failures.length > 0,
    results,
    failures,
    assertionsCount: {
      passed: passedAssertions,
      failed: failedAssertions,
    },
    testsCount: {
      passed: passedTests,
      failed: failedTests,
    },
    duration: Date.now() - startTime,
  };
}

export async function testProjectSets(
  projectConfig: ProjectConfig,
  datasource: Datasource,
  options: TestProjectSetsOptions = {},
): Promise<TestProjectResult> {
  const startTime = Date.now();
  const setExecutions = await getProjectSetExecutions(projectConfig, datasource, options.set);
  const results: TestResult[] = [];

  for (const execution of setExecutions) {
    const result = await testProject(execution.projectConfig, execution.datasource, options);

    results.push(
      ...result.results.map((testResult) => ({
        ...testResult,
        key: projectConfig.sets ? `${execution.set}/${testResult.key}` : testResult.key,
        filePath: projectConfig.sets
          ? getProjectSetRelativeFilePath(projectConfig, execution.set, testResult.filePath)
          : testResult.filePath,
      })),
    );
  }

  const failures = results.flatMap((result) =>
    result.assertions
      .filter((assertion) => !assertion.passed)
      .flatMap((assertion) =>
        assertion.errors.map((error) => ({
          test: result.key,
          message: `${assertion.description} - ${error.message}`,
        })),
      ),
  );
  const passedAssertions = results.reduce(
    (sum, result) => sum + result.assertions.filter((assertion) => assertion.passed).length,
    0,
  );
  const failedAssertions = results.reduce(
    (sum, result) => sum + result.assertions.filter((assertion) => !assertion.passed).length,
    0,
  );
  const passedTests = results.filter((result) => result.passed).length;
  const failedTests = results.filter((result) => !result.passed).length;

  return {
    hasError: failures.length > 0,
    results,
    failures,
    assertionsCount: {
      passed: passedAssertions,
      failed: failedAssertions,
    },
    testsCount: {
      passed: passedTests,
      failed: failedTests,
    },
    duration: Date.now() - startTime,
  };
}

function printSummary(result: TestProjectResult, options: TestProjectOptions) {
  if (options.onlyFailures !== true || result.hasError) {
    console.log("\n---");
  }

  console.log("");

  const testSpecsMessage = `Test specs: ${result.testsCount.passed} passed, ${result.testsCount.failed} failed`;
  const testAssertionsMessage = `Assertions: ${result.assertionsCount.passed} passed, ${result.assertionsCount.failed} failed`;

  if (result.hasError) {
    console.log(CLI_FORMAT_RED, testSpecsMessage);
    console.log(CLI_FORMAT_RED, testAssertionsMessage);
  } else {
    console.log(CLI_FORMAT_GREEN, testSpecsMessage);
    console.log(CLI_FORMAT_GREEN, testAssertionsMessage);
  }

  console.log(CLI_FORMAT_BOLD, `Time:       ${prettyDuration(result.duration)}`);
}

export const testPlugin = {
  command: "test",
  handler: async ({ projectConfig, datasource, parsed }: any) => {
    assertProjectSetJsonSelection(projectConfig, parsed.set, parsed.json);

    const result = await testProjectSets(
      projectConfig,
      datasource,
      parsed as TestProjectSetsOptions,
    );

    if (parsed.json) {
      console.log(
        parsed.pretty ? JSON.stringify(result.failures, null, 2) : JSON.stringify(result.failures),
      );
      return !result.hasError;
    }

    for (const testResult of result.results) {
      if (parsed.onlyFailures && testResult.passed) {
        continue;
      }

      printTestResult(testResult);
    }

    printSummary(result, parsed as TestProjectOptions);

    return !result.hasError;
  },
  examples: [
    { command: "test", description: "run all tests" },
    { command: "test --keyPattern=pattern", description: "run tests matching key pattern" },
    { command: "test --assertionPattern=pattern", description: "run assertions matching pattern" },
    { command: "test --onlyFailures", description: "only print failed tests" },
    { command: "test --showDatafile", description: "show datafile content for each assertion" },
    { command: "test --verbose", description: "show verbose test output" },
    { command: "test --json --pretty", description: "print failures as JSON" },
  ],
};
