---
name: messagevisor-codegen
description: "Use this skill when generating typed TypeScript helpers from a Messagevisor project. Trigger on `messagevisor generate-code`, typed message keys, autocomplete, generated helpers, TypeScript ergonomics, `--react`, `--target`, `--includeMessages`, `--excludeMessages`, `--set`, or replacing hard-coded message key strings."
---

# Code generation

Code generation improves TypeScript ergonomics. It does not replace datafiles or the runtime SDK.

## Command

```sh
npx messagevisor generate-code --language typescript --out-dir src/generated
```

React-flavored output:

```sh
npx messagevisor generate-code --language typescript --out-dir src/generated --react
```

Only TypeScript is currently supported.

## Filtering

Generate helpers for the surface an app actually uses:

```sh
npx messagevisor generate-code --language typescript --out-dir src/generated --target=web
npx messagevisor generate-code --language typescript --out-dir src/generated --includeMessages='auth*'
npx messagevisor generate-code --language typescript --out-dir src/generated --excludeMessages='internal*'
```

For set projects:

```sh
npx messagevisor generate-code --language typescript --out-dir src/generated --set=production
```

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
