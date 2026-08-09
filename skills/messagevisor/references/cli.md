# CLI reference

Run commands inside a Messagevisor project:

```bash
npx messagevisor <command> [options]
```

The CLI searches upwards from the current directory for `messagevisor.config.js`. The global `--rootDirectoryPath=/absolute/path` option starts project discovery from another path.

Use `--json --pretty` for machine-readable output when a command supports it. Many commands also support `--set=<name>` in `sets: true` projects.

With `--json`, command failures use a stable `error` envelope containing `code`, `message`, and optional `details`. Inspect those fields instead of parsing terminal prose.

Unknown commands, options, extra positional arguments, invalid option values, and invalid regular expressions fail with a non-zero exit code. Only pass `--set` when sets are enabled.

## Quick loop while editing

```bash
npx messagevisor lint
npx messagevisor evaluate --message=<key> --locale=<locale> --target=<target>
npx messagevisor test --keyPattern=<key>
npx messagevisor build --target=<target> --locale=<locale>
```

Broader project check:

```bash
npx messagevisor lint
npx messagevisor test
npx messagevisor build --showSize
npx messagevisor catalog
```

Never edit `datafiles/` or `catalog/` as source.

## Project setup and inspection

### `init`

Creates a starter project. It is the only built-in command that does not require an existing Messagevisor project.

```bash
npx messagevisor init
npx messagevisor init --project=json
npx messagevisor init --project=environments
npx messagevisor init --overwrite
```

If the current directory is not empty, `init` may prompt for a child directory. `--overwrite` initializes in the current directory; conflicting files are skipped rather than replaced.

### `config`

Prints resolved config, including path overrides and normalized defaults.

```bash
npx messagevisor config
npx messagevisor config --json --pretty
```

Use this before assuming where files live, which parser is active, whether `sets: true` is enabled, or which modules are configured.

### `info`

Shows quick entity counts.

```bash
npx messagevisor info
```

Use it after imports, promotions, or broad file changes as a cheap sanity check.

## Listing and scaffolding

### `list`

Lists one entity class at a time, or generated datafiles:

```bash
npx messagevisor list --datafiles --json --pretty
npx messagevisor list --messages
npx messagevisor list --messages --target=web
npx messagevisor list --messages --locale=en-US --withoutOverrides
npx messagevisor list --locales --withFormats
npx messagevisor list --targets --locale=en-US
npx messagevisor list --segments --archived=false
npx messagevisor list --attributes --type=string
npx messagevisor list --tests --applyMatrix --json
```

`--datafiles` lists generated files relative to `datafiles/`, together with their raw and gzip-compressed sizes. It excludes hidden files and `REVISION`; run `build` first when you need fresh output. In a sets project, pass `--set=<name>` for JSON output or omit it to see a section for every set.

Common filters:

- `--keyPattern=<regex>`
- `--description=<regex>`
- `--withTests` and `--withoutTests` (except attributes)
- `--archived=true|false`
- `--promotable=true|false`

Message-specific filters: `--deprecated`, `--withOverrides`, `--withoutOverrides`, `--withMeta`, `--withoutMeta`, `--locale`, one or more `--target`.

Locale filters: `--withFormats`, `--withoutFormats`, `--inheritFormatsFrom`, `--inheritTranslationsFrom`.

Target filters: `--locale`, `--withContext`, `--withoutContext`, `--withFormats`, `--withoutFormats`.

### `create`

Creates minimal entity files from newline-separated keys.

```bash
npx messagevisor create --messages --keys=$'auth.signin\nauth.signout'
npx messagevisor create --locales --keys=$'en\nnl'
npx messagevisor create --attributes --keys=$'plan\nplatform'
printf "web\nadmin\n" | npx messagevisor create --targets
```

Pass exactly one of `--messages`, `--locales`, `--targets`, `--attributes`, or `--segments`. Existing keys are skipped. In sets projects, pass `--set=<name>`.

Use `create` to scaffold, then edit the generated files.

## Validation and debugging

### `lint`

```bash
npx messagevisor lint
npx messagevisor lint --set=staging
npx messagevisor lint --json --pretty
```

### `examples`

Resolves authored message and locale examples.

```bash
npx messagevisor examples
npx messagevisor examples --locale=en-US
npx messagevisor examples --onlyMessages
npx messagevisor examples --onlyLocales
npx messagevisor examples --json --pretty
```

### `evaluate`

```bash
npx messagevisor evaluate --message=checkout.total --locale=en-US --target=web --values='{"amount":42}'
npx messagevisor evaluate --message=checkout.banner --locale=en-US --context='{"plan":"pro"}'
npx messagevisor evaluate --rawMessage='{count, plural, one {# item} other {# items}}' --locale=en-US --values='{"count":2}'
npx messagevisor evaluate --segment=paid-users --context='{"plan":"pro"}'
npx messagevisor evaluate --message=checkout.total --locale=en-US --target=web --json --pretty
```

Rules:

- Pass either `--message`, `--rawMessage`, or `--segment`.
- `--message` and `--rawMessage` require `--locale`.
- `--segment` does not need `--locale`.
- `--values` and `--context` must be valid JSON.
- In sets projects, pass `--set=<name>`.

### `test`

```bash
npx messagevisor test
npx messagevisor test --set=dev
npx messagevisor test --keyPattern=welcome
npx messagevisor test --assertionPattern=evaluation
npx messagevisor test --onlyFailures
npx messagevisor test --showDatafile
npx messagevisor test --verbose
npx messagevisor test --json --pretty
```

Use `--showDatafile` for target assertions. Use `--onlyFailures` to keep noisy suites readable.

### `benchmark`

```bash
npx messagevisor benchmark --message=auth.signin --locale=en-US --context='{"plan":"pro"}' -n=1000
npx messagevisor benchmark --rawMessage='Hello {name}' --locale=en-US --values='{"name":"Ada"}' -n=1000
```

Use benchmark only after `evaluate` proves the behavior is correct.

## Build and generated artifacts

### `build`

```bash
npx messagevisor build
npx messagevisor build --target=web --locale=en-US
npx messagevisor build --set=production
npx messagevisor build --showSize
npx messagevisor build --json --pretty
```

Use `--no-stateFiles` only when you intentionally want a build that does not read or update state files.

### `generate-code`

```bash
npx messagevisor generate-code --language typescript --out-dir src/generated
npx messagevisor generate-code --language typescript --out-dir src/generated --react
npx messagevisor generate-code --language typescript --out-dir src/generated --target=web
npx messagevisor generate-code --language typescript --out-dir src/generated --includeMessages='auth*'
```

Currently only TypeScript is supported. Regenerate after message key changes.

### `catalog`

```bash
npx messagevisor catalog
npx messagevisor catalog --with-translation-search
npx messagevisor catalog --with-duplicates
npx messagevisor catalog --set=staging --set=production
npx messagevisor catalog export
npx messagevisor catalog export --set=production
npx messagevisor catalog export --hashRouter
npx messagevisor catalog serve
```

Run `catalog export` before `catalog serve`. Serve requires existing output and rejects export-only options.

In sets projects, Catalog includes all sets by default. Use repeatable `--set=<name>` with `catalog` or `catalog export` to generate only selected sets. The Catalog set switcher remains visible for sets projects and orders `dev*` sets first, `prod*` sets last.

## Translation exchange and cleanup

### `export`

```bash
npx messagevisor export
npx messagevisor export --locale=en-US --target=web
npx messagevisor export --locale=en --locale=nl-NL --target=web --output=exports/nl-NL-web.csv
npx messagevisor export --locale=en --locale=de --onlyUntranslated --print
```

Useful options: `--includeMessages`, `--excludeMessages`, `--excludeOverrides`, `--withoutDescription`, `--withoutStatus`, `--onlyUntranslated`, `--onlyDirectlyUntranslated`, `--output`, `--force`, `--delimiter`, `--bom`, `--lineEnding=lf|crlf`.

### `import`

```bash
npx messagevisor import exports/nl-NL-web.csv
npx messagevisor import exports/nl-NL-web.csv --locale=nl-NL --apply
npx messagevisor import exports/en-GB-web.csv --locale=en-GB --prune
npx messagevisor import vendor/new-copy.csv --create-missing
npx messagevisor import translations.json --from-json --locale=nl-NL
npx messagevisor import payload.json --from-json --json-path=data.translations --locale=nl-NL --apply
```

Import previews by default. Use `--apply` only after reviewing the plan.

Use either the positional input file or `--input`, not both.

### `find-usage`

```bash
npx messagevisor find-usage --message=checkout.title
npx messagevisor find-usage --segment=premium-users
npx messagevisor find-usage --attribute=account.plan
npx messagevisor find-usage --locale=nl-NL
npx messagevisor find-usage --format=number.money
npx messagevisor find-usage --message=checkout.title --set=staging
```

Pass exactly one entity query. Keys must exist and format keys use `<type>.<preset>`. Sets projects search all sets by default; use `--set=<set>` to narrow the search. JSON output in a sets project requires `--set`. Use `--json --pretty` for structured output.

### `diff`

```bash
npx messagevisor diff
npx messagevisor diff --format=markdown
npx messagevisor diff --from=main --format=markdown
npx messagevisor diff --from=release --to=feature
npx messagevisor diff --set=staging --set=production
npx messagevisor diff --resolved
npx messagevisor diff --json --pretty
```

Use `diff` when humans need to review copy and override behavior rather than YAML structure. With uncommitted project changes it compares `HEAD` to the working tree. When clean it compares `main` or `master` to the current branch. `--from` and `--to` accept explicit branches, tags, commits, remote-tracking refs, or `working-tree`. The report includes base copy, override copy, translation workflow-state and deprecation changes, plus override additions/removals/order/condition/segment changes and changes to referenced Segment definitions. Add `--resolved` to show effective downstream copy after locale inheritance, including each value's source locale. Markdown is suitable for pull requests; JSON is suitable for automation. Requested refs must exist locally; use a full-history checkout (`fetch-depth: 0` in GitHub Actions) when a shallow clone does not contain the comparison base. Target-context specialization is not expanded into per-target rows.

### `find-duplicates`

```bash
npx messagevisor find-duplicates
npx messagevisor find-duplicates --locale=en-US
npx messagevisor find-duplicates --locale=en-US --json --pretty
```

### `prune`

```bash
npx messagevisor prune --translations
npx messagevisor prune --translations --target=web --apply
npx messagevisor prune --formats --locale=en-US
npx messagevisor prune --formats --locale=en-US --apply
```

Preview first.

## Sets and promotion

### `promote`

```bash
npx messagevisor promote --from=dev --to=staging
npx messagevisor promote --from=dev --to=staging --showUnchanged
npx messagevisor promote --from=dev --to=staging --apply
npx messagevisor promote --from=dev --to=staging --includeMessages='checkout*' --apply
npx messagevisor promote --from=dev --to=staging --locale=nl-NL --apply
npx messagevisor promote --from=staging --to=production --target=web --apply
npx messagevisor promote --from=staging --to=production --excludeOverrides --apply
npx messagevisor promote --from=dev --to=staging --conflicts=fail
npx messagevisor promote --from=dev --to=staging --apply --audit=markdown
```

Promotion previews by default. `--apply` writes destination files. Conflict modes: `source`, `destination`, `fail` (use `fail` in automation). Top-level entities with `promotable: false` protect an existing destination but are still created when missing. Non-promotable source overrides and assertions are omitted. After applying, lint/test/build the destination set. A clean preview doubles as an "are these sets in sync?" check.

## Troubleshooting

### Translation looks wrong

```bash
npx messagevisor evaluate --message=<key> --target=<target> --locale=<locale> --context='<json>' --values='<json>'
npx messagevisor test --keyPattern=<key> --onlyFailures
```

Check modules, target inclusion, locale inheritance, overrides, and target context in that order.

### Target seems to miss a message

```bash
npx messagevisor list --messages --target=<target>
npx messagevisor build --target=<target> --locale=<locale>
npx messagevisor test --keyPattern=<target-or-message> --showDatafile
```

### Translator import needs review

```bash
npx messagevisor import translations.csv --locale=<locale>
npx messagevisor import translations.csv --locale=<locale> --apply
npx messagevisor lint
npx messagevisor test
```

Preview before apply. Do not use `--create-missing` unless the file is meant to create new entries.
