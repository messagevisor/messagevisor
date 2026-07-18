---
name: messagevisor
description: Author, test, build, and query Messagevisor projects. A Git-native i18n and l10n toolkit. Use whenever the user mentions Messagevisor, edits files under messages/, locales/, attributes/, segments/, targets/, or tests/, runs npx messagevisor commands, or works in a directory containing messagevisor.config.js. Also use for plain-language copy asks in such projects — change/reword button or UI text, add a language, show different copy for a plan/platform/country/experiment, fix plurals or currency/date formatting, RTL locales, or hand copy off to translators. Covers authoring messages and locales, conditional copy with overrides and segments, ICU syntax, targets and datafile generation, testing, linting, Catalog review, CSV translator workflows, code generation, sets-based release lanes, SDK integration (JS, React, Vue), deployment, and AI-assisted translation.
---

# Messagevisor

You are helping the user author, test, build, or query a [Messagevisor](https://messagevisor.com) project. Messagevisor is a Git-based translation management toolkit. Projects are standalone YAML or JSON definitions that compile into per-target and per-locale datafiles consumed by SDKs.

```text
authoring files -> npx messagevisor build -> datafiles/messagevisor-<target>-<locale>.json -> @messagevisor/sdk
```

## Know your audience

Messagevisor is used by engineers, product managers, designers, and translators. Calibrate:

- **Not sure of the vocabulary?** "Change the checkout button text" is a translation edit; "show different copy for Pro users" is an override with a segment; "add German" is a locale plus translations; "why does it literally say `{name}`" is almost always a missing formatting module in the app. Do the mapping for them, then show the result in their language: what copy changed, who sees which variant, what happens next.
- **Safe vs. risky changes.** Editing translation text, adding a translation or locale, adding a new message, adding examples/tests — routine; do them confidently. **Renaming a message key** breaks every `t("old.key")` call and codegen in the apps — add the new key and deprecate the old one instead. **Reordering overrides** changes who sees what (first match wins). **Overriding an inherited format style** replaces the whole style object, silently dropping properties you didn't repeat. **Archiving or deleting** anything still referenced breaks lint or, worse, runtime copy — `find-usage` first. Warn plainly before doing any of these.
- **Always close the loop.** After any change, say in one or two sentences what will happen when it ships (e.g. "once this merges and the datafiles are published, Dutch Pro users on web see the new banner; everyone else keeps the current copy").
- For anyone who wants to _see_ the copy, offer the **Catalog** — a browsable UI with live reload (see [Visual review with Catalog](#visual-review-with-catalog)).

## Orient yourself first

### No project yet? Interview, then scaffold

**If there is no `messagevisor.config.js`** anywhere in the working tree, there is no Messagevisor project yet. If the user is in an application repo consuming datafiles, that's SDK work — see [references/sdk.md](references/sdk.md). For a new project, ask a few setup questions first — these shape every file written afterwards:

1. **Which languages?** The locale list, plus the authoring source language (becomes `sourceLocale` if they want translation-state tracking).
2. **Which apps consume the copy?** One target per app/surface (`web`, `mobile`, `admin`) — each target × locale pair becomes one datafile.
3. **How rich is the copy?** Plurals, selects, or number/date formatting → the ICU module; simple `{name}` placeholders → the interpolation module.
4. **Environments?** dev/staging/production lanes with promotion → the sets-based starter.
5. **File format?** YAML (default) or JSON.

Then scaffold:

```bash
npx messagevisor init                        # YAML starter
npx messagevisor init --project=json
npx messagevisor init --project=environments # sets-based dev/staging/production lanes
npm install
npx messagevisor lint && npx messagevisor build
```

If the current directory is not empty, `init` may prompt for a child directory. Use `--overwrite` only when the user wants to initialize in place. [templates/example-project/](templates/example-project/) is an alternative lint- and test-clean starting point.

### Existing project? Detect the setup before touching anything

Always run these at the start of a Messagevisor task:

```bash
npx messagevisor config --json --pretty
npx messagevisor info
```

From the config, note:

- `parser` — if `"json"`, author in JSON; otherwise YAML.
- `sets` — if `true`, definitions live under `sets/<name>/...` not at the root, and commands take `--set`.
- `modules` — the list of active modules. Match these in the runtime SDK.
- `namespaceCharacter` — the separator used to derive message keys from paths. Default is `"."`.
- `sourceLocale` — if set, the project tracks translation workflow state; keep source copy and `translationStates` in sync.
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

## How a translation resolves

Most authoring and debugging questions are really questions about where in this two-phase model something happens.

**At build time** (per target × locale datafile):

1. Target `includeMessages`/`excludeMessages` decide which messages are in the datafile at all.
2. Locale translation inheritance is resolved (`inheritTranslationsFrom` chains); a key with no translation anywhere in the chain is omitted from that locale's datafile.
3. Format inheritance and target `formats` overlays are resolved (whole style objects replace, never merge).
4. Target `context` prunes override branches that can never match for that target.

**At runtime** (per `translate()` call):

5. Overrides are evaluated top to bottom against runtime context (and feature-flag/experiment resolvers); **first match wins**, otherwise the base translation is used.
6. Modules format the chosen string with the call's `values`, named formats, currency, and time zone (ICU plurals/selects, interpolation, rich text).

So: "message missing" is a build-time question (target inclusion, inheritance) answered by `list --messages --target=…` and `evaluate`; "wrong variant" is a runtime question (override order, context); "literal `{name}` or ICU syntax showing" is a module question (project config vs app registration). The full reasoning checklist is in [references/examples.md](references/examples.md).

## When to load which reference

This file loads eagerly. The files below load only when relevant. Read them in full before authoring or debugging in that area.

| Task                                                                                                                                                                        | Read                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Change or diagnose `messagevisor.config.js`                                                                                                                                 | [references/configuration.md](references/configuration.md)     |
| Add or edit messages, locales, formats, inheritance                                                                                                                         | [references/authoring.md](references/authoring.md)             |
| Work with targets, datafile inclusion, target context                                                                                                                       | [references/targets.md](references/targets.md)                 |
| Conditional copy: overrides, attributes, segments                                                                                                                           | [references/overrides.md](references/overrides.md)             |
| ICU plurals, selects, named formats, rich text                                                                                                                              | [references/icu.md](references/icu.md)                         |
| Modules: setup, ordering, custom transforms                                                                                                                                 | [references/modules.md](references/modules.md)                 |
| Examples, raw message evaluation, reasoning model                                                                                                                           | [references/examples.md](references/examples.md)               |
| Write or fix test specs, run tests                                                                                                                                          | [references/testing.md](references/testing.md)                 |
| Fix lint errors, schema problems, invalid references                                                                                                                        | [references/linting.md](references/linting.md)                 |
| Browse or host the Catalog UI                                                                                                                                               | [references/catalog.md](references/catalog.md)                 |
| Any CLI command, flags, scripting                                                                                                                                           | [references/cli.md](references/cli.md)                         |
| Wire datafiles into an application (SDK, React, Vue)                                                                                                                        | [references/sdk.md](references/sdk.md)                         |
| Build, CI, CDN publishing, revisions, state files                                                                                                                           | [references/deployment.md](references/deployment.md)           |
| Sets projects, promotion flows, dev/staging/production                                                                                                                      | [references/sets.md](references/sets.md)                       |
| CSV export and import for translator handoff                                                                                                                                | [references/csv.md](references/csv.md)                         |
| Agent-assisted translation workflows                                                                                                                                        | [references/ai-translations.md](references/ai-translations.md) |
| Generate typed TypeScript helpers                                                                                                                                           | [references/codegen.md](references/codegen.md)                 |
| Feature flag or experiment conditional copy                                                                                                                                 | [references/featurevisor.md](references/featurevisor.md)       |
| **Common patterns** — audience copy, A/B copy tests, decoupled releases, deprecation, promotion, platform copy, regional variants, RTL, ownership, onboarding non-engineers | [references/recipes.md](references/recipes.md)                 |

Per-entity templates live in [templates/](templates/). Copy and adapt rather than writing from memory.

A complete end-to-end example project lives in [templates/example-project/](templates/example-project/). It passes `lint` and `test` as-is — use it as the source of truth for "show me how a Messagevisor project hangs together" requests.

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

A child locale (or target overlay) that overrides `formats.number.money` replaces the entire `money` style object. It does not merge individual properties. Repeat every intended property in the overriding style object.

### 5. Message keys are contracts with application code

Apps call `t("auth.signin")` and codegen emits typed keys. Renaming or deleting a key breaks them on the next datafile update. Rename by adding the new key, migrating app calls, then deprecating (`deprecated: true`) and later archiving the old one. Run `npx messagevisor find-usage --message=<key>` before removing anything.

### 6. Do not edit generated output as source

`datafiles/`, `catalog/`, and `.messagevisor/` state files are generated. Do not edit them directly, and do not commit them unless the project's convention does.

### 7. After any edit, lint

```bash
npx messagevisor lint
```

If you wrote or changed a test spec, also run:

```bash
npx messagevisor test --keyPattern=<theKey>
```

## Common authoring flows

### Adding a message

1. Read existing `messages/` files to match conventions.
2. Confirm the message path lands in the intended target by checking `includeMessages` and `excludeMessages` in `targets/<key>.yml`.
3. Create `messages/<path>.yml` from [templates/message.yml](templates/message.yml).
4. Add examples when the copy has interpolation, ICU syntax, overrides, or tricky formatting.
5. Run `npx messagevisor lint` then `npx messagevisor evaluate --message=<key> --locale=<locale>`.
6. Offer to add a test spec at `tests/messages/<path>.spec.yml`.
7. Close the loop: tell the user what apps must do (`t("<key>")`, regenerate codegen if used).

### Adding conditional copy (overrides)

Read [references/overrides.md](references/overrides.md). Before referencing a segment, confirm `segments/<key>.yml` exists or create it from [templates/segment.yml](templates/segment.yml). Place the new override at the right position — first match wins. Run `npx messagevisor lint` after edits.

### Adding a locale

Read [references/authoring.md](references/authoring.md) on inheritance. Create `locales/<key>.yml` from [templates/locale.yml](templates/locale.yml). Check whether existing targets list this locale under `locales:` — a locale outside every target produces no datafiles.

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

Promotion previews by default; `--apply` writes destination files — treat applying like any other reviewed edit.

### Debugging a translation

Use `evaluate` as the fastest check:

```bash
npx messagevisor evaluate --message=<key> --locale=<locale> --target=<target> --context='{"plan":"pro"}'
```

Walk [the resolution model](#how-a-translation-resolves): target inclusion → locale translation and inheritance → target context → override match → modules. The module mismatch (project has ICU, app doesn't) is the classic silent killer — check the app's `createMessagevisor` setup, not just the YAML.

### Translator handoff

Read [references/csv.md](references/csv.md). Safe round trip:

```bash
npx messagevisor export --locale=nl-NL --target=web --onlyUntranslated --output=exports/nl-NL-web.csv
# fill the file
npx messagevisor import exports/nl-NL-web.csv --locale=nl-NL
npx messagevisor import exports/nl-NL-web.csv --locale=nl-NL --apply
npx messagevisor lint && npx messagevisor test
```

Import previews by default — show the user the preview before `--apply`.

### Visual review with Catalog

`npx messagevisor catalog` serves a browsable UI of the whole project **in dev mode: it watches authored inputs and live-reloads the browser on every save**. Every message with its translations, overrides, examples, and target inclusion; every locale with inherited formats; targets, segments, tests (matrix-expanded), and history. That makes it the ideal companion to an authoring session:

1. Start it once as a background process (it's local and read-only — safe to leave running).
2. If you have a browser tool, open the printed URL in it; otherwise give the user the URL.
3. Author changes as usual — every edit shows up in the Catalog on save, so the user watches copy, variants, and coverage evolve visually while they prompt you.

Offer this proactively when a session involves several copy changes or when the user is less comfortable reading YAML (PMs, designers, translators) — prompting plus a live Catalog is the best way to review copy. Details in [references/catalog.md](references/catalog.md).

### Recipes for higher-level use cases

When the request matches a named pattern — audience-targeted copy, A/B copy variants, consistent formatting, decoupling copy releases from deployments, deprecating keys, environment promotion, platform-specific copy, regional language variants, RTL support, ownership/CODEOWNERS, onboarding non-engineers — open [references/recipes.md](references/recipes.md) and adapt the matching section. It links back to the granular references for shape details.

## Changes ship through Git

Messagevisor is GitOps: nothing you write reaches users until it travels the pipeline —

**edit → PR review → merge → CI (lint, test, build) → datafiles published to CDN/host → each app's next datafile fetch.**

Practical consequences:

- **Don't commit or push unless asked.** Editing files and running the CLI is your job; landing the change is the user's (or their CI's).
- Keep one logical change per branch/PR (a copy change, a new locale, an override) — copy gets reviewed like code, often by PMs and translators via CODEOWNERS.
- Update or add the matching `.spec.yml` in the same change when behavior expectations shift.
- When the user asks **"when will this be live?"**, walk that pipeline: after merge, CI publishes the datafiles, and apps pick the change up on their next datafile fetch. Apps that bundle datafiles at build time only update when they redeploy — a reason to recommend CDN-served datafiles ([references/deployment.md](references/deployment.md)).

## CLI: safe to run

All `messagevisor` CLI commands are local and safe to run without confirmation. `import`, `promote`, and `prune` preview by default — only `--apply` writes files, so show the preview first. Most useful during authoring:

| Command                                                          | Purpose                                     |
| ---------------------------------------------------------------- | ------------------------------------------- |
| `npx messagevisor config --json --pretty`                        | Project configuration                       |
| `npx messagevisor info`                                          | Entity counts                               |
| `npx messagevisor lint`                                          | Validate definitions (run after every edit) |
| `npx messagevisor list --messages --target=web`                  | Messages in a target                        |
| `npx messagevisor list --locales` / `--targets` / `--segments`   | Other entity lists                          |
| `npx messagevisor list --datafiles --json`                       | Generated datafile paths and sizes          |
| `npx messagevisor find-usage --message=<key>`                    | Who references this before rename/removal   |
| `npx messagevisor diff --format=markdown`                        | Human-readable Git copy review              |
| `npx messagevisor evaluate --message=<key> --locale=<locale>`    | Evaluate one message end to end             |
| `npx messagevisor evaluate --rawMessage='...' --locale=<locale>` | Evaluate raw formatting                     |
| `npx messagevisor evaluate --segment=<key> --context='...'`      | Test a segment                              |
| `npx messagevisor create --messages --keys=...`                  | Scaffold minimal entity files               |
| `npx messagevisor test [--keyPattern=...]`                       | Run test specs                              |
| `npx messagevisor build [--target=...] [--locale=...]`           | Build datafiles                             |
| `npx messagevisor catalog`                                       | Live-reloading Catalog UI (dev mode)        |
| `npx messagevisor export` / `import` (preview-first)             | Translator CSV/JSON round trip              |
| `npx messagevisor find-duplicates --locale=<locale>`             | Duplicate translations                      |
| `npx messagevisor prune --translations` (preview-first)          | Remove translations no target ships         |

Full command reference is in [references/cli.md](references/cli.md). Prefer CLI over grepping when answering questions about the project — `evaluate`, `list`, and `find-usage` are authoritative; hand-tracing YAML is not.

## What not to do

- Do not edit `datafiles/`, `catalog/`, or `.messagevisor/`. They are generated.
- Do not rename or delete message keys as cleanup — apps and codegen depend on them. Add-new-then-deprecate, and run `find-usage` first.
- Do not reorder overrides casually — first match wins, so order is behavior.
- Do not change `namespaceCharacter` without updating app imports, tests, codegen, and SDK calls.
- Do not add a message without confirming it is included in the relevant targets.
- Do not change module setup in just one place. Keep CLI config and runtime registration in sync.
- Do not put runtime-only context values in a target `context` field. Use only values guaranteed to be true for every use of that target datafile.
- Do not run `import`, `promote`, or `prune` with `--apply` before showing the preview.
- Do not skip `npx messagevisor lint` after edits.
