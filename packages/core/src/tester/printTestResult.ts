import { CLI_FORMAT_BOLD, CLI_FORMAT_RED } from "./cliFormat";
import { prettyDuration } from "./prettyDuration";
import type { TestResult } from "./types";

export function printTestResult(testResult: TestResult) {
  console.log("");
  console.log(`Testing: ${testResult.key} (${prettyDuration(testResult.duration)})`);

  console.log(CLI_FORMAT_BOLD, `  ${testResult.type} "${testResult.subject}":`);

  testResult.assertions.forEach((assertion) => {
    if (assertion.passed) {
      console.log(`  ✔ ${assertion.description} (${prettyDuration(assertion.duration)})`);
      return;
    }

    console.log(
      CLI_FORMAT_RED,
      `  ✘ ${assertion.description} (${prettyDuration(assertion.duration)})`,
    );
    console.log(CLI_FORMAT_RED, `    ${testResult.filePath}`);

    assertion.errors.forEach((error) => {
      console.log(CLI_FORMAT_RED, `    => ${error.message}`);

      if (typeof error.expected !== "undefined" || typeof error.actual !== "undefined") {
        console.log(CLI_FORMAT_RED, `       expected: ${formatValue(error.expected)}`);
        console.log(CLI_FORMAT_RED, `       received: ${formatValue(error.actual)}`);
      }
    });
  });
}

function formatValue(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value);
}
