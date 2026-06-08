# Messagevisor skills

Agent skills for authoring, testing, building, and querying [Messagevisor](https://messagevisor.com) projects. Messagevisor is a Git-native i18n and l10n toolkit where teams manage translations as YAML or JSON files, validate them with a CLI, and ship compact datafiles to runtime SDKs.

Installable via [`npx skills`](https://www.skills.sh):

```bash
# inside your Messagevisor project or app repo
npx skills add messagevisor/messagevisor

# or pin to the path directly
npx skills add https://github.com/messagevisor/messagevisor/tree/main/skills/messagevisor
```

Then in your agent (Claude Code, Cursor, Codex, OpenCode, etc.) ask things like:

- "Add a `dashboard.welcome` message in English and Dutch with a Pro plan variant"
- "Why is `checkout.total` rendering literal ICU syntax instead of a number?"
- "Create a `nl-NL` locale that inherits formats from `nl` but overrides money to EUR"
- "Export untranslated messages for German and prepare them for a translator"
- "Set up a dev/staging/production sets workflow with promotion flows"
- "Generate typed TypeScript helpers from the web target messages"

## What's included

A single skill, `messagevisor`, that the agent invokes (e.g. as `/messagevisor` in Claude Code) covering:

- **Authoring** — messages, locales, formats, translation inheritance, locale direction, `deprecated`, `archived`, `meta`, `promotable`.
- **Conditional copy** — overrides, attributes, segments, `and/or/not` conditions, all operators, target context.
- **ICU** — plurals, selects, selectordinals, named number/date/time formats, rich text tags, inline skeletons.
- **Modules** — ICU, interpolation, Featurevisor flags, missing-translation reporting, custom modules, ordering.
- **Targets** — message inclusion patterns, locale lists, compile-time context, format overlays, datafile options.
- **Testing** — message, segment, locale, and target test specs, matrix expansion.
- **Sets** — parallel release lanes, promotion flows, conflict resolution.
- **Deployment** — CI shape, state files, revisions, CDN publishing, Catalog hosting.
- **SDK** — core, React, Vue, react-intl compatibility.
- **Translator workflows** — CSV/JSON export and import, pruning, regional inheritance.
- **AI translations** — safe export/translate/import loop with guardrails.
- **Code generation** — typed TypeScript helpers from message keys.
- **Templates** — copy-and-adapt YAML for every common authoring shape.

## Updating

```bash
npx skills update messagevisor
```

## Reporting issues

This skill lives in the main Messagevisor monorepo: <https://github.com/messagevisor/messagevisor/issues>
