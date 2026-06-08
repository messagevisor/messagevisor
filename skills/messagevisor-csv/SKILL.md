---
name: messagevisor-csv
description: "Use this skill for translator handoff with Messagevisor export and import. Trigger on CSV, JSON import, translators, LSPs, spreadsheet round trips, `messagevisor export`, `messagevisor import`, statuses, inherited translations, override rows, `--create-missing`, `--prune`, delimiter, BOM, or sets-aware exchange."
---

# Translator handoff

Messagevisor source stays in Git, but CSV and JSON import/export support work with translators and vendors.

## Safe round trip

```sh
npx messagevisor export --locale=nl-NL --target=web --onlyUntranslated --output=exports/nl-NL-web.csv
npx messagevisor import translator/nl-NL-web.csv
npx messagevisor import translator/nl-NL-web.csv --locale=nl-NL --apply
npx messagevisor lint
npx messagevisor test
npx messagevisor catalog
npx messagevisor build
```

Import previews by default. Do not apply an import until the summary and warnings make sense.

## Export

Useful flags:

```sh
npx messagevisor export
npx messagevisor export --locale=en --locale=nl-NL
npx messagevisor export --target=web
npx messagevisor export --onlyUntranslated
npx messagevisor export --onlyDirectlyUntranslated
npx messagevisor export --print
```

Rows include message context, locale columns, status, and override rows. Override rows use the configured override separator, usually `messageKey:overrideKey`.

Statuses distinguish direct, inherited, and missing values. Inherited means the effective translation comes from locale inheritance.

## Import

```sh
npx messagevisor import translations.csv
npx messagevisor import translations.csv --locale=nl-NL --apply
npx messagevisor import translations.csv --prune --apply
```

`--locale` limits which locale columns are imported. Without it, known locale columns are considered.

`--prune` removes direct translations when the imported value equals inherited fallback copy.

## Creating missing entries

Unknown messages and overrides are skipped by default with warnings. Use creation only when the input is intended to add new source entries:

```sh
npx messagevisor import vendor/new-copy.csv --create-missing
npx messagevisor import vendor/new-copy.csv --create-missing --apply
```

`--createMissing` is accepted as a camelCase alias. Always preview first. Creating missing entries from a misaligned spreadsheet can pollute a project quickly.

When creating override rows, the base message must already exist or be created by another row in the same import.

## JSON import

JSON import expects a flat message-key to translation map, or a nested object selected with `--json-path`.

```sh
npx messagevisor import translations.json --from-json --locale=nl-NL
npx messagevisor import translations.json --from-json --locale=nl-NL --json-path=data.translations --apply
```

JSON import supports `--create-missing`, `--prune`, preview mode, and `--apply`. CSV-only options such as `--delimiter` and `--bom` do not apply.

## Sets

Set projects can exchange all sets or one set:

```sh
npx messagevisor export --set=staging --locale=nl-NL
npx messagevisor import translations.csv --set=staging --apply
```

When a CSV includes a `set` column, verify it matches the intended destination before applying.
