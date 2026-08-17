# Configuration

Messagevisor project configuration lives in `messagevisor.config.js` at the project root. Read it before changing source files, because it controls where the CLI looks, how files are parsed, which modules run, whether sets are enabled, and how keys are derived.

Configuration keys are strict: unsupported or misspelled keys are errors, not ignored metadata.

## Inspect first

```bash
npx messagevisor config --json --pretty
npx messagevisor info
```

If you are running the CLI from a different directory:

```bash
npx messagevisor --rootDirectoryPath=/absolute/path/to/project info
```

## Important options

| Option                       | What it changes                                                                                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `parser`                     | Source file parser. Built-ins are `yml` and `json`; custom parsers are supported.                                                                                        |
| `modules`                    | Runtime modules used by CLI evaluation, examples, tests, and Catalog examples.                                                                                           |
| `namespaceCharacter`         | Separator used when deriving message keys from paths. Default is `"."`.                                                                                                  |
| `exportOverrideKeySeparator` | Separator used for override row keys in CSV export/import. Default is `":"`.                                                                                             |
| `sets`                       | Enables `sets/<name>/...` project layout when `true`.                                                                                                                    |
| `promotionFlows`             | Restricts allowed `promote --from --to` directions.                                                                                                                      |
| `sourceLocale`               | Locale used as the authoring source for translation contract and staleness checks.                                                                                       |
| `lintIcu`                    | Enables ICU syntax and named format reference validation during linting. Default is `true`.                                                                              |
| `icuSkeleton`                | Allows inline ICU skeleton styles during linting when `true`.                                                                                                            |
| `catalogLayout`              | Catalog output layout: `files` by default, or `blocks` to consolidate large message detail output.                                                                       |
| `catalogBlockSize`           | Target size in bytes for a Catalog message block. Defaults to `262144`; valid values are from 16384 to 8388608.                                                          |
| `catalogBlockThreshold`      | Minimum messages in a set before block layout is used. Defaults to `500`.                                                                                                |
| `plugins`                    | Extra project-specific CLI commands (`{command, options, handler}`) appended to the built-ins. Use a unique command name and declare every accepted option in `options`. |

Parser types and the built-in parser registry come from `@messagevisor/parsers`. YAML editorial writes preserve comments and reuse unchanged YAML nodes so scalar styles, flow collections, anchors, aliases, tags, and directives remain intact where possible.

Directory options: `localesDirectoryPath`, `messagesDirectoryPath`, `attributesDirectoryPath`, `segmentsDirectoryPath`, `targetsDirectoryPath`, `testsDirectoryPath`, `datafilesDirectoryPath`, `catalogDirectoryPath`, `exportsDirectoryPath`.

For large Catalog exports, set `catalogLayout: "blocks"`. Message details are written to content-addressed blocks and loaded through a range table, reducing the number of files without changing the Catalog UI. `catalogBlockSize` and `catalogBlockThreshold` control the block policy. Leave the layout as `files` when individually addressable entity files are more useful for a host or workflow.

## Working rules

- Treat `messagevisor.config.js` as source. Generated `datafiles/` and `catalog/` are not source.
- Check whether the project uses sets before adding `--set` or moving directories.
- Do not casually change `namespaceCharacter`. It changes derived keys and can break imports, tests, codegen, SDK calls, and existing datafiles.
- Do not set `exportOverrideKeySeparator` to the same value as `namespaceCharacter`.
- Register formatting modules in both project config and application runtime. A CLI test can pass while the app renders differently if module setup differs.
- Keep `lintIcu: true` unless the project intentionally stores text that looks like ICU but should not be validated by Messagevisor linting.
- Set `sourceLocale` when the project tracks translation review state. Every base translation and override must then have source copy, and translated locales must preserve its ICU argument/tag contract.
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

ICU linting is on by default. Disable only the ICU-specific lint pass if the project intentionally needs it:

```js
module.exports = {
  lintIcu: false,
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

Definitions then live under `sets/<name>/messages`, `sets/<name>/locales`, and so on.

### Custom namespace character

```js
module.exports = {
  namespaceCharacter: "_",
};
```

This changes `messages/auth/signin.yml` to key `auth_signin`. Update all SDK calls, tests, and codegen after changing this.

## Verification

After config edits, run:

```bash
npx messagevisor lint
npx messagevisor test
npx messagevisor build
```

For sets projects, use `--set=<name>` when verifying one set. Run all sets before shipping.
