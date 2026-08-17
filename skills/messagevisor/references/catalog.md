# Catalog

Catalog is a generated, read-only UI over a Messagevisor project. It helps engineers and non-engineers review messages, locales, targets, examples, relationships, history, and optional reports.

Entity Tests tabs present authored and matrix-expanded assertion counts, inputs, contexts, expectations, and shareable assertion links. Entity title keys can be copied from the title area.

## Commands

```bash
npx messagevisor catalog
npx messagevisor catalog --port=3100
npx messagevisor catalog --with-translation-search
npx messagevisor catalog --with-duplicates
npx messagevisor catalog --set=staging --set=production
npx messagevisor catalog export
npx messagevisor catalog export --with-translation-search
npx messagevisor catalog export --with-duplicates
npx messagevisor catalog export --set=production
npx messagevisor catalog export --blockSize=524288
npx messagevisor catalog serve
npx messagevisor catalog serve --port=3100
```

| Command          | Use                                               |
| ---------------- | ------------------------------------------------- |
| `catalog`        | Dev mode: build, serve, watch inputs, live reload |
| `catalog export` | Static export for CI artifacts or private hosting |
| `catalog serve`  | Serve an already generated catalog                |

`catalog serve` requires an existing export. It does not build missing output or optional indexes and only reflects what was generated.

Entity detail pages show related authored test specifications in a **Tests** tab. Matrix assertions appear as their expanded test-runner cases. A protected assertion can use an optional key for stable labels and permalinks, and assertions with `promotable: false` show a `not promotable` badge.

## Sets

In `sets: true` projects, Catalog includes all sets by default.

Use `--set=<name>` with `catalog` or `catalog export` to include only selected sets. Repeat the option for multiple sets:

```bash
npx messagevisor catalog --set=staging --set=production
npx messagevisor catalog export --set=production
```

The generated Catalog stays set-aware whenever the project uses sets. The top nav still shows the set switcher even if only one set is selected.

Set switcher ordering is intentional: set names starting with `dev` appear first, set names starting with `prod` appear last, and other sets are sorted alphabetically in the middle.

## Large projects

Catalog indexes use compact per-type layers. The core layer contains keys and filter facets, while descriptions and display metadata are loaded separately by the Catalog UI. Message details are always stored in deterministic, content-addressed JSON blocks. Other entity types remain individual files, and older single-file indexes remain readable.

For projects with many thousands of messages, tune the message block size when needed:

```bash
npx messagevisor catalog
npx messagevisor catalog export
npx messagevisor catalog export --blockSize=524288
```

Message details are always stored in deterministic, content-addressed JSON blocks and a range table locates the block for a message. Other entity types continue to use individual files. The default block size is 256 KiB; configure `catalogBlockSize` in `messagevisor.config.js` or override it for one export with `--blockSize=<bytes>`.

`--prettyOutput` is for local inspection only. Compact JSON is the default. Detail block filenames use short content hashes and can be cached immutably. Index layers and range metadata must remain revalidatable. `catalog serve` serves an existing export and does not generate or change Catalog data.

## Optional generated data

Translation-value search is off by default for performance. Enable it when the message list needs `translation:"keyword"` search:

```bash
npx messagevisor catalog --with-translation-search
npx messagevisor catalog export --with-translation-search
```

Duplicate translation reports are also off by default. Enable them when locale pages need the Duplicates tab:

```bash
npx messagevisor catalog --with-duplicates
npx messagevisor catalog export --with-duplicates
```

Do not tell users those features are always present. Check the generated manifest feature flags or the command used.

## What to inspect

- Message list: keys, descriptions, targets, locales, status, search hints.
- Message detail: translations, overrides, examples, target inclusion, source links, history.
- Locale detail: direction, inherited translations, format rows, examples, optional duplicates.
- Target detail: included messages, locales, target context, target format overrides.
- Attributes and segments: condition schema, usage, relationships.
- Set switcher: current set in `sets: true` projects, ordered with `dev*` first and `prod*` last.

## Review workflow

1. Run `npx messagevisor catalog` while authoring.
2. Open the changed entity.
3. Verify examples, target inclusion, inherited values, overrides, and direction.
4. Share deep links in pull requests or review notes.
5. Run CLI validation before merge.

For hosted private review:

```bash
npx messagevisor catalog export
```

Publish the generated `catalog/` directory to an internal static host. Use browser routing by default. Use `--hashRouter` only when the host cannot serve `index.html` for deep routes.

## Boundaries

- Catalog is not an editor.
- Catalog is not runtime data. Do not fetch its JSON files from application code.
- Catalog examples are documentation and debugging aids. Tests still live under `tests/` and run with `npx messagevisor test`.
- Dev mode reloads project configuration, datasource state, and watched definition paths when `messagevisor.config.js` changes.
