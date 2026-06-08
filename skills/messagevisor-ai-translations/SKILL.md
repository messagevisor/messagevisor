---
name: messagevisor-ai-translations
description: "Use this skill when an AI agent is asked to translate Messagevisor content, fill exported CSV/JSON files, preserve ICU placeholders, preview imports, or prepare localization review."
---

# AI-assisted Messagevisor translations

Use this skill when an agent is doing translation work inside a Messagevisor project. The safe loop is export, translate, preview import, ask for confirmation, apply, validate, then review in Catalog.

## First principles

- Preserve placeholders, ICU syntax, rich tags, and branded terms exactly unless the user asks otherwise.
- Translate only the intended locale columns or JSON fields.
- Preview imports before `--apply`.
- Do not use `--create-missing` or `--createMissing` unless the user explicitly wants the file to create new Messagevisor entries.
- Leave regulated, legal, financial, or sensitive copy for human review when in doubt.

## Inspect project context

```sh
npx messagevisor info
npx messagevisor list --locales
npx messagevisor list --targets
npx messagevisor lint
```

Read:

- `messagevisor.config.js`
- target definitions for the app or surface being translated
- locale inheritance for the source and target locales
- existing translations in the target locale for tone and terminology
- message examples and tests around risky copy

For sets projects, identify the set and pass `--set=<name>` to export/import unless the file itself carries set information.

## Export

For a single target locale:

```sh
npx messagevisor export \
  --target=web \
  --locale=en \
  --locale=de \
  --onlyUntranslated \
  --output=exports/de-web.csv
```

For regional locales that inherit from a parent, prefer direct gaps:

```sh
npx messagevisor export \
  --target=web \
  --locale=en \
  --locale=en-GB \
  --onlyDirectlyUntranslated \
  --output=exports/en-GB-web.csv
```

## Translate safely

When editing CSV or JSON export files:

- Keep row identity columns unchanged.
- Keep source locale columns unchanged.
- Preserve ICU placeholders such as `{name}`, `{count, plural, ...}`, `{gender, select, ...}`.
- Preserve tag names and nesting if ICU rich text is used.
- Preserve interpolation placeholders such as `{name}` when interpolation module is used.
- Keep enum values, segment keys, target keys, locale keys, and message keys untranslated.
- Leave the target cell empty if uncertain and mention it in the summary.

Use project examples to infer tone. Do not invent new message keys while translating ordinary exports.

## Preview import

Run preview without `--apply`:

```sh
npx messagevisor import exports/de-web.csv --locale=de
```

For files intended to add new entries, preview creation explicitly:

```sh
npx messagevisor import exports/new-copy.csv --create-missing
```

`--createMissing` is also accepted, but docs and new commands should prefer `--create-missing`.

Summarize changed translations, skipped rows, created entries, warnings, and any uncertain rows before applying.

## Apply and validate

Only after confirmation:

```sh
npx messagevisor import exports/de-web.csv --locale=de --apply
npx messagevisor lint
npx messagevisor test
npx messagevisor catalog
```

For review-heavy work, export the static Catalog with optional expensive reports only when useful:

```sh
npx messagevisor catalog export --with-translation-search --with-duplicates
```

## Regional pruning

For inherited regional locales, use `--prune` when the user wants to remove translations that are identical to the inherited parent value:

```sh
npx messagevisor import exports/en-GB-web.csv --locale=en-GB --prune
npx messagevisor import exports/en-GB-web.csv --locale=en-GB --prune --apply
```

Preview first. Pruning changes source files.

## Review checklist

- Lint passes.
- Tests pass.
- Catalog renders examples for changed messages.
- ICU plural and select branches still contain the same placeholders.
- Target locale tone matches neighboring messages.
- Any skipped or low-confidence rows are reported clearly.
