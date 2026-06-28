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
- `pretty`, `stringify`, and `revisionFromHash` control generated JSON.

Defaults are optimized for deployment: compact JSON, stringified conditions, and revision from state unless `revisionFromHash` is enabled.

## Format overrides

Target format overlays follow the same style-level rule as locale inheritance. If target `formats.en-US.number.money` exists, it replaces the resolved locale `number.money` style in full. Include every intended option in that style object. Sibling styles remain inherited.

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
