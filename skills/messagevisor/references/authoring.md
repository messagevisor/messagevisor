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
```

The source locale is required for every base or override translation group. Lint compares ICU arguments and rich-text tags with the source and uses `sourceHash` to detect copy that needs retranslation or review.

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
