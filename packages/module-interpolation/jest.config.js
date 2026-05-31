const base = require("../../jest.config");

module.exports = {
  ...base,
  rootDir: "../..",
  testRegex: undefined,
  testMatch: ["<rootDir>/packages/module-interpolation/src/**/*.spec.ts"],
  moduleNameMapper: {
    "^@messagevisor/sdk$": "<rootDir>/packages/sdk/src/index.ts",
    "^@messagevisor/module-icu$": "<rootDir>/packages/module-icu/src/index.ts",
  },
};
