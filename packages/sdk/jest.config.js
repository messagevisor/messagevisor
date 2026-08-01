const base = require("../../jest.config");

module.exports = {
  ...base,
  rootDir: "../..",
  testRegex: undefined,
  testMatch: ["<rootDir>/packages/sdk/src/**/*.spec.ts"],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
};
