---
name: messagevisor
description: "Use this skill when working in a Messagevisor project or repository. Trigger on `messagevisor.config.js`, `npx messagevisor`, `@messagevisor/*` imports, `messages/`, `locales/`, `targets/`, `sets/`, generated datafiles, Catalog, translation workflows, i18n authoring, or questions about replacing hosted translation tools with a Git-based workflow."
---

# Messagevisor

Messagevisor is a Git-based translation management toolkit. Teams author YAML or JSON definitions, validate them with the CLI, build compact per-target and per-locale datafiles, then consume those datafiles with runtime SDKs.

## Mental model

```text
authoring files -> npx messagevisor build -> datafiles/*.json -> @messagevisor/sdk
```

Core entities:

| Entity | Location | Purpose |
| --- | --- | --- |
| Locale | `locales/<key>.yml` | Locale metadata, direction, translation inheritance, format inheritance, examples |
| Message | `messages/<path>.yml` | Translatable copy, translations, overrides, examples, metadata |
| Attribute | `attributes/<key>.yml` | Schema for runtime context fields used by conditions |
| Segment | `segments/<key>.yml` | Reusable condition tree |
| Target | `targets/<key>.yml` | Defines one datafile family: messages, locales, context, formats, output options |
| Test | `tests/.../*.spec.yml` | Assertions for messages, segments, locales, and targets |

Default key derivation uses `namespaceCharacter: "."`, so `messages/auth/signin.yml` becomes `auth.signin`.

## Common workflow

```sh
npx messagevisor lint
npx messagevisor test
npx messagevisor build
```

Use these while authoring:

```sh
npx messagevisor catalog
npx messagevisor evaluate --message=auth.signin --locale=en-US --target=web
npx messagevisor evaluate --rawMessage='Hello {name}' --locale=en-US --values='{"name":"Ada"}'
npx messagevisor evaluate --segment=platform-web --context='{"platform":"web"}'
npx messagevisor list --messages --target=web
npx messagevisor find-duplicates --locale=en-US
```

Use `evaluate` for quick directional checks while editing. It is the fastest way to verify one message, one raw formatting string, or one segment before writing tests or opening the Catalog.

## Sets

When `sets: true` is configured, definitions live under `sets/<name>/...`. Use this for parallel release lanes such as `dev`, `staging`, and `production`, not for different apps. Apps are usually modeled as targets.

Promotion moves definitions between sets:

```sh
npx messagevisor promote --from=dev --to=staging
npx messagevisor promote --from=staging --to=production --apply
```

## Invariants

- Do not edit `datafiles/` or `catalog/` as source. They are generated.
- Modules must match between authoring and runtime. If the project uses `@messagevisor/module-icu`, register it in `messagevisor.config.js` and in `createMessagevisor`.
- Locale translation inheritance is per message key fallback.
- Format inheritance merges format types and style names. If a child locale or target declares the same style name, that whole style object replaces the parent style object.
- Overrides are evaluated in order. First matching override wins.
- Target `context` is compile-time knowledge used to simplify built output. Runtime context is supplied by the app per SDK instance or call.
- `archived: true` removes an entity from active output. `promotable: false` excludes it from sets-based promotion.
- Catalog translation-value search requires `--with-translation-search`.
- Catalog duplicate reports require `--with-duplicates`.

## Packages

| Package | Purpose |
| --- | --- |
| `@messagevisor/cli` | `messagevisor` binary |
| `@messagevisor/core` | Project loading, lint, build, test, examples, evaluate, import/export, promote |
| `@messagevisor/catalog` | Static Catalog generator and UI |
| `@messagevisor/sdk` | Runtime SDK |
| `@messagevisor/react` | React provider and hooks |
| `@messagevisor/vue` | Vue plugin and composables |
| `@messagevisor/react-intl-compat` | Compatibility API for react-intl migrations |
| `@messagevisor/module-icu` | ICU message syntax |
| `@messagevisor/module-interpolation` | Lightweight interpolation module |
| `@messagevisor/module-featurevisor` | Featurevisor flag and experiment conditions |
| `@messagevisor/module-missing-translations` | Missing translation reporting |
| `@messagevisor/types` | Shared TypeScript types |

## Related focused skills

Use these when the work is narrower than general Messagevisor orientation:

| Skill | Use when |
| --- | --- |
| `messagevisor-configuration` | Config paths, parsers, modules, namespace settings, sets, and root-directory CLI behavior |
| `messagevisor-authoring` | Messages, locales, namespaces, formats, examples, inheritance, archival, and deprecation |
| `messagevisor-targets` | Target inclusion, locales, target context, format overlays, and datafile options |
| `messagevisor-modules` | Runtime module setup, ordering, custom modules, and module mismatch debugging |
| `messagevisor-examples` | Example authoring and direct evaluation debugging |
| `messagevisor-linting` | Lint failures and schema/reference/condition/format validation |
| `messagevisor-deployment` | Building, revisions, state files, CI, CDN datafile publishing, and Catalog hosting |
| `messagevisor-ai-translations` | Agent-assisted translation workflows with export/import guardrails |

## Before changing a project

1. Read `messagevisor.config.js`.
2. Check whether `sets: true` is enabled.
3. Inspect relevant `targets/` before adding a message, because a message outside all targets will not ship.
4. Prefer CLI checks and Catalog review over guessing.
