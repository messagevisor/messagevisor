# Testing

Tests live under `tests/` and run with:

```bash
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
    expectedTranslation: Welcome back, Ada. Your Pro workspace is ready.
```

With feature flags:

```yml
message: checkout.banner
assertions:
  - locale: en-US
    target: web
    withFlags:
      new-checkout: true
    expectedTranslation: Finish checkout
```

## Segment test

Each assertion repeats `segment` so it can be read in isolation.

```yml
segment: plan-pro
assertions:
  - segment: plan-pro
    context:
      plan: pro
    expectedToMatch: true
  - segment: plan-pro
    context:
      plan: free
    expectedToMatch: false
```

## Locale test

Use locale tests for inherited formats and locale-level raw message evaluation.

```yml
locale: en-US
assertions:
  - expectedFormats:
      number:
        money:
          style: currency
          currency: USD
  - description: plural cart copy
    rawMessage: "{items, plural, =0 {No items} one {# item} other {# items}}"
    values:
      items: 3
    expectedTranslation: 3 items
```

Format assertions check the full style object. Match only what you intend to assert.

## Target test

```yml
target: web
assertions:
  - locale: en-US
    expectedToIncludeMessages:
      - auth.signin
      - dashboard.welcome
    expectedToNotIncludeMessages:
      - internal.debug
    expectedFormats:
      number:
        money:
          currency: USD
    rawMessage: "Total: {amount, number, money}"
    values:
      amount: 12
    expectedTranslation: "Total: $12.00"
```

## Matrix

Use `matrix` when the same assertion should run across values, locales, or contexts:

```yml
message: dashboard.welcome
assertions:
  - matrix:
      name: [Ada, Sam]
    locale: en-US
    target: web
    description: Default welcome for ${{ name }}
    values:
      name: ${{ name }}
    expectedTranslation: Welcome back, ${{ name }}
```

Matrix only does plain `${{ var }}` substitution: a value that is exactly `${{ var }}` takes the combination value as is, otherwise the variable is interpolated into the surrounding string. There is no expression or conditional support, so vary the expected result by listing it as its own matrix axis when it differs per combination. Keep matrices small enough that failures remain readable.

## Running focused tests

```bash
npx messagevisor test --keyPattern=dashboard
npx messagevisor test --assertionPattern=plural
npx messagevisor test --onlyFailures
npx messagevisor test --verbose
npx messagevisor test --showDatafile
npx messagevisor test --json --pretty
```

Use `--showDatafile` for target assertions and target-specific debugging. Use `--onlyFailures` to keep noisy suites readable.

Run `lint` before tests when changing schema, conditions, formats, or references.
