---
name: messagevisor
description: Author, test, build, and query Messagevisor projects. A Git-native i18n and l10n toolkit. Use whenever the user mentions Messagevisor, edits files under messages/, locales/, attributes/, segments/, targets/, or tests/, asks about translations or internationalization, runs npx messagevisor commands, or works in a directory containing messagevisor.config.js. Covers authoring messages and locales, conditional copy with overrides and segments, ICU syntax, targets and datafile generation, testing, linting, Catalog review, CSV translator workflows, code generation, sets-based release lanes, SDK integration, deployment, and AI-assisted translation.
---

# Messagevisor

You are helping the user author, test, build, or query a [Messagevisor](https://messagevisor.com) project. Messagevisor is a Git-based translation management toolkit. Projects are standalone YAML or JSON definitions that compile into per-target and per-locale datafiles consumed by SDKs.

```text
authoring files -> npx messagevisor build -> datafiles/*.json -> @messagevisor/sdk
```

## Orient yourself first

Before making any changes, take a few seconds to ground in the actual project. Always run these at the start of a Messagevisor task:

```bash
npx messagevisor config --json --pretty
npx messagevisor info
```

From the config, note:

- `parser` — if `"json"`, author in JSON; otherwise YAML.
- `sets` — if `true`, definitions live under `sets/<name>/...` not at the root.
- `modules` — the list of active modules. Match these in the runtime SDK.
- `namespaceCharacter` — the separator used to derive message keys from paths. Default is `"."`.
- Directory paths (`messagesDirectoryPath`, `localesDirectoryPath`, etc.) — respect any overrides.

Then read one or two existing entity files to match local style before adding new ones.

## Core entities

| Entity    | Location               | Purpose                                                                           |
| --------- | ---------------------- | --------------------------------------------------------------------------------- |
| Locale    | `locales/<key>.yml`    | Locale metadata, direction, translation inheritance, format inheritance, examples |
| Message   | `messages/<path>.yml`  | Translatable copy, translations, overrides, examples, metadata                    |
| Attribute | `attributes/<key>.yml` | Schema for runtime context fields used by conditions                              |
| Segment   | `segments/<key>.yml`   | Reusable condition tree                                                           |
| Target    | `targets/<key>.yml`    | Defines one datafile family: messages, locales, context, formats, output options  |
| Test      | `tests/.../*.spec.yml` | Assertions for messages, segments, locales, and targets                           |

Default key derivation uses `namespaceCharacter: "."`, so `messages/auth/signin.yml` becomes `auth.signin`.

## When to load which reference

This file loads eagerly. The files below load only when relevant. Read them in full before authoring or debugging in that area.

| Task                                                   | Read                                                           |
| ------------------------------------------------------ | -------------------------------------------------------------- |
| Change or diagnose `messagevisor.config.js`            | [references/configuration.md](references/configuration.md)     |
| Add or edit messages, locales, formats, inheritance    | [references/authoring.md](references/authoring.md)             |
| Work with targets, datafile inclusion, target context  | [references/targets.md](references/targets.md)                 |
| Conditional copy: overrides, attributes, segments      | [references/overrides.md](references/overrides.md)             |
| ICU plurals, selects, named formats, rich text         | [references/icu.md](references/icu.md)                         |
| Modules: setup, ordering, custom transforms            | [references/modules.md](references/modules.md)                 |
| Examples, raw message evaluation, Catalog review       | [references/examples.md](references/examples.md)               |
| Write or fix test specs, run tests                     | [references/testing.md](references/testing.md)                 |
| Fix lint errors, schema problems, invalid references   | [references/linting.md](references/linting.md)                 |
| Browse or host the Catalog UI                          | [references/catalog.md](references/catalog.md)                 |
| Any CLI command, flags, scripting                      | [references/cli.md](references/cli.md)                         |
| Wire datafiles into an application (SDK, React, Vue)   | [references/sdk.md](references/sdk.md)                         |
| Build, CI, CDN publishing, revisions, state files      | [references/deployment.md](references/deployment.md)           |
| Sets projects, promotion flows, dev/staging/production | [references/sets.md](references/sets.md)                       |
| CSV export and import for translator handoff           | [references/csv.md](references/csv.md)                         |
| Agent-assisted translation workflows                   | [references/ai-translations.md](references/ai-translations.md) |
| Generate typed TypeScript helpers                      | [references/codegen.md](references/codegen.md)                 |
| Feature flag or experiment conditional copy            | [references/featurevisor.md](references/featurevisor.md)       |

Per-entity templates live in [templates/](templates/). Copy and adapt rather than writing from memory.

A complete end-to-end example project lives in [templates/example-project/](templates/example-project/). Use it as the source of truth for "show me how a Messagevisor project hangs together" requests.

## Core invariants

These apply to every change. The references add depth; they do not override these.

### 1. Messages outside all targets do not ship

Before adding a message, check which target includes it:

```bash
npx messagevisor list --messages --target=web --keyPattern='^auth\.'
```

If a message is not included by any target, the SDK will not see it at runtime.

### 2. Overrides are evaluated in order, first match wins

Put narrow overrides (specific plan, platform, or flag conditions) before broad ones. Reordering overrides changes behavior.

### 3. Modules must match between authoring and runtime

If the project config has `@messagevisor/module-icu`, register the same module in `createMessagevisor`. If one side has ICU and the other does not, messages render as literal ICU syntax in production.

### 4. Format inheritance replaces whole style objects

A child locale that overrides `formats.number.money` replaces the entire `money` style object. It does not merge individual properties. Repeat every intended property in the overriding style object.

### 5. Do not edit generated output as source

`datafiles/` and `catalog/` are generated. Do not edit them directly.

### 6. After any edit, lint

```bash
npx messagevisor lint
```

If you wrote or changed a test spec, also run:

```bash
npx messagevisor test --keyPattern=<theKey>
```

## Common authoring flows

### Starting a new project

```bash
npx messagevisor init
npm install
npx messagevisor lint
npx messagevisor build
```

Starter options:

```bash
npx messagevisor init
npx messagevisor init --project=json
npx messagevisor init --project=environments
```

Use `environments` when the user wants dev, staging, production, or promotion flows. It creates a sets-based project shape.

If the current directory is not empty, `init` may prompt for a child directory. Use `--overwrite` only when the user wants to initialize in place.

### Adding a message

1. Read existing `messages/` files to match conventions.
2. Confirm the message path lands in the intended target by checking `includeMessages` and `excludeMessages` in `targets/<key>.yml`.
3. Create `messages/<path>.yml` from [templates/message.yml](templates/message.yml).
4. Add examples when the copy has interpolation, ICU syntax, overrides, or tricky formatting.
5. Run `npx messagevisor lint` then `npx messagevisor evaluate --message=<key> --locale=<locale>`.
6. Offer to add a test spec at `tests/messages/<path>.spec.yml`.

### Adding conditional copy (overrides)

Read [references/overrides.md](references/overrides.md). Before referencing a segment, confirm `segments/<key>.yml` exists or create it from [templates/segment.yml](templates/segment.yml). Run `npx messagevisor lint` after edits.

### Adding a locale

Read [references/authoring.md](references/authoring.md) on inheritance. Create `locales/<key>.yml` from [templates/locale.yml](templates/locale.yml). Check whether existing targets list this locale under `locales:`.

### Adding a target

Read [references/targets.md](references/targets.md). Create `targets/<key>.yml` from [templates/target.yml](templates/target.yml). Run `npx messagevisor lint` and then `npx messagevisor build --target=<key>`.

### ICU message syntax

Read [references/icu.md](references/icu.md) and verify the ICU module is registered in both project config and SDK runtime. Use `npx messagevisor evaluate --rawMessage='...' --locale=<locale>` to test formatting in isolation.

### Sets and environments

Read [references/sets.md](references/sets.md). Most common promotion workflow:

```bash
npx messagevisor promote --from=dev --to=staging
npx messagevisor promote --from=staging --to=production --apply
```

### Debugging a translation

Use `evaluate` as the fastest check:

```bash
npx messagevisor evaluate --message=<key> --locale=<locale> --target=<target> --context='{"plan":"pro"}'
```

Check in this order: target inclusion, locale translation and inheritance, target context, override match, modules. See [references/examples.md](references/examples.md) for the full reasoning model.

### Translator handoff

Read [references/csv.md](references/csv.md). Safe round trip:

```bash
npx messagevisor export --locale=nl-NL --target=web --onlyUntranslated --output=exports/nl-NL-web.csv
# fill the file
npx messagevisor import exports/nl-NL-web.csv --locale=nl-NL
npx messagevisor import exports/nl-NL-web.csv --locale=nl-NL --apply
npx messagevisor lint && npx messagevisor test
```

## CLI: safe to run

All `messagevisor` CLI commands are local and safe to run without confirmation. Most useful during authoring:

| Command                                                          | Purpose                            |
| ---------------------------------------------------------------- | ---------------------------------- |
| `npx messagevisor config --json --pretty`                        | Project configuration              |
| `npx messagevisor info`                                          | Entity counts                      |
| `npx messagevisor lint`                                          | Validate definitions               |
| `npx messagevisor list --datafiles --json`                       | Generated datafile paths and sizes |
| `npx messagevisor list --messages --target=web`                  | Messages in a target               |
| `npx messagevisor list --locales`                                | Active locales                     |
| `npx messagevisor list --targets`                                | Active targets                     |
| `npx messagevisor evaluate --message=<key> --locale=<locale>`    | Evaluate one message               |
| `npx messagevisor evaluate --rawMessage='...' --locale=<locale>` | Evaluate raw formatting            |
| `npx messagevisor evaluate --segment=<key> --context='...'`      | Test a segment                     |
| `npx messagevisor test [--keyPattern=...]`                       | Run test specs                     |
| `npx messagevisor build [--target=...] [--locale=...]`           | Build datafiles                    |
| `npx messagevisor catalog`                                       | Browse Catalog in dev mode         |
| `npx messagevisor find-duplicates --locale=<locale>`             | Duplicate translations             |
| `npx messagevisor find-usage --message=<key>`                    | Authored relationships              |

Full command reference is in [references/cli.md](references/cli.md). Prefer CLI over grepping when answering questions about the project.

## What not to do

- Do not edit `datafiles/` or `catalog/`. They are generated.
- Do not change `namespaceCharacter` without updating app imports, tests, codegen, and SDK calls.
- Do not add a message without confirming it is included in the relevant targets.
- Do not change module setup in just one place. Keep CLI config and runtime registration in sync.
- Do not put runtime-only context values in a target `context` field. Use only values guaranteed to be true for every use of that target datafile.
- Do not skip `npx messagevisor lint` after edits.
