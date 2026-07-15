/** @type import('jest').Config */
module.exports = {
  roots: ["<rootDir>"],
  transform: {
    "^.+\\.(ts|tsx)$": [
      "@swc/jest",
      {
        sourceMaps: "inline",
        module: {
          type: "commonjs",
        },
        jsc: {
          target: "es2021",
          parser: {
            syntax: "typescript",
            tsx: true,
            decorators: false,
          },
          transform: {
            react: {
              runtime: "classic",
            },
          },
        },
      },
    ],
  },
  testRegex: "\\.spec\\.(ts|tsx)$",
  moduleFileExtensions: ["ts", "tsx", "js", "json", "node"],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  collectCoverage: false,
  bail: true,
};
