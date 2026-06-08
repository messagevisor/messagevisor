# Featurevisor-style flag conditions

Messagevisor conditions can ask a runtime flag or experiment system for decisions. Featurevisor is the intended companion, but any resolver with equivalent answers can be used.

## Condition shapes

Feature flag enabled:

```yml
conditions:
  feature: new-checkout
  operator: isEnabled
```

Feature flag disabled:

```yml
conditions:
  feature: legacy-banner
  operator: isDisabled
```

Experiment variation:

```yml
conditions:
  experiment: checkout-copy
  operator: hasVariation
  variation: treatment
```

These conditions can live in segments or inline message overrides.

## Message override with experiment gate

```yml
translations:
  en-US: Continue
overrides:
  - key: checkout-treatment
    conditions:
      experiment: checkout-copy
      operator: hasVariation
      variation: treatment
    translations:
      en-US: Finish checkout
```

## Segment with flag condition

```yml
description: Users in the new checkout experiment treatment
conditions:
  experiment: checkout-copy
  operator: hasVariation
  variation: treatment
```

## Runtime responsibility

The app supplies resolvers through the Featurevisor module or SDK configuration. Messagevisor owns copy selection. The flag system owns whether a flag is enabled and which variation applies.

## Module setup

```bash
npm install @messagevisor/module-featurevisor @featurevisor/sdk
```

Register the module in both project config and SDK runtime. The module needs access to the Featurevisor SDK instance to resolve flag and experiment answers at evaluation time.

## Tests and examples

Use tests for important gates:

```yml
message: checkout.button
assertions:
  - locale: en-US
    target: web
    withFlags:
      checkout-copy: treatment
    expectedTranslation: Finish checkout
```

Use examples for Catalog review. Keep test fixtures explicit about flags and variations.

## Boundaries

- Do not duplicate full feature rollout rules inside Messagevisor when a flag system already owns them.
- Do not put user-specific flag answers in target `context`.
- Keep copy variants in Messagevisor and rollout logic in Featurevisor or the flag provider.
