# Authoring messages and locales

Use this for source files under `messages/` and `locales/`. For conditional copy, see `overrides.md`. For ICU syntax, see `icu.md`.

## Messages

Message keys come from file paths:

```text
messages/auth/signin.yml      -> auth.signin
messages/billing/total.yml    -> billing.total
```

Minimal message:

```yml
description: Sign in button label
translations:
  en: Sign in
  nl: Aanmelden
```

Useful fields:

| Field                | Use                                                                                |
| -------------------- | ---------------------------------------------------------------------------------- |
| `description`        | Human context shown in Catalog and exports                                         |
| `summary`            | Shorter context for compact output                                                 |
| `translations`       | Locale to string map                                                               |
| `translationStates`  | Per-locale `draft`, `translated`, or `reviewed` workflow state and source hash     |
| `overrides`          | Conditional translations                                                           |
| `meta`               | Arbitrary runtime metadata                                                         |
| `examples`           | Example evaluations shown by CLI and Catalog                                       |
| `deprecated`         | Keep active but emit runtime `deprecated_message` diagnostics                      |
| `deprecationWarning` | Human guidance shown in the runtime diagnostic (what to use instead, removal date) |
| `archived`           | Remove from active output                                                          |
| `promotable`         | Set `false` to exclude from `promote`                                              |

Example with metadata and examples:

```yml
description: Dashboard greeting
meta:
  tags:
    - dashboard
    - personalization
translations:
  en-US: Welcome back, {name}
  nl-NL: Welkom terug, {name}
examples:
  - description: Named user
    locale: en-US
    values:
      name: Ada
```

After adding a message, confirm it is included by a target:

```bash
npx messagevisor list --messages --target=web --keyPattern='^dashboard\.'
```

## Locales

Locale files live at `locales/<key>.yml`. Use BCP 47 style keys where practical: `en`, `en-US`, `nl-NL`, `ar-SA`.

```yml
description: English (United States)
direction: ltr
inheritTranslationsFrom: en
inheritFormatsFrom: en
formats:
  number:
    money:
      style: currency
      currency: USD
      currencyDisplay: symbol
```

`direction` is metadata carried into datafiles — apps read it via `getDirection()` / React `useDirection()` and apply layout direction themselves (`rtl` for Arabic, Hebrew, Persian). `mergeExamplesFrom: <locale>` additionally pulls a base locale's examples into this locale's Catalog and `examples` output.

## Inheritance

### Translation inheritance

Fallback by message key:

1. Try the requested locale translation.
2. Follow `inheritTranslationsFrom`.
3. Omit the key from that locale datafile if no translation exists anywhere in the chain.

### Format inheritance

Format inheritance merges only at the style name level. Parent sibling styles are inherited, but a child that declares the same style name replaces the whole style object.

```yml
# parent (en)
formats:
  number:
    money:
      style: currency
      currency: USD
    decimal:
      maximumFractionDigits: 2
```

```yml
# child (en-GB)
inheritFormatsFrom: en
formats:
  number:
    money:
      style: currency
      currency: GBP
      currencyDisplay: symbol
```

The child still inherits `number.decimal`, but `number.money` is exactly the child object. Repeat the full intended style object when overriding an inherited style.

## Translation workflow state

When the project config declares `sourceLocale`, messages and overrides may track `translationStates` per translated locale:

```yml
translationStates:
  nl-NL:
    status: reviewed
    sourceHash: <sha256-of-source-translation>
    targetHash: <sha256-of-approved-target-translation>
```

Every base or override translation group must resolve the source locale directly or through locale inheritance. Lint compares compatible ICU value contracts and required rich text tags. Reviewed state needs both `sourceHash` and `targetHash` to bind approval to the exact source and target text. Existing reviewed entries with only a source hash need a fresh review; never bulk accept hashes to silence lint. Until approved, use an appropriate unreviewed status.

Save a preview, show the actual source and target copy to the reviewer, and apply only that approved file:

```bash
npx messagevisor review --locale=nl --includeMessages='checkout.*' --status=reviewed --output=review.json --json
# Stop for human approval of the saved copy and scope.
npx messagevisor review --apply --input=review.json --json
```

Apply requires `--input`; a bare `--apply` is rejected. Selection and status options belong only to preview creation and cannot accompany apply. The saved file binds exact copy, document versions, locale inheritance, effective selection, status, and project storage identity. If it no longer matches, create and inspect a fresh preview. Never edit or recompute checksums to bypass a conflict. Application regenerates and validates mutations instead of trusting file contents as write instructions. Atomic writes cover each set, not the entire project or concurrent locale graph edits.

Only direct translations can be reviewed. Default status is `reviewed`; `draft` and `translated` are alternatives. Preview locale selection excludes the source locale by default. Locale, target, and override selectors repeat; `--override` selects overrides only. `--set` accepts one value, and omission visits all sets. A command without `--output` only displays the preview; redirecting its JSON report does not create an applicable saved preview.

Preview files contain full sensitive message content. Keep them out of public commits and logs unless explicitly intended. They are bound to the current project storage location, created exclusively with owner access where supported, and never overwrite existing files. The 64 MiB limit applies to saved output and input; narrow large selections. Relative input and output paths resolve from the project root. Tokens are content checksums, not signatures, authorisation credentials, or proof of human approval.

Messages and overrides may include authoring only `translatorContext`: `notes`, `contextUrls`, `maxGraphemes`, `productArea`, `owner`, `legalClassification`, `terminology` (`preferred`, `forbidden`, `doNotTranslate` string arrays), `placeholders` (description plus optional string examples and `ltr`/`rtl`/`auto` direction), and `accessibility` (`visible`, `spoken`, or `label`). These fields never ship in runtime datafiles. Budgets concern authored text, not runtime interpolation value sizes.

## Archival and deprecation

Use `deprecated: true` for a transition period before removing a widely used key. The SDK emits diagnostics for deprecated messages.

Use `archived: true` when removing a key from active output. Archived entities are excluded from datafiles and Catalog active listings. Keep the file in Git for history.

## Authoring checklist

- Add examples when copy has interpolation, ICU, overrides, or tricky formatting.
- Keep keys stable — apps and codegen depend on them. Run `npx messagevisor find-usage --message=<key>` before any rename. For a coordinated rename, move the file and update app references in the same release; for widely used keys, prefer adding the new key, migrating apps, then deprecating and archiving the old one.
- Use `deprecated: true` for a transition period before deleting widely used keys.
- Use `archived: true` when removing from active output while keeping history.
- Open `npx messagevisor catalog` for review while editing.
- Run `npx messagevisor lint`, `npx messagevisor test`, and `npx messagevisor build` before finishing.
