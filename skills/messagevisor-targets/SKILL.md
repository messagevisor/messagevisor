---
name: messagevisor-targets
description: "Use this skill when working with Messagevisor targets and generated datafiles. Trigger on `targets/`, target inclusion, `includeMessages`, `excludeMessages`, target locales, target context, target format overrides, `pretty`, `stringify`, `revisionFromHash`, missing messages in an app bundle, or `list --messages --target`."
---

# Targets

Targets define runtime artifacts. Every built datafile is one target and one locale.

```text
targets/web.yml + locale en-US -> datafiles/messagevisor-web-en-US.json
```

## Target shape

```yml
description: Web application
includeMessages:
  - auth*
  - dashboard*
excludeMessages:
  - dashboard.internal*
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

- `includeMessages` and `excludeMessages` choose message keys.
- `locales` chooses generated locale datafiles.
- `context` is compile-time known context. It can remove impossible override branches from output.
- `formats.<locale>` applies target-level format overrides after locale format resolution.
- `pretty`, `stringify`, and `revisionFromHash` control generated JSON.

Defaults are optimized for deployment: compact JSON, stringified conditions, and revision from state unless `revisionFromHash` is enabled.

## Format overrides

Target format overlays follow the same style-level rule as locale inheritance. If target `formats.en-US.number.money` exists, it replaces the resolved locale `number.money` style in full. Include every intended option in that style object.

Sibling styles remain inherited.

## Check target coverage

When adding a message, confirm it lands in the intended targets:

```sh
npx messagevisor list --messages --target=web --keyPattern='^auth\.'
npx messagevisor list --messages --target=web --target=mobile
```

If a message is not included by any target, the SDK will not see it at runtime.

## Build

```sh
npx messagevisor build
npx messagevisor build --target=web
npx messagevisor build --target=web --locale=en-US
npx messagevisor build --showSize
```

For set projects, include `--set=<name>` when you need one set.

## Common mistakes

- Do not put runtime-only context in a target unless it is always true for that artifact.
- Do not assume `lint` proves a new message ships. Check target inclusion.
- Do not edit generated datafiles directly.
- Do not rely on inherited style properties when overriding a format style at target level.
