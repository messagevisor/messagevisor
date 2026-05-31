const base = require("../../jest.config");

module.exports = {
  ...base,
  rootDir: "../..",
  testRegex: undefined,
  testMatch: ["<rootDir>/packages/module-icu/src/**/*.spec.ts"],
  moduleNameMapper: {
    "^@messagevisor/sdk$": "<rootDir>/packages/sdk/src/index.ts",
  },
};
