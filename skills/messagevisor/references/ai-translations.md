# AI-assisted translation

Use this when an agent is doing translation work inside a Messagevisor project. The safe loop is: export, translate, preview import, ask for confirmation, apply, validate, then review in Catalog.

## First principles

- Preserve placeholders, ICU syntax, rich tags, and branded terms exactly unless the user asks otherwise.
- Translate only the intended locale columns or JSON fields.
- Preview imports before `--apply`.
- Do not use `--create-missing` or `--createMissing` unless the user explicitly wants the file to create new Messagevisor entries.
- Leave regulated, legal, financial, or sensitive copy for human review when in doubt.

## Inspect project context

```bash
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

For sets projects, identify the set and pass `--set=<name>` to export/import.

## Export

For a single target locale:

```bash
npx messagevisor export \
  --target=web \
  --locale=en \
  --locale=de \
  --onlyUntranslated \
  --output=exports/de-web.csv
```

For regional locales that inherit from a parent, prefer direct gaps:

```bash
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
- Preserve interpolation placeholders such as `{name}` when the interpolation module is used.
- Keep enum values, segment keys, target keys, locale keys, and message keys untranslated.
- Leave the target cell empty if uncertain and mention it in the summary.

Use project examples to infer tone. Do not invent new message keys while translating ordinary exports.

## Preview import

Run preview without `--apply`:

```bash
npx messagevisor import exports/de-web.csv --locale=de
```

Summarize changed translations, skipped rows, created entries, warnings, and any uncertain rows before applying.

## Apply and validate

Only after confirmation:

```bash
npx messagevisor import exports/de-web.csv --locale=de --apply
npx messagevisor lint
npx messagevisor test
npx messagevisor catalog
```

## Regional pruning

For inherited regional locales, use `--prune` when the user wants to remove translations that are identical to the inherited parent value:

```bash
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
