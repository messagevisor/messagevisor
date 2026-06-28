# Sets and promotion

Sets model parallel definition trees in one repository. They are usually used for release lanes such as `dev`, `staging`, and `production`.

Use targets for different applications. Use sets for different copies of the same project state at different release stages.

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

Example projects in the repo include `projects/project-sets` and the environments starter.

## Set-aware commands

```bash
npx messagevisor lint --set=dev
npx messagevisor test --set=staging
npx messagevisor build --set=production
npx messagevisor find-duplicates --set=staging
npx messagevisor catalog
npx messagevisor catalog --set=staging --set=production
```

Some commands scan all sets by default. Use `--set` when the user asks for one set or when output would be too broad.

Catalog accepts repeatable `--set=<name>` to generate only selected sets in dev mode or static export. It still shows the set switcher for sets projects, even with one selected set. In the switcher, `dev*` set names appear first and `prod*` set names appear last.

## Promotion

Preview first:

```bash
npx messagevisor promote --from=dev --to=staging
```

Apply after review:

```bash
npx messagevisor promote --from=dev --to=staging --apply
```

Useful options:

```bash
npx messagevisor promote --from=dev --to=staging --conflicts=fail
npx messagevisor promote --from=dev --to=staging --target=web
npx messagevisor promote --from=dev --to=staging --excludeOverrides
npx messagevisor promote --from=dev --to=staging --apply --audit=markdown
```

`promotionFlows` in config restricts allowed directions. Conflict modes are `source`, `destination`, and `fail`.

## Excluding content from promotion

Set `promotable: false` on an entity when it should not be copied by promotion:

```yml
promotable: false
```

On message overrides, `promotable: false` keeps that override local to its current set. Source overrides marked this way are not copied or merged into the destination, destination overrides marked this way are protected from source updates, and dependencies used only by skipped overrides are not promoted.

## Safety checklist

- Preview promotion before `--apply`.
- Respect `promotionFlows`.
- Run lint and tests in the destination set after applying.
- Build the destination set before shipping.
- Use Catalog set views for review.
