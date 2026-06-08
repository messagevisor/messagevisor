# Examples and evaluation

Examples are executable documentation. Evaluation is the runtime path that turns messages, raw strings, segments, formats, context, and modules into output.

Use examples for review and understanding. Use tests for pass/fail guarantees.

## Example types

Message examples live in message files:

```yml
translations:
  en: "Welcome, {name}!"

examples:
  - description: Pro user greeting
    locale: en
    values:
      name: Ada
    context:
      plan: pro
```

Locale examples live in locale files and usually use `rawMessage`:

```yml
examples:
  - description: USD money format
    rawMessage: "Price: {amount, number, money}"
    values:
      amount: 1234.56
```

Examples can use `description`, `locale`, `values`, `context`, `formats`, `currency`, `timeZone`, and `matrix`.

## Matrix examples

Use `matrix` when several examples differ only by values:

```yml
examples:
  - matrix:
      count: [0, 1, 5]
    description: Cart with ${{ count }} items
    locale: en
    values:
      count: ${{ count }}
```

Keep matrix dimensions small. Examples are for clarity, not exhaustive coverage.

## Run examples

```bash
npx messagevisor examples
npx messagevisor examples --onlyMessages
npx messagevisor examples --onlyLocales
npx messagevisor examples --locale=en-US
npx messagevisor examples --json --pretty
```

The Catalog shows examples in detail pages and is often the best review surface:

```bash
npx messagevisor catalog
```

## Evaluate directly

Use `evaluate` for focused debugging before making broader edits:

```bash
npx messagevisor evaluate --message=auth.signin --locale=en-US --target=web
npx messagevisor evaluate --rawMessage='Price: {amount, number, money}' --locale=en-US --values='{"amount":1234.56}'
npx messagevisor evaluate --segment=pro-users --context='{"plan":"pro"}'
```

Options:

- `--message` for a real message key, translation inheritance, target inclusion, overrides, values, formats, and configured modules.
- `--rawMessage` for locale formats, ICU syntax, interpolation, or module behavior without a message file.
- `--segment` for condition logic before layering it into an override.

Rules:

- Pass either `--message`, `--rawMessage`, or `--segment`.
- `--message` and `--rawMessage` require `--locale`.
- `--segment` does not need `--locale`.
- `--values` and `--context` must be valid JSON.
- In sets projects, pass `--set=<name>`.

Use `--json --pretty` when you need machine-readable output.

## Reasoning model

For message-key evaluation, check in this order:

1. Does the target include the message?
2. Does the locale have a direct or inherited translation?
3. Does target context simplify or remove branches?
4. Does runtime context choose an override?
5. Are the same modules active in project config and runtime?
6. Are per-call values, formats, currency, and timeZone correct?

For raw-message evaluation, focus on locale formats and modules because there is no message key.

## Writing good examples

- Use descriptions that explain the user scenario.
- Include realistic `context` when overrides or segments matter.
- Include values for every placeholder.
- Use locale examples for reusable format demonstrations.
- Keep examples stable enough for Catalog review.
- Add tests for important business logic after adding examples.

## Avoid

- Do not use examples as the only protection for critical behavior. Write tests too.
- Do not add huge matrices that make Catalog review noisy.
- Do not assume examples render ICU unless the ICU module is configured.
- Do not change source copy just to make an example pass. Debug target inclusion, inheritance, formats, and modules first.
