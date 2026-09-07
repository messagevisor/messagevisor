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

When `sourceLocale` is configured, translations preserve compatible ICU value contracts and required rich text tags while allowing locale appropriate grammar. Reviewed state requires both `sourceHash` and `targetHash` so changing either text invalidates approval. Revisit old reviewed entries missing a target hash through human review, not bulk hash acceptance.

## Readiness and quality

```bash
npx messagevisor readiness --set=production --locale=nl --target=web --requireReviewed --requireDirect --maxMissing=0 --maxStale=0 --json
npx messagevisor quality --pseudo=accent --expansion=0.3 --json
npx messagevisor quality --pseudo=rtl --bidi --json
```

Both commands support set, locale, target, and `includeMessages`/`excludeMessages` filters. Readiness defaults missing and stale limits to zero. Review and direct requirements are explicit gates, not synonyms for translation presence.

For readiness, quality, and review previews, `--set` takes one value and omission visits all sets. Locale and target selectors are repeatable; repeated override selectors belong to review only. Readiness excludes the configured source locale by default; explicitly selected source copy does not require translation review. Without `sourceLocale`, readiness can report resolution but cannot certify `--requireReviewed`. Confirm the selected scope before accepting a passing gate. Use the saved preview and input `review` flow in [authoring.md](authoring.md#translation-workflow-state) to record approvals, never a bare apply or bulk hash rewrite. Rerun readiness afterwards.

Quality is preview only, with no filesystem writes or apply step. It checks authored context budgets and forbidden terminology, not interpolation value sizes. Opt in bidi checks report unsafe embedding or override controls, unbalanced isolates, and unisolated dynamic arguments in RTL copy. Normal builds are unchanged. Treat pseudo output as a test aid, not a translation to publish.

Forbidden terms use exact, case sensitive substring matching across possible literal paths, including text split by tags or branch boundaries. Alternatives are not concatenated together; unknown runtime values break literal matching. Dynamic output still needs rendered tests. `preferred` and `doNotTranslate` are translator guidance, not automatic enforcement. Grapheme budgets concern the longest literal branch path.

For bidi checks, explicit locale direction wins; otherwise the host's `Intl.Locale` data supplies it. If inference fails, `bidi_unknown_direction` fails the report rather than hiding incomplete coverage. Set the locale's direction explicitly and rerun. In RTL copy, isolate substitutions that are not explicitly documented as RTL using LRI or FSI, with balanced isolates in each branch.

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
