---
name: messagevisor-linting
description: "Use this skill when fixing Messagevisor lint errors, schema problems, invalid references, invalid conditions, ICU format references, or CI validation failures."
---

# Messagevisor linting

`npx messagevisor lint` validates authored Messagevisor definitions before build or deployment. It checks structure, references, formats, conditions, tests, and some ICU style references when the ICU module is active.

## Run lint

```sh
npx messagevisor lint
npx messagevisor lint --json --pretty
```

For sets:

```sh
npx messagevisor lint --set=staging
```

Use JSON output when an agent needs to group errors by file, line, entity, or rule.

## What lint checks

- Required and unknown fields on locales, messages, attributes, segments, targets, and tests.
- Attribute references in conditions.
- Operator and value compatibility for condition attribute types.
- Segment references in overrides and tests.
- Message, locale, segment, and target references in tests.
- Locale format preset shape and plausible currency codes.
- ICU named format references when ICU is configured.
- Namespace and override key separator constraints.

Lint does not prove that copy reads well or that runtime output matches product expectations. Use tests, examples, evaluate, and Catalog review for behavior.

## Common fixes

### Missing referenced entity

Search for the referenced key before creating a new file:

```sh
npx messagevisor list --messages
npx messagevisor list --segments
npx messagevisor list --attributes
```

If a key is missing, either correct the reference or add the entity in the right set/root directory.

### Invalid condition

Inspect the attribute definition. Operators and values must match the attribute type and enum constraints.

```yml
conditions:
  - attribute: plan
    operator: equals
    value: pro
```

### Invalid ICU format reference

If a message uses `{amount, number, money}`, verify that the active locale or an ancestor defines `formats.number.money`. Remember current format inheritance replaces whole style objects by style name. A child style named `money` does not inherit missing properties from the parent `money` style.

### Inline ICU skeleton blocked

Either move the style into named locale formats, or intentionally enable:

```js
module.exports = {
  icuSkeleton: true,
};
```

Prefer named formats for reusable product copy.

### Set-specific failures

Check whether `sets: true` is configured, then inspect the same path under the failing set:

```text
sets/<set>/messages
sets/<set>/locales
sets/<set>/targets
```

Do not fix one set by editing another unless the user is promoting or intentionally syncing sets.

## After lint passes

Run behavior checks:

```sh
npx messagevisor test
npx messagevisor examples
npx messagevisor build
```

For a narrow message issue:

```sh
npx messagevisor evaluate --message=<key> --locale=<locale> --target=<target>
```
