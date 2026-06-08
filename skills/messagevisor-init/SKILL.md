---
name: messagevisor-init
description: "Use this skill when starting a new Messagevisor project or adding Messagevisor to an existing repository. Trigger on `npx messagevisor init`, bootstrapping translations, choosing YAML or JSON starters, environments starter, first locale, first message, first target, install steps, or initial validation."
---

# Initialize a Messagevisor project

Use this when there is no `messagevisor.config.js` yet or the user wants a new starter project.

## Bootstrap

```sh
npx messagevisor init
npm install
npx messagevisor lint
npx messagevisor build
```

Starters:

```sh
npx messagevisor init
npx messagevisor init --project=json
npx messagevisor init --project=environments
```

Use `environments` when the user wants dev, staging, production, or promotion flows. It creates a sets-based shape.

If the current directory is not empty, `init` may prompt for a child directory. Use `--overwrite` only when the user intends to initialize in place. Existing conflicting files are skipped rather than blindly replaced.

## First files to understand

- `messagevisor.config.js`: parser, modules, paths, sets.
- `locales/`: locale definitions.
- `messages/`: message definitions.
- `targets/`: datafile definitions.
- `datafiles/`: generated output after build.

## Add ICU early if needed

```sh
npm install @messagevisor/module-icu
```

```js
const { createICUModule } = require("@messagevisor/module-icu");

module.exports = {
  modules: [createICUModule()],
};
```

## First validation

```sh
npx messagevisor config
npx messagevisor info
npx messagevisor lint
npx messagevisor test
npx messagevisor build
npx messagevisor catalog
```

Do not commit generated output unless the project policy wants generated datafiles or Catalog artifacts in Git.
