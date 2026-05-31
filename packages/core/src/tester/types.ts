export interface TestAssertionError {
  message: string;
  expected?: unknown;
  actual?: unknown;
}

export interface TestResultAssertion {
  description: string;
  duration: number;
  passed: boolean;
  errors: TestAssertionError[];
}

export interface TestResult {
  key: string;
  filePath: string;
  type: "message" | "segment" | "target" | "locale";
  subject: string;
  duration: number;
  passed: boolean;
  assertions: TestResultAssertion[];
}

export interface TestProjectOptions {
  keyPattern?: string;
  assertionPattern?: string;
  verbose?: boolean;
  showDatafile?: boolean;
  onlyFailures?: boolean;
  json?: boolean;
  pretty?: boolean;
}
