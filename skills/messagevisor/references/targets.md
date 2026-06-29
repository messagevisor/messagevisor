# Targets

Targets define runtime artifacts. Every built datafile is one target and one locale:

```text
targets/web.yml + locale en-US -> datafiles/messagevisor-web-en-US.json
```

## Target shape

```yml
description: Web application
includeMessages:
  - auth*
  - dashboard*
excludeMessages: dashboard.internal*
locales:
  - en-US
  - nl-NL
context:
  platform: web
includeFormats:
  number: "*"
  date: short*
excludeFormats:
  number: moneyCode
# includeOnlyUsedFormats: true
formats:
  en-US:
    number:
      money:
        style: currency
        currency: USD
pretty: false
stringify: true
revisionFromHash: false
```

## What targets control

- `includeMessages` and `excludeMessages` choose message keys by glob pattern. Use a string for one pattern, or an array for multiple patterns.
- Omitted `includeMessages` means all messages. Explicit `includeMessages: []` means no messages.
- `locales` lists which locale datafiles are produced.
- `context` is compile-time known context. It can remove impossible override branches from output.
- `formats.<locale>` applies target-level format overrides after locale format resolution.
- `includeFormats` and `excludeFormats` filter resolved format presets by type and style name. Use a string for one pattern, or an array for multiple patterns.
- `includeOnlyUsedFormats: true` keeps only named ICU `number`, `date`, and `time` presets referenced by emitted message and override translations. It cannot be combined with `includeFormats` or `excludeFormats`.
- `pretty`, `stringify`, and `revisionFromHash` control generated JSON.

Defaults are optimized for deployment: compact JSON, stringified conditions, and revision from state unless `revisionFromHash` is enabled.

## Format overrides

Target format overlays follow the same style-level rule as locale inheritance. If target `formats.en-US.number.money` exists, it replaces the resolved locale `number.money` style in full. Include every intended option in that style object. Sibling styles remain inherited.

## Format filters

Use `includeFormats` and `excludeFormats` when a target should ship only part of the resolved format object:

```yml
includeFormats:
  number:
    - decimal*
    - money*
  date: short*
  time: "*"

excludeFormats:
  number: moneyCode
  time:
    - zone*
```

Filtering runs after locale inheritance and target `formats` overrides are resolved. If both filters are omitted, all resolved formats are included. If `includeFormats` is present, only matching type/style pairs are included; `excludeFormats` then removes matching styles from that set.

Use `includeOnlyUsedFormats: true` instead when the target should automatically keep only named ICU format presets that are actively used by the messages and overrides emitted into the generated datafile:

```yml
includeOnlyUsedFormats: true
```

This optimization is mutually exclusive with `includeFormats` and `excludeFormats`.

## Check target coverage

When adding a message, confirm it lands in the intended targets:

```bash
npx messagevisor list --messages --target=web --keyPattern='^auth\.'
npx messagevisor list --messages --target=web --target=mobile
```

If a message is not included by any target, the SDK will not see it at runtime.

## Build

```bash
npx messagevisor build
npx messagevisor build --target=web
npx messagevisor build --target=web --locale=en-US
npx messagevisor build --showSize
```

For set projects, include `--set=<name>` when you need one set.

## Common mistakes

- Do not put runtime-only context values in a target `context` field. Use only values guaranteed to be true for every use of that target datafile.
- Do not assume `lint` proves a new message ships. Check target inclusion.
- Do not edit generated datafiles directly.
- Do not rely on inherited style properties when overriding a format style at target level. Repeat the full intended style object.
