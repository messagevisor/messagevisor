---
name: messagevisor-testing
description: "Use this skill when writing or fixing Messagevisor tests. Trigger on `tests/`, `npx messagevisor test`, message tests, segment tests, locale tests, target tests, assertions, matrix expansion, expected translations, expected formats, target inclusion, or regression tests for copy behavior."
---

# Testing Messagevisor projects

Tests live under `tests/` and run with:

```sh
npx messagevisor test
```

Use tests for behavior that must not change silently. Use examples for documentation and Catalog review.

## Test locations

| Subject | Path | Top-level field |
| --- | --- | --- |
| Message | `tests/messages/<path>.spec.yml` | `message` |
| Segment | `tests/segments/<key>.spec.yml` | `segment` |
| Locale | `tests/locales/<key>.spec.yml` | `locale` |
| Target | `tests/targets/<key>.spec.yml` | `target` |

## Message test

```yml
message: auth.signin
assertions:
  - locale: en-US
    target: web
    expectedTranslation: Sign in
```

With values and context:

```yml
message: dashboard.welcome
assertions:
  - locale: en-US
    target: web
    values:
      name: Ada
    context:
      plan: pro
    expectedTranslation: Welcome back, Ada
```

## Segment test

```yml
segment: plan-pro
assertions:
  - context:
      plan: pro
    expectedEvaluation: true
  - context:
      plan: free
    expectedEvaluation: false
```

## Locale test

Use locale tests for inherited formats, direction, and locale-level examples.

```yml
locale: en-US
assertions:
  - expectedDirection: ltr
  - expectedFormats:
      number:
        money:
          style: currency
          currency: USD
```

Remember format inheritance works at whole style object level.

## Target test

```yml
target: web
assertions:
  - expectedToIncludeMessages:
      - auth.signin
      - dashboard.welcome
  - expectedToExcludeMessages:
      - internal.debug
```

## Matrix

Use `matrix` when the same assertion should run across values, locales, or contexts. Keep matrices small enough that failures remain readable.

## Running focused tests

```sh
npx messagevisor test --keyPattern=dashboard
npx messagevisor test --assertionPattern=plural
npx messagevisor test --onlyFailures
npx messagevisor test --verbose
npx messagevisor test --json --pretty
```

Run `lint` before tests when changing schema, conditions, formats, or references.
