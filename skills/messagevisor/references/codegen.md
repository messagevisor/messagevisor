# Code generation

Code generation produces typed TypeScript helpers from project message keys. It improves ergonomics but does not replace datafiles or the runtime SDK.

## Command

```bash
npx messagevisor generate-code --language typescript --out-dir src/generated
```

React-flavored output:

```bash
npx messagevisor generate-code --language typescript --out-dir src/generated --react
```

Only TypeScript is currently supported.

## Instance bound helpers

Generated `createTranslations(m)` returns `{ t, translate }` bound to the supplied root SDK instance and typed by the generated authored message keys. Use it with a request owned root instance, or bind to a shared root and pass locale and context per call. The factory does not fetch datafiles or manage instance cleanup.

```ts
import { createTranslations } from "./generated";

const { t } = createTranslations(sharedRoot);
return t("dashboard.welcome", { name: "Ada" }, { locale, context: { plan } });
```

The legacy generated `setInstance(m)` and global `t`/`translate` remain available for a single application instance. Never change that global instance for concurrent server requests. The factory captures its own instance without changing global state.

## Filtering

Generate helpers for the surface an app actually uses:

```bash
npx messagevisor generate-code --language typescript --out-dir src/generated --target=web
npx messagevisor generate-code --language typescript --out-dir src/generated --includeMessages='auth*'
npx messagevisor generate-code --language typescript --out-dir src/generated --excludeMessages='internal*'
```

For set projects:

```bash
npx messagevisor generate-code --language typescript --out-dir src/generated --set=production
```

Messagevisor does not yet ship an application source extractor. For a lightweight CI check, regenerate committed typed keys, search literal `t("...")`/`translate("...")` calls using the application's actual wrapper names, and compare them with `npx messagevisor list --messages --json`. Report dynamic calls as unknown rather than declaring their possible keys unused. Runtime `deprecated_message` diagnostics remain useful evidence when retiring keys.

## When to use

Use codegen when:

- The app is TypeScript.
- Message key renames are common.
- Developers want autocomplete and literal key types.
- A team prefers generated key helpers over raw strings.

Skip it for small JavaScript projects where strings are acceptable.

## Workflow

1. Run `lint` first.
2. Generate into a predictable directory.
3. Decide whether generated files are committed or produced in CI.
4. Re-run generation after message, locale, or target changes.

Do not hand-edit generated helper files.
