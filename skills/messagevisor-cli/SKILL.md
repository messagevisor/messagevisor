---
name: messagevisor-cli
description: "Use this skill when running, debugging, or scripting `npx messagevisor` commands. Trigger on CLI usage, CI checks, init, config, info, lint, list, find-duplicates, create, examples, evaluate, benchmark, build, test, export, import, generate-code, prune, promote, or catalog."
---

# Messagevisor CLI

Run commands inside a Messagevisor project:

```sh
npx messagevisor <command> [options]
```

Common output flags are `--json`, `--pretty`, and `--verbose` where supported.

## Daily authoring

```sh
npx messagevisor lint
npx messagevisor test
npx messagevisor build
npx messagevisor catalog
```

## Project inspection

```sh
npx messagevisor config
npx messagevisor config --json --pretty
npx messagevisor info
npx messagevisor list --messages
npx messagevisor list --messages --target=web
npx messagevisor list --locales
npx messagevisor list --segments
npx messagevisor list --attributes
npx messagevisor list --targets
```

Useful list filters include `--keyPattern`, `--description`, `--withTests`, `--withoutTests`, `--archived=true|false`, and `--promotable=true|false`. Multiple `--target` values return the union of included messages.

## Debugging output

```sh
npx messagevisor examples
npx messagevisor examples --locale=en-US
npx messagevisor examples --onlyMessages
npx messagevisor evaluate --message=dashboard.welcome --locale=en-US --values='{"name":"Ada"}'
npx messagevisor evaluate --rawMessage='Hello {name}' --locale=en-US --values='{"name":"Ada"}'
npx messagevisor evaluate --segment=platform-web --context='{"platform":"web"}'
```

Use `evaluate` when runtime output is surprising. Use `examples` when reviewing authored examples.

## Build

```sh
npx messagevisor build
npx messagevisor build --target=web --locale=en-US
npx messagevisor build --showSize
```

Build resolves translation inheritance, format inheritance, targets, target context, overrides, and target datafile options. `revisionFromHash` is a target option, not a build flag.

## Duplicate audit

```sh
npx messagevisor find-duplicates
npx messagevisor find-duplicates --locale=en-US
npx messagevisor find-duplicates --set=staging
npx messagevisor find-duplicates --json --pretty
```

Duplicate detection compares resolved translations after locale inheritance. It ignores overrides, archived messages, and empty values.

## Export and import

```sh
npx messagevisor export --locale=nl-NL --target=web --output=exports/nl-NL-web.csv
npx messagevisor import exports/nl-NL-web.csv
npx messagevisor import exports/nl-NL-web.csv --locale=nl-NL --apply
npx messagevisor import vendor/new-copy.csv --create-missing
npx messagevisor import vendor/new-copy.csv --create-missing --apply
```

Import previews by default. Use `--apply` only after reviewing the plan. Use `--create-missing` only when unknown rows are meant to create messages or overrides. `--createMissing` is also accepted.

JSON import:

```sh
npx messagevisor import translations.json --from-json --locale=nl-NL
npx messagevisor import translations.json --from-json --locale=nl-NL --json-path=data.translations --apply
```

## Prune

```sh
npx messagevisor prune --translations --target=web
npx messagevisor prune --translations --target=web --apply
npx messagevisor prune --formats --locale=en-US
npx messagevisor prune --formats --locale=en-US --apply
```

`prune --formats` works at whole style-object level. It should not remove individual inherited style properties.

## Catalog

```sh
npx messagevisor catalog
npx messagevisor catalog export
npx messagevisor catalog serve
npx messagevisor catalog --with-translation-search
npx messagevisor catalog --with-duplicates
```

`catalog serve` only serves generated output. Optional translation search and duplicate reports must be generated with `catalog` or `catalog export`.

## Sets

For `sets: true` projects:

```sh
npx messagevisor lint --set=staging
npx messagevisor build --set=production
npx messagevisor test --set=dev
npx messagevisor promote --from=dev --to=staging
npx messagevisor promote --from=staging --to=production --apply
```

Use `--json --pretty` for automation when available.
