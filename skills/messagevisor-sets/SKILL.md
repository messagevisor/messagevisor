---
name: messagevisor-sets
description: "Use this skill for Messagevisor set projects and promotion flows. Trigger on `sets: true`, `sets/<name>/...`, environments, dev/staging/production, `--set`, `promote`, `promotionFlows`, `promotable`, set-scoped build, set-scoped tests, or release lanes for translation content."
---

# Sets and promotion

Sets model parallel definition trees in one repository. They are usually used for release lanes such as `dev`, `staging`, and `production`.

Use targets for different applications. Use sets for different copies of the same project state.

## Enable sets

```js
module.exports = {
  sets: true,
  promotionFlows: [
    { from: "dev", to: "staging" },
    { from: "staging", to: "production" },
  ],
};
```

## Layout

```text
sets/
  dev/
    locales/
    messages/
    attributes/
    segments/
    targets/
    tests/
  staging/
  production/
```

Example projects in this repo include `projects/project-sets` and the environments starter.

## Set-aware commands

```sh
npx messagevisor lint --set=dev
npx messagevisor test --set=staging
npx messagevisor build --set=production
npx messagevisor find-duplicates --set=staging
npx messagevisor catalog
```

Some commands scan all sets by default. Use `--set` when the user asks for one set or when output would be too broad.

## Promotion

Preview first:

```sh
npx messagevisor promote --from=dev --to=staging
```

Apply after review:

```sh
npx messagevisor promote --from=dev --to=staging --apply
```

Useful options:

```sh
npx messagevisor promote --from=dev --to=staging --conflicts=fail
npx messagevisor promote --from=dev --to=staging --target=web
npx messagevisor promote --from=dev --to=staging --excludeOverrides
npx messagevisor promote --from=dev --to=staging --apply --audit=markdown
```

`promotionFlows` restricts allowed directions.

## Excluding content

Set `promotable: false` on an entity or override when it should not be copied by promotion.

```yml
promotable: false
```

## Safety checklist

- Preview promotion before `--apply`.
- Respect `promotionFlows`.
- Run lint and tests in the destination set after applying.
- Build the destination set before shipping.
- Use Catalog set views for review.
