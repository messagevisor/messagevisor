# Modules

Modules extend runtime evaluation. They can format strings, transform output, report diagnostics, register condition resolvers, and read per-call `moduleOptions`.

Use modules when behavior changes evaluated output or runtime behavior. Use parsers for source file formats.

## Inspect first

1. Read `messagevisor.config.js`.
2. Search application code for `createMessagevisor`, `MessagevisorProvider`, Vue plugin setup, or react-intl compatibility setup.
3. Compare project modules with runtime modules. They should match.

```bash
rg "create.*Module|modules:|createMessagevisor|MessagevisorProvider" .
npx messagevisor examples --json --pretty
npx messagevisor test
```

## Built-in modules

| Package                                     | Use for                                                            |
| ------------------------------------------- | ------------------------------------------------------------------ |
| `@messagevisor/module-icu`                  | ICU MessageFormat, plurals, selects, named formats, rich text tags |
| `@messagevisor/module-interpolation`        | Lightweight `{name}` placeholder replacement                       |
| `@messagevisor/module-featurevisor`         | Feature and experiment condition resolution through Featurevisor   |
| `@messagevisor/module-missing-translations` | Missing translation diagnostics and reporting                      |

## Register in project config

```js
const { createICUModule } = require("@messagevisor/module-icu");

module.exports = {
  modules: [createICUModule()],
};
```

Project config affects `evaluate`, `examples`, `test`, Catalog examples, and lint checks that depend on module behavior.

## Register in runtime

```js
import { createMessagevisor } from "@messagevisor/sdk";
import { createICUModule } from "@messagevisor/module-icu";

const m = createMessagevisor({
  datafile,
  modules: [createICUModule()],
});
```

The CLI and app are separate runtimes. If one has ICU and the other does not, `Hello {name}` can evaluate correctly in tests but render literally in production.

## Ordering

Module order matters.

- Use interpolation before ICU only when one module intentionally produces syntax for the next one.
- Use ICU before final post-processing transforms.
- Keep custom transforms after formatting unless they intentionally rewrite source syntax.
- Give custom modules stable names if they need diagnostics, `removeModule(name)`, or name-keyed `moduleOptions`.
- `addModule()` returns an async removal function. `removeModule(name)` is async; removal clears diagnostic subscriptions and closes the module.
- Failed setup reports `module_setup_error`, does not register the module, and closes partial resources.
- Resolver registrations belong to the module that installed them. Failed setup or removal restores the previous resolver; spawned instances observe the parent's current resolver dynamically.
- Event and diagnostic observers are isolated; one throwing observer must not interrupt SDK behavior.

## Per-call options

Modules read options by module name:

```js
m.translate("welcome", values, {
  moduleOptions: {
    icu: { ignoreTags: false },
  },
});
```

Use this for narrow rendering choices, not project-wide behavior.

## Custom modules

Custom modules may implement:

- `setup` for registration-time work
- `format` for syntax handling and formatting
- `transform` for final output changes
- `close` for cleanup

Rules for safe custom modules:

- Return `undefined` when the module does not own the current value.
- Preserve non-string rich outputs unless transforming rich output is the goal.
- Avoid swallowing diagnostics from other modules.
- Put custom module diagnostic context in `details`; the SDK attaches module provenance and normalizes the final diagnostic envelope.
- Test both keyed translations and `formatMessage()` when the module supports raw messages.

## Verification

```bash
npx messagevisor lint
npx messagevisor examples
npx messagevisor test
npx messagevisor evaluate --rawMessage='Hello {name}' --locale=en --values='{"name":"Ada"}'
```

If runtime behavior still differs, inspect the built datafile and the app's SDK initialization. Module mismatch is the most common cause.
