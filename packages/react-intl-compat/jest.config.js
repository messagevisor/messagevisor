const base = require("../../jest.config");

module.exports = {
  ...base,
  rootDir: __dirname,
  testEnvironment: "jsdom",
  testRegex: undefined,
  testMatch: ["<rootDir>/src/**/*.spec.ts", "<rootDir>/src/**/*.spec.tsx"],
  moduleNameMapper: {
    "^@messagevisor/sdk$": "<rootDir>/../sdk/src/index.ts",
    "^@messagevisor/react$": "<rootDir>/../react/src/index.ts",
    "^@messagevisor/module-icu$": "<rootDir>/../module-icu/src/index.ts",
  },
};
