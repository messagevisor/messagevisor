# Messagevisor agent skills

This directory contains Agent Skills for helping AI coding agents work accurately in Messagevisor projects.

Each skill is a directory with a `SKILL.md` file. The format is intentionally simple: YAML frontmatter with `name` and `description`, followed by Markdown instructions. This shape works with tools that understand Agent Skills and with registries such as skills.sh.

## Installation

From a compatible agent or skill manager, install the repository or individual skill directories. The skills.sh CLI documents installation with:

```sh
npx skills add owner/repo
```

When this repository is published, developers can install the skill set from the repository and let their agent load the relevant skill on demand.

## Skills

| Skill | Use when |
| --- | --- |
| `messagevisor` | You need the project mental model, entities, workflow, and package map |
| `messagevisor-init` | You are starting a new Messagevisor project or adding one to a repo |
| `messagevisor-authoring` | You are writing messages, locales, formats, examples, or inheritance |
| `messagevisor-targets` | You are deciding what goes into target datafiles |
| `messagevisor-overrides` | You are adding conditional translations with attributes, segments, or override conditions |
| `messagevisor-icu` | You are authoring ICU plurals, selects, rich text, or named formats |
| `messagevisor-testing` | You are writing or fixing project tests |
| `messagevisor-catalog` | You are using the generated Catalog UI for review or dev feedback |
| `messagevisor-cli` | You are running or scripting `npx messagevisor` commands |
| `messagevisor-sdk` | You are wiring datafiles into an app with the SDK, React, Vue, or react-intl compatibility |
| `messagevisor-sets` | You are working with `sets: true` projects and promotion flows |
| `messagevisor-csv` | You are exporting or importing translations for translator handoff |
| `messagevisor-codegen` | You are generating typed TypeScript helpers |
| `messagevisor-featurevisor` | You are integrating Messagevisor copy with Featurevisor-style flags and experiments |

## Source of truth

These skills summarize the current repository. When code and website docs disagree, prefer the implementation in `packages/`, then update docs separately if needed.
