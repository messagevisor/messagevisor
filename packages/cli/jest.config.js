const base = require("../../jest.config");

module.exports = {
  ...base,
  rootDir: "../..",
  testRegex: undefined,
  testMatch: ["<rootDir>/packages/cli/src/**/*.spec.ts"],
};
