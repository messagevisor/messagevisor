---
name: messagevisor-configuration
description: "Use this skill when changing or diagnosing `messagevisor.config.js`, custom project paths, parsers, modules, namespace settings, sets, promotion flows, or root-directory CLI behavior."
---

# Messagevisor configuration

Messagevisor project configuration lives in `messagevisor.config.js` at the project root. Read it before changing source files, because it controls where the CLI looks, how files are parsed, which modules run, whether sets are enabled, and how keys are derived.

## Inspect first

```sh
npx messagevisor config --json --pretty
npx messagevisor info
```

If you are running the CLI from a different directory, use:

```sh
npx messagevisor --rootDirectoryPath=/absolute/path/to/project info
```

The CLI should use the installed command from the current shell context, but resolve the Messagevisor project from `--rootDirectoryPath`.

## Important options

| Option | What it changes |
| --- | --- |
| `parser` | Source file parser. Built-ins are `yml` and `json`; custom parsers are supported. |
| `modules` | Runtime modules used by CLI evaluation, examples, tests, and Catalog examples. |
| `namespaceCharacter` | Separator used when deriving message keys from paths. Default is `"."`. |
| `exportOverrideKeySeparator` | Separator used for override row keys in CSV export/import. Default is `":"`. |
| `sets` | Enables `sets/<name>/...` project layout when `true`. |
| `promotionFlows` | Restricts allowed `promote --from --to` directions. |
| `icuSkeleton` | Allows inline ICU skeleton styles during linting when `true`. |

Directory options include `localesDirectoryPath`, `messagesDirectoryPath`, `attributesDirectoryPath`, `segmentsDirectoryPath`, `targetsDirectoryPath`, `testsDirectoryPath`, `datafilesDirectoryPath`, `catalogDirectoryPath`, and `exportsDirectoryPath`.

## Working rules

- Treat `messagevisor.config.js` as source. Generated `datafiles/` and `catalog/` are not source.
- Check whether the project uses sets before adding `--set` or moving directories.
- Do not casually change `namespaceCharacter`. It changes derived keys and can break imports, tests, codegen, SDK calls, and existing datafiles.
- Do not set `exportOverrideKeySeparator` to the same value as `namespaceCharacter`.
- Register formatting modules in both project config and application runtime. A CLI test can pass while the app renders differently if module setup differs.
- Prefer named locale formats over enabling `icuSkeleton` unless inline ICU skeleton syntax is intentional.
- If paths are customized, use the resolved config output instead of assuming default directories.

## Common edits

### Enable ICU

```js
const { createICUModule } = require("@messagevisor/module-icu");

module.exports = {
  modules: [createICUModule()],
};
```

If the project intentionally uses inline skeleton styles such as `{amount, number, ::currency/USD}`, also set:

```js
module.exports = {
  icuSkeleton: true,
};
```

### Enable sets

```js
module.exports = {
  sets: true,
  promotionFlows: [
    { from: "dev", to: "staging" },
    { from: "staging", to: "production" },
  ],
};
```

Definitions then live under `sets/<name>/messages`, `sets/<name>/locales`, and the other entity directories.

## Verification

After config edits, run:

```sh
npx messagevisor lint
npx messagevisor test
npx messagevisor build
```

For sets projects, use `--set=<name>` when you only need to verify one set. Run all sets before shipping.
