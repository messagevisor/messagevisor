---
name: messagevisor-featurevisor
description: "Use this skill when integrating Messagevisor conditional copy with Featurevisor or another feature flag and experiment system. Trigger on feature flags, experiments, `feature`, `experiment`, `isEnabled`, `isDisabled`, `hasVariation`, flag-gated copy, A/B copy variants, Featurevisor, or runtime flag resolvers."
---

# Messagevisor with Featurevisor-style flags

Messagevisor conditions can ask a runtime flag or experiment system for decisions. Featurevisor is the intended companion, but any resolver with equivalent answers can be used.

## Condition shapes

Feature flag:

```yml
conditions:
  feature: new-checkout
  operator: isEnabled
```

Disabled flag:

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

## Message override

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

## Runtime responsibility

The app supplies resolvers through the relevant module or SDK configuration. Messagevisor owns copy selection. The flag system owns whether a flag is enabled and which variation applies.

## Tests and examples

Use tests for important gates:

```yml
assertions:
  - locale: en-US
    target: web
    withFlags:
      new-checkout: true
    expectedTranslation: Finish checkout
```

Use examples for Catalog review. Keep test fixtures explicit about flags and variations.

## Boundaries

- Do not duplicate full feature rollout rules inside Messagevisor when a flag system already owns them.
- Do not put user-specific flag answers in target `context`.
- Keep copy variants in Messagevisor and rollout logic in Featurevisor or the flag provider.
