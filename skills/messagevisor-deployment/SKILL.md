---
name: messagevisor-deployment
description: "Use this skill when preparing Messagevisor datafiles for CI, release, CDN publishing, state files, revisions, static Catalog hosting, or set-based deployment."
---

# Messagevisor deployment

Messagevisor deployment is usually a Git workflow plus publishing generated datafiles. Applications consume `datafiles/`, not source YAML/JSON and not the Catalog data.

## Reliable release loop

```sh
npx messagevisor lint
npx messagevisor test
npx messagevisor build
```

Optionally export a review Catalog:

```sh
npx messagevisor catalog export
```

For large projects, opt into expensive Catalog features only when needed:

```sh
npx messagevisor catalog export --with-translation-search --with-duplicates
```

## What build produces

For each target and locale combination, build writes a runtime datafile:

```text
datafiles/
  messagevisor-<target>-<locale>.json
```

Nested targets keep their full target key in the datafile, while output files mirror the target path.

In sets projects, datafiles are written under:

```text
datafiles/<set>/
```

Use `--set=<name>` when building one release lane:

```sh
npx messagevisor build --set=production
```

## Target-controlled output

Target files own runtime artifact behavior:

- `includeMessages` and `excludeMessages` decide which messages ship.
- `locales` decides which locale datafiles are produced.
- `context` can simplify output before runtime.
- `formats.<locale>...` overlays locale formats for that target.
- `pretty`, `stringify`, and `revisionFromHash` control generated datafile serialization and revisions.

Format overlays merge by type and style name. If a target declares an existing style, that full style object replaces the resolved locale style object.

## State files and revisions

State files under `.messagevisor/` help Messagevisor track generated output across builds. Do not hand edit them unless the user is intentionally resetting state.

Use `revisionFromHash: true` on a target when deployment wants content-addressed revisions. This is useful for CDN caching, release comparison, and missing-translation diagnostics.

## Catalog deployment

`npx messagevisor catalog export` writes static files under `catalog/`.

- Browser-router catalogs need SPA fallback hosting.
- Hash-router catalogs are simpler for static hosts.
- `catalog serve` only serves existing generated output.
- `catalog` builds and serves in dev mode with watch and live reload.

Catalog is for human review and debugging. Runtime apps should load built datafiles.

## CI shape

A conservative CI job should:

```sh
npx messagevisor lint
npx messagevisor test
npx messagevisor build --showSize
```

Then upload `datafiles/` to the chosen artifact store or CDN.

For sets projects, build and publish the intended set. Promotion should happen before deployment:

```sh
npx messagevisor promote --from=staging --to=production --apply
npx messagevisor build --set=production
```

## Avoid

- Do not edit generated datafiles as source.
- Do not publish all target datafiles to an app that should only see one target.
- Do not assume Catalog output has translation search or duplicate reports unless the export used the opt-in flags.
- Do not skip `test` because `lint` passed. Lint validates structure; tests validate behavior.
