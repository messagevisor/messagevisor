---
name: messagevisor-overrides
description: "Use this skill for conditional translations in Messagevisor. Trigger on message `overrides`, attributes, segments, conditions, audience-specific copy, platform or plan variants, target context, feature or experiment gates, override ordering, or conditional runtime behavior."
---

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

Attributes are lint-time schema. The app still supplies runtime context.

## Segments

```yml
description: Pro plan users
conditions:
  attribute: plan
  operator: equals
  value: pro
```

Conditions can be composed with `and`, `or`, and `not`. Use segments when a condition is reused or meaningful enough to name.

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
```

Overrides are evaluated top to bottom. First match wins. Reordering overrides changes behavior.

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

## Target context

```yml
context:
  platform: web
```

Use target context only for values guaranteed by that target. It lets the builder reduce output for the datafile.

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

Use `messagevisor-featurevisor` for resolver wiring.

## Verification

```sh
npx messagevisor lint
npx messagevisor evaluate --message=checkout.banner --locale=en-US --target=web --context='{"plan":"pro"}'
npx messagevisor test --keyPattern=checkout
npx messagevisor catalog
```

Add tests for important conditional copy. Add examples when reviewers need to see variants in Catalog.
