# Deployment

Messagevisor deployment is a Git workflow plus publishing generated datafiles. Applications consume `datafiles/`, not source YAML/JSON and not Catalog data.

## Reliable release loop

```bash
npx messagevisor lint
npx messagevisor test
npx messagevisor build
```

Optionally export a review Catalog:

```bash
npx messagevisor catalog export
npx messagevisor catalog export --with-translation-search --with-duplicates
```

## What build produces

For each target and locale combination, build writes a runtime datafile:

```text
datafiles/
  messagevisor-<target>-<locale>.json
```

Nested targets keep their full target key in the datafile name. Output files mirror the target path.

In sets projects, datafiles are written under:

```text
datafiles/<set>/
```

Use `--set=<name>` when building one release lane:

```bash
npx messagevisor build --set=production
```

## Target-controlled output

Target files own runtime artifact behavior:

- `includeMessages` and `excludeMessages` decide which messages ship.
- `locales` decides which locale datafiles are produced.
- `context` can simplify output before runtime.
- `formats.<locale>...` overlays locale formats for that target.
- `pretty`, `stringify`, and `revisionFromHash` control generated datafile serialization and revisions.

## State files and revisions

State files under `.messagevisor/` help Messagevisor track generated output across builds. Do not hand-edit them unless intentionally resetting state.

Parsed entity snapshots use an ephemeral cache under `node_modules/.cache/messagevisor/`. This cache
is separate from revision state, is safe to remove, and is not intended for source control. Set
`MESSAGEVISOR_NO_CACHE=1` to bypass it for a command invocation.

Use `revisionFromHash: true` on a target when deployment wants content-addressed revisions. This is useful for CDN caching, release comparison, and missing-translation diagnostics.

## Catalog deployment

`npx messagevisor catalog export` writes static files under `catalog/`.

- Browser-router catalogs need SPA fallback hosting.
- Hash-router catalogs are simpler for static hosts. Use `--hashRouter`.
- `catalog serve` only serves existing generated output.
- `catalog` builds and serves in dev mode with watch and live reload.

Catalog is for human review and debugging. Runtime apps should load built datafiles.

## Hosting guides

Step-by-step pipelines for common hosts live in the docs: [GitHub Actions](https://messagevisor.com/docs/deployment/github-actions), [AWS CloudFront with S3](https://messagevisor.com/docs/deployment/aws-cloudfront), and Cloudflare Workers ([static assets](https://messagevisor.com/docs/deployment/cloudflare-workers-static-assets), [KV](https://messagevisor.com/docs/deployment/cloudflare-workers-kv), [Hono](https://messagevisor.com/docs/deployment/cloudflare-workers-hono)). Fetch on demand rather than reconstructing from memory.

## CI shape

A conservative CI job:

```bash
npx messagevisor lint
npx messagevisor test
npx messagevisor build --showSize
```

Then upload `datafiles/` to the artifact store or CDN.

For sets projects, build and publish the intended set. Promotion should happen before deployment:

```bash
npx messagevisor promote --from=staging --to=production --apply
npx messagevisor build --set=production
```

## Avoid

- Do not edit generated datafiles as source.
- Do not publish all target datafiles to an app that should only see one target.
- Do not assume Catalog output has translation search or duplicate reports unless the export used the opt-in flags.
- Do not skip `test` because `lint` passed. Lint validates structure; tests validate behavior.
