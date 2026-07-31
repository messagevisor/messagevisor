const base = require("../../jest.config");

module.exports = {
  ...base,
  rootDir: "../..",
  setupFiles: ["<rootDir>/packages/catalog/src/testSetup.ts"],
  testRegex: undefined,
  testMatch: [
    "<rootDir>/packages/catalog/src/**/*.spec.ts",
    "<rootDir>/packages/catalog/src/**/*.spec.tsx",
  ],
};
