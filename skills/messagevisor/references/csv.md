# Translator handoff (CSV and JSON)

Messagevisor source stays in Git, but CSV and JSON import/export support work with translators and vendors.

Native XLIFF 2.0 supports a bounded round trip, not arbitrary vendor profiles or XLIFF 1.2. Unsupported inline XML is rejected. Preserve unit metadata and protected content; fingerprints reject stale source or target state. Reexport and review conflicts rather than replacing fingerprints.

```bash
npx messagevisor export --format=xliff --sourceLocale=en --locale=nl --output=translations.xlf
npx messagevisor import --format=xliff --input=translations.xlf --locale=nl --sourceLocale=en
npx messagevisor import --format=xliff --input=translations.xlf --locale=nl --sourceLocale=en --apply
```

Export accepts one target locale. Import locale and source locale options are optional language checks. `--materializeInherited` explicitly allows creating direct translations from inherited units; otherwise inheritance is preserved. Preview before applying and test a sample round trip through the vendor tool. Importing is not review approval.

The current XLIFF profile protects ICU structure, including plural and select branch structure and order. Translators edit literal text only. Existing authored target grammar can differ from the source and is retained. Adding locale specific branches requires an authoring edit before export. XLIFF 1.2 and vendor specific files outside this profile are unsupported.

Quoted ICU prose is exported in decoded form for editing: `don''t` appears as `don't`, not a protected sentence. Unchanged text retains its exact authored spelling on import. Edited prose is safely ICU escaped; inserted braces or tag like characters remain literal text and cannot introduce executable arguments or tags. Protected codes must remain unchanged and ordered.

Changed target text returned as `reviewed` is downgraded to `translated`, with no approved target hash. This also applies when the file explicitly changes its state to reviewed alongside new copy, and to edited inherited copy when materialising it. There is no flag to trust reviewed markers on changed copy. Use the saved [review workflow](authoring.md#translation-workflow-state) afterwards.

Unchanged text and state preserve existing evidence, including stale hashes. A deliberate state only change to reviewed can approve unchanged copy, so accept it only after an authorised reviewer has checked the current source and target. Do not silently upgrade stale approvals through an interchange tool.

Import and export `--json` return structured summaries or plans, not XML content. Use export `--print` for XML. Mutations are atomic per set, not across sets; earlier sets may remain applied if a later set fails. Locale graph edits are not part of the write lock guard, so coordinate them separately and revalidate.

## Safe round trip

```bash
npx messagevisor export --locale=nl-NL --target=web --onlyUntranslated --output=exports/nl-NL-web.csv
# send to translator, receive filled file
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

```bash
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

```bash
npx messagevisor import translations.csv
npx messagevisor import translations.csv --locale=nl-NL --apply
npx messagevisor import translations.csv --prune --apply
```

`--locale` limits which locale columns are imported. Without it, all known locale columns are considered.

Import planning reads the complete message key index for existence and ambiguity checks, but opens only message documents referenced by input rows. Reads use bounded concurrency. This applies to CSV, JSON, and native XLIFF without an additional flag. Locale definitions are still loaded for inheritance; key discovery is still proportional to the selected set. Do not describe a small import as requiring no project scan or as constant time.

`--prune` removes direct translations when the imported value equals the inherited fallback copy.

`--emptyValues=skip|empty|delete` distinguishes empty cells: `skip` leaves existing text unchanged and is the default, `empty` writes an intentional empty string, and `delete` removes the direct translation. Preview these edits before applying. Do not confuse deletion with an empty translation or a missing cell.

CSV export `--explicitIdentities` separates `messageKey` and `overrideKey`; keep both columns intact to avoid ambiguity around separator characters. Resolution status (`direct`, `inherited`, `missing`) is not workflow approval.

## Creating missing entries

Unknown messages and overrides are skipped by default with warnings. Use creation only when the input is intended to add new source entries:

```bash
npx messagevisor import vendor/new-copy.csv --create-missing
npx messagevisor import vendor/new-copy.csv --create-missing --apply
```

`--createMissing` is accepted as a camelCase alias. Always preview first. Creating missing entries from a misaligned spreadsheet can pollute a project quickly.

When creating override rows, the base message must already exist or be created by another row in the same import.

## JSON import

JSON import expects a flat message-key to translation map, or a nested object selected with `--json-path`.

```bash
npx messagevisor import translations.json --from-json --locale=nl-NL
npx messagevisor import translations.json --from-json --locale=nl-NL --json-path=data.translations --apply
```

JSON import supports `--create-missing`, `--prune`, preview mode, and `--apply`. CSV-only options such as `--delimiter` and `--bom` do not apply.

## Sets

Set projects can exchange all sets or one set:

```bash
npx messagevisor export --set=staging --locale=nl-NL
npx messagevisor import translations.csv --set=staging --apply
```

When a CSV includes a `set` column, verify it matches the intended destination before applying.
