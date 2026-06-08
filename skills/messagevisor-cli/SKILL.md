---
name: messagevisor-cli
description: "Use this skill when running, debugging, or scripting `npx messagevisor` commands. Trigger on CLI usage, CI checks, init, config, info, lint, list, find-duplicates, create, examples, evaluate, benchmark, build, test, export, import, generate-code, prune, promote, or catalog."
---

# Messagevisor CLI

Run commands inside a Messagevisor project:

```sh
npx messagevisor <command> [options]
```

The global `--rootDirectoryPath=/absolute/path` option makes the CLI resolve the project from that path even when the current shell is elsewhere.

Use `--json --pretty` for agent-readable output when a command supports it. Many commands also support `--set=<name>` in `sets: true` projects.

## Agent workflow

Fast loop while editing:

```sh
npx messagevisor lint
npx messagevisor evaluate --message=<key> --locale=<locale> --target=<target>
npx messagevisor test --keyPattern=<key-or-area>
npx messagevisor build --target=<target> --locale=<locale>
```

Broader project loop:

```sh
npx messagevisor lint
npx messagevisor test
npx messagevisor build --showSize
npx messagevisor catalog
```

Never edit `datafiles/` or `catalog/` as source. They are generated.

## Project setup and inspection

### `init`

Creates a starter project. It is the only built-in command that does not require an existing Messagevisor project.

```sh
npx messagevisor init
npx messagevisor init --project=json
npx messagevisor init --project=environments
npx messagevisor init --overwrite
```

If the current directory is not empty, `init` may prompt for a child directory. `--overwrite` initializes in the current directory, but conflicting files are skipped rather than replaced.

### `config`

Prints resolved config, including path overrides and normalized defaults.

```sh
npx messagevisor config
npx messagevisor config --json --pretty
```

Use this before assuming where files live, which parser is active, whether `sets: true` is enabled, or which modules are configured.

### `info`

Shows quick entity counts.

```sh
npx messagevisor info
```

Use it after imports, promotions, or broad file changes as a cheap sanity check.

## Listing and scaffolding

### `list`

Lists one entity class at a time:

```sh
npx messagevisor list --messages
npx messagevisor list --messages --target=web
npx messagevisor list --messages --locale=en-US --withoutOverrides
npx messagevisor list --locales --withFormats
npx messagevisor list --targets --locale=en-US
npx messagevisor list --segments --archived=false
npx messagevisor list --attributes --type=string
npx messagevisor list --tests --applyMatrix --json
```

Common filters:

- `--keyPattern=<regex>`
- `--description=<regex>`
- `--withTests` and `--withoutTests`, except attributes
- `--archived=true|false`
- `--promotable=true|false`

Message-specific filters include `--deprecated`, `--withOverrides`, `--withoutOverrides`, `--withMeta`, `--withoutMeta`, `--locale`, and one or more `--target` values. Locale filters include `--withFormats`, `--withoutFormats`, `--inheritFormatsFrom`, and `--inheritTranslationsFrom`. Target filters include `--locale`, `--withContext`, `--withoutContext`, `--withFormats`, and `--withoutFormats`.

In sets projects, JSON output requires selecting one set.

### `create`

Creates minimal entity files from newline-separated keys.

```sh
npx messagevisor create --messages --keys=$'auth.signin\nauth.signout'
npx messagevisor create --locales --keys=$'en\nnl'
npx messagevisor create --attributes --keys=$'plan\nplatform'
printf "web\nadmin\n" | npx messagevisor create --targets
```

Pass exactly one of `--messages`, `--locales`, `--targets`, `--attributes`, or `--segments`. Existing keys are skipped. In sets projects, pass `--set=<name>`.

Use `create` to scaffold, then edit the generated files. It creates shells, not production-ready copy or schema design.

## Validation and debugging

### `lint`

Validates source definitions and cross-references.

```sh
npx messagevisor lint
npx messagevisor lint --set=staging
npx messagevisor lint --json --pretty
```

Lint checks structure, references, conditions, format shapes, tests, namespace/separator constraints, and ICU named format references when ICU is configured. It does not prove runtime behavior or copy quality.

### `examples`

Resolves authored message and locale examples.

```sh
npx messagevisor examples
npx messagevisor examples --locale=en-US
npx messagevisor examples --onlyMessages
npx messagevisor examples --onlyLocales
npx messagevisor examples --exampleIndex=2 --matrixIndex=3
npx messagevisor examples --descriptionPattern=welcome --translationPattern=adult
npx messagevisor examples --json --pretty
```

Use examples for human-readable review scenarios and matrix-expanded demonstrations. Use tests for pass/fail guarantees.

### `evaluate`

Use `evaluate` as the fastest feedback loop while authoring. It answers "does this one thing render or match the way I expect?" without opening the Catalog or writing a test first.

```sh
npx messagevisor evaluate --message=checkout.total --locale=en-US --target=web --values='{"amount":42}'
npx messagevisor evaluate --message=checkout.banner --locale=en-US --context='{"plan":"pro"}'
npx messagevisor evaluate --rawMessage='{count, plural, one {# item} other {# items}}' --locale=en-US --values='{"count":2}'
npx messagevisor evaluate --segment=paid-users --context='{"plan":"pro"}'
npx messagevisor evaluate --message=checkout.total --locale=en-US --target=web --json --pretty
```

Use `--message` for a real message key, translation inheritance, target inclusion, overrides, values, formats, and configured modules. Use `--rawMessage` for locale formats, ICU syntax, interpolation, or module behavior without a message file. Use `--segment` for condition logic before layering it into an override.

Rules:

- Pass either `--message`, `--rawMessage`, or `--segment`.
- `--message` and `--rawMessage` require `--locale`.
- `--segment` does not need `--locale`.
- `--values` and `--context` must be valid JSON.
- In sets projects, pass `--set=<name>`.

### `test`

Runs project tests for messages, segments, locales, and targets.

```sh
npx messagevisor test
npx messagevisor test --set=dev
npx messagevisor test --keyPattern=welcome
npx messagevisor test --assertionPattern=evaluation
npx messagevisor test --onlyFailures
npx messagevisor test --showDatafile
npx messagevisor test --verbose
npx messagevisor test --json --pretty
```

Use `--showDatafile` for target assertions and target-specific debugging. Use `--onlyFailures` to keep noisy suites readable. Matrix-expanded assertions are filtered after expansion.

### `benchmark`

Measures repeated message or raw-message evaluation.

```sh
npx messagevisor benchmark --message=auth.signin --locale=en-US --context='{"plan":"pro"}' -n=1000
npx messagevisor benchmark --message=dashboard.welcome --target=web --locale=en-US --values='{"name":"Ada"}' -n=1000
npx messagevisor benchmark --rawMessage='Hello {name}' --locale=en-US --values='{"name":"Ada"}' -n=1000
npx messagevisor benchmark --message=dashboard.welcome --locale=en-US --json --pretty
```

Use benchmark only after `evaluate` proves the behavior is correct. Keep target, locale, values, context, modules, and iteration count stable when comparing runs.

## Build and generated artifacts

### `build`

Generates runtime datafiles.

```sh
npx messagevisor build
npx messagevisor build --target=web --locale=en-US
npx messagevisor build --set=production
npx messagevisor build --showSize
npx messagevisor build --json --pretty
```

Build resolves translation inheritance, style-level format inheritance, target format overlays, target message filters, target context, overrides, and target datafile options. `pretty`, `stringify`, and `revisionFromHash` are target options, not build flags.

Use `--noStateFiles` only when you intentionally want a build that does not read or update Messagevisor state files.

### `generate-code`

Generates typed helpers from project messages.

```sh
npx messagevisor generate-code --language typescript --out-dir src/generated
npx messagevisor generate-code --language typescript --out-dir src/generated --react
npx messagevisor generate-code --language typescript --out-dir src/generated --target=web
npx messagevisor generate-code --language typescript --out-dir src/generated --includeMessages='auth*'
```

Currently supported language is `typescript`. Options include `--set`, `--target`, `--includeMessages`, `--excludeMessages`, and `--react`. Regenerate after message key changes.

### `catalog`

Works with the generated static Catalog.

```sh
npx messagevisor catalog
npx messagevisor catalog --with-translation-search
npx messagevisor catalog --with-duplicates
npx messagevisor catalog export
npx messagevisor catalog export --with-translation-search
npx messagevisor catalog export --with-duplicates
npx messagevisor catalog export --hashRouter
npx messagevisor catalog serve
npx messagevisor catalog serve --hashRouter
```

`catalog` builds, serves, watches, and live-reloads for development. `catalog export` generates static files and exits. `catalog serve` only serves already generated files.

Translation-value search is opt-in with `--with-translation-search`. Locale duplicate reports are opt-in with `--with-duplicates`. Use those flags with `catalog` or `catalog export`; `catalog serve` cannot add missing generated data.

## Translation exchange and cleanup

### `export`

Exports translations to CSV.

```sh
npx messagevisor export
npx messagevisor export --locale=en-US --target=web
npx messagevisor export --locale=en --locale=nl-NL --target=web --output=exports/nl-NL-web.csv
npx messagevisor export --locale=en --locale=de --onlyUntranslated --print
```

Useful options include `--includeMessages`, `--excludeMessages`, `--excludeOverrides`, `--withoutDescription`, `--withoutStatus`, `--onlyUntranslated`, `--onlyDirectlyUntranslated`, `--output`, `--force`, `--delimiter`, `--bom`, and `--lineEnding=lf|crlf`.

Repeated `--locale` is useful for source plus target handoff files. Target filters apply before rows are emitted.

### `import`

Imports translations from CSV or from a flat JSON object with `--from-json`.

```sh
npx messagevisor import exports/nl-NL-web.csv
npx messagevisor import exports/nl-NL-web.csv --locale=nl-NL --apply
npx messagevisor import exports/en-GB-web.csv --locale=en-GB --prune
npx messagevisor import vendor/new-copy.csv --create-missing
npx messagevisor import translations.json --from-json --locale=nl-NL
npx messagevisor import payload.json --from-json --json-path=data.translations --locale=nl-NL --apply
```

Import previews by default. Use `--apply` only after reviewing the plan. Use `--create-missing` only when unknown rows are meant to create messages or overrides; `--createMissing` is also accepted. JSON import expects exactly one locale, and in sets projects it requires exactly one `--set=<name>`.

Use `--prune` when imported values matching inherited translations should be skipped or removed as direct overrides.

### `find-duplicates`

Finds active messages that resolve to the same translation value.

```sh
npx messagevisor find-duplicates
npx messagevisor find-duplicates --locale=en-US
npx messagevisor find-duplicates --set=staging
npx messagevisor find-duplicates --locale=en-US --json --pretty
```

Duplicate detection compares resolved translations after inheritance. It ignores overrides, archived messages, and empty values.

### `prune`

Previews and applies cleanup of stale authoring data.

```sh
npx messagevisor prune --translations
npx messagevisor prune --translations --target=web
npx messagevisor prune --translations --target=web --apply
npx messagevisor prune --formats --locale=en-US
npx messagevisor prune --formats --locale=en-US --apply
```

Preview first. `prune --formats` compares whole style objects. It must not remove individual inherited style properties from a child style override.

## Sets and promotion

### `promote`

Copies changes from one set to another in `sets: true` projects.

```sh
npx messagevisor promote --from=dev --to=staging
npx messagevisor promote --from=dev --to=staging --target=web
npx messagevisor promote --from=dev --to=staging --locale=nl-NL
npx messagevisor promote --from=dev --to=staging --excludeOverrides
npx messagevisor promote --from=dev --to=staging --conflicts=fail
npx messagevisor promote --from=dev --to=staging --showUnchanged
npx messagevisor promote --from=dev --to=staging --apply
npx messagevisor promote --from=dev --to=staging --apply --audit=markdown
```

Promotion previews by default. `--apply` writes destination files. `--audit=json|markdown` writes an audit file only with `--apply`. `promotionFlows` in config can restrict allowed directions.

Conflict modes include `source`, `destination`, and `fail`. Choose deliberately; promotion can merge arrays and objects, not just copy files.

## Troubleshooting recipes

### Translation looks wrong

```sh
npx messagevisor evaluate --message=<key> --target=<target> --locale=<locale> --context='<json>' --values='<json>'
npx messagevisor test --keyPattern=<key> --onlyFailures
npx messagevisor build --target=<target> --locale=<locale>
```

Check modules, target inclusion, locale inheritance, overrides, and target context in that order.

### Target seems to miss a message

```sh
npx messagevisor list --messages --target=<target>
npx messagevisor build --target=<target> --locale=<locale>
npx messagevisor test --keyPattern=<target-or-message> --showDatafile
```

If using sets, add `--set=<name>` and make sure the target exists in that set.

### Translator import needs review

```sh
npx messagevisor import translations.csv --locale=<locale>
npx messagevisor import translations.csv --locale=<locale> --apply
npx messagevisor lint
npx messagevisor test
npx messagevisor catalog
```

Preview before apply. Do not use `--create-missing` unless the file is meant to create new entries.
