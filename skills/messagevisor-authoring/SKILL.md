---
name: messagevisor-authoring
description: "Use this skill when adding, editing, organizing, or reviewing Messagevisor messages and locales. Trigger on changes inside `messages/` or `locales/`, adding languages, regional variants, translations, examples, namespaces, locale inheritance, format presets, `deprecated`, `archived`, `meta`, or `promotable`."
---

# Authoring messages and locales

Use this for source files under `messages/` and `locales/`. For conditional copy, use `messagevisor-overrides`. For ICU syntax, use `messagevisor-icu`.

## Messages

Message keys come from file paths:

```text
messages/auth/signin.yml -> auth.signin
messages/billing/invoices/total.yml -> billing.invoices.total
```

Minimal message:

```yml
description: Sign in button label
translations:
  en: Sign in
  nl: Aanmelden
```

Useful fields:

| Field | Use |
| --- | --- |
| `description` | Human context shown in Catalog and exports |
| `summary` | Shorter context for compact output |
| `translations` | Locale to string map |
| `overrides` | Conditional translations |
| `meta` | Arbitrary runtime metadata |
| `examples` | Example evaluations shown by CLI and Catalog |
| `deprecated` | Keep active but emit runtime diagnostics |
| `archived` | Remove from active output |
| `promotable` | Set `false` to exclude from `promote` |

Example:

```yml
description: Dashboard greeting
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

```sh
npx messagevisor list --messages --target=web --keyPattern='^dashboard\.'
```

## Locales

Locale files live at `locales/<key>.yml`. Use BCP 47 style keys where practical, such as `en`, `en-US`, `nl-NL`, or `ar-SA`.

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

`direction` is metadata. The application still applies layout direction.

## Inheritance

Translation inheritance is fallback by message key:

1. Try the requested locale translation.
2. Follow `inheritTranslationsFrom`.
3. Omit the key from that locale datafile if no translation exists.

Format inheritance merges only down to style names. Parent sibling styles stay inherited, but a child style with the same name replaces the whole style object.

```yml
# parent
formats:
  number:
    money:
      style: currency
      currency: USD
      currencyDisplay: symbol
    decimal:
      maximumFractionDigits: 2
```

```yml
# child
inheritFormatsFrom: en
formats:
  number:
    money:
      style: currency
      currency: EUR
      currencyDisplay: code
```

The child still inherits `number.decimal`, but `number.money` is exactly the child object. Repeat the full intended style object when overriding an inherited style.

## Authoring checklist

- Add examples when copy has interpolation, ICU, overrides, or tricky formatting.
- Keep keys stable. For renames, move the file and update app references.
- Use `deprecated: true` for a transition period before deleting widely used keys.
- Use `archived: true` when removing from active output while keeping history.
- Open `npx messagevisor catalog` for review while editing.
- Run `npx messagevisor lint`, `npx messagevisor test`, and `npx messagevisor build` before finishing.
