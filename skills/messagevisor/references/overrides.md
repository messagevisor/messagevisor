# Overrides, attributes, and segments

Conditional copy uses three layers:

1. Attributes define runtime context fields.
2. Segments define reusable conditions.
3. Message overrides provide alternate translations.

Targets can add known `context` so impossible branches are removed during build.

## Attributes

```yml
description: Subscription plan
type: string
enum:
  - free
  - pro
  - enterprise
```

Attributes are lint-time schema. The app still supplies actual runtime context values.

Supported types: `boolean`, `string`, `integer`, `double`, `date`, `object`, `array`.

## Segments

```yml
description: Pro plan users
conditions:
  attribute: plan
  operator: equals
  value: pro
```

Conditions can be composed with `and`, `or`, and `not`. Use segments when a condition is reused across messages or meaningful enough to name.

Complex segment with nesting:

```yml
description: Dutch web users on Pro
conditions:
  and:
    - attribute: platform
      operator: equals
      value: web
    - or:
        - attribute: account.country
          operator: equals
          value: NL
        - attribute: account.country
          operator: equals
          value: BE
```

## Message overrides

```yml
description: Welcome message
translations:
  en-US: Welcome back
overrides:
  - key: pro
    segments:
      - plan-pro
    translations:
      en-US: Welcome back to Pro
  - key: dutch-web
    segments:
      and:
        - dutch-account
        - platform-web
    translations:
      en-US: Welcome back. Your Dutch workspace is ready.
```

Overrides are evaluated top to bottom. First match wins. Reordering overrides changes behavior.

In sets-based projects, add `promotable: false` to an override when that branch should stay local to its current set. Promotion skips that source override, protects a matching non-promotable destination override, and does not promote dependencies used only by skipped overrides.

Inline conditions are fine for one-off branches:

```yml
overrides:
  - key: ios
    conditions:
      attribute: platform
      operator: equals
      value: ios
    translations:
      en-US: Continue on iPhone
```

## Override keys

Each override's `key` must be unique within that message. Use stable, descriptive keys. Changing an override key is safe (it is not like a rule key in Featurevisor), but keeping keys stable makes history and test assertions easier to follow.

## Target context

```yml
context:
  platform: web
```

Use target context only for values guaranteed by that target. The builder uses it to reduce output, removing override branches that can never match.

## Feature and experiment conditions

Feature and experiment conditions can appear in segments and override conditions when the runtime module supplies resolvers:

```yml
conditions:
  feature: new-checkout
  operator: isEnabled
```

```yml
conditions:
  experiment: checkout-copy
  operator: hasVariation
  variation: treatment
```

See `featurevisor.md` for resolver wiring.

## Operators reference

Common operators:

| Operator | Use |
| --- | --- |
| `equals` | Exact match |
| `notEquals` | Not equal |
| `contains` | Substring or array contains |
| `notContains` | Does not contain |
| `startsWith` | String starts with |
| `endsWith` | String ends with |
| `greaterThan` | Numeric or date comparison |
| `greaterThanOrEquals` | Numeric or date comparison |
| `lessThan` | Numeric or date comparison |
| `lessThanOrEquals` | Numeric or date comparison |
| `before` | Date is before |
| `after` | Date is after |
| `includes` | Array includes value |
| `notIncludes` | Array does not include value |
| `isEnabled` | Feature flag is enabled |
| `isDisabled` | Feature flag is disabled |
| `hasVariation` | Experiment has given variation |

## Verification

```bash
npx messagevisor lint
npx messagevisor evaluate --message=checkout.banner --locale=en-US --target=web --context='{"plan":"pro"}'
npx messagevisor test --keyPattern=checkout
npx messagevisor catalog
```

Add tests for important conditional copy. Add examples when reviewers need to see variants in Catalog.
