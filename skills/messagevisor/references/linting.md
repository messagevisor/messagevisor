# Linting

`npx messagevisor lint` validates authored Messagevisor definitions before build or deployment. It checks structure, references, formats, conditions, tests, and some ICU style references when the ICU module is active.

## Run lint

```bash
npx messagevisor lint
npx messagevisor lint --json --pretty
```

For sets:

```bash
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
- ICU syntax and named format references when `lintIcu` is enabled.
- Namespace and override key separator constraints.
- Source-locale presence, ICU argument/tag parity, reviewed translation hashes, and stale translations when `sourceLocale` is configured.
- Archived entity references, target patterns that match nothing, and target context values that violate attribute schemas.

Lint does not prove that copy reads well or that runtime output matches product expectations. Use tests, examples, evaluate, and Catalog review for behavior.

## Common fixes

### Missing referenced entity

Search for the referenced key before creating a new file:

```bash
npx messagevisor list --messages
npx messagevisor list --segments
npx messagevisor list --attributes
```

If a key is missing, either correct the reference or add the entity in the right directory.

### Invalid condition

Inspect the attribute definition. Operators and values must match the attribute type and enum constraints.

```yml
conditions:
  - attribute: plan
    operator: equals
    value: pro
```

If the attribute type is `string` with `enum: [free, pro]`, using `operator: greaterThan` is invalid.

### Invalid ICU format reference

If a message uses `{amount, number, money}`, verify that the active locale or an ancestor defines `formats.number.money`. Remember format inheritance replaces whole style objects by style name. A child style named `money` does not inherit missing properties from the parent `money` style.

If a project intentionally stores text that looks like ICU but should not be validated, `lintIcu: false` can disable only the ICU-specific lint pass. Schema, reference, condition, format shape, and test checks still run.

### Inline ICU skeleton blocked

Either move the style into named locale formats, or intentionally enable:

```js
module.exports = {
  icuSkeleton: true,
};
```

Prefer named formats for reusable product copy.

### Stale or structurally incompatible translation

When `sourceLocale` is configured, translated copy must use the same ICU arguments and rich-text tags as the source. A `translationStates.<locale>.sourceHash` identifies the source text that was reviewed; lint reports it as stale after source copy changes. Update the translation, then record the new source hash and workflow status.

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

```bash
npx messagevisor test
npx messagevisor examples
npx messagevisor build
```

For a narrow message issue:

```bash
npx messagevisor evaluate --message=<key> --locale=<locale> --target=<target>
```
