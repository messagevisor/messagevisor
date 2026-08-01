const base = require("../../jest.config");

module.exports = {
  ...base,
  rootDir: "../..",
  moduleNameMapper: {
    ...base.moduleNameMapper,
    "^@messagevisor/sdk$": "<rootDir>/packages/sdk/src/index.ts",
  },
  testRegex: undefined,
  testMatch: ["<rootDir>/packages/core/src/**/*.spec.ts"],
};
