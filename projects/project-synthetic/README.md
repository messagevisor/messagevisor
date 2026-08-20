# Synthetic large project

This project is a reproducible performance fixture for large Messagevisor
projects. Its generated YAML contents are intentionally ignored by Git.

Generate the default fixture with:

```bash
npm run generate --workspace @messagevisor/project-synthetic
```

The default fixture contains three sets, 50,000 messages per set, twelve
locales per set, four targets, segments, attributes, named ICU format presets,
message examples, hundreds of repeated target assertions, and ten synthetic Git
commits that touch large batches of messages. The
`used-formats` target also verifies that unused named formats are omitted from
its generated datafile.

Message payloads use a seeded variable-length distribution modelled on the
spread seen in `project-1`. Generation is deterministic for a given number of
messages, locales, and sets, so benchmark comparisons remain reproducible.
Use `--variance=off` to restore the small, flat payloads used by older
measurements:

```bash
node projects/project-synthetic/generate.mjs --sets=1 --messages=1000 --locales=3 --variance=off
```

Use smaller values while iterating:

```bash
node projects/project-synthetic/generate.mjs --sets=1 --messages=1000 --locales=3
```

The default generator creates local Git history so Catalog benchmarks include
realistic history data. Use `--history=0` when history is not part of a run.
The nested repository and all generated YAML remain ignored by the monorepo.

Run a selected CLI benchmark after building the monorepo:

```bash
node projects/project-synthetic/benchmark.mjs --command=build
node projects/project-synthetic/benchmark.mjs --command=test
node projects/project-synthetic/benchmark.mjs --command=lint
node projects/project-synthetic/benchmark.mjs --command=export
node projects/project-synthetic/benchmark.mjs --command=catalog
```

Repeat a phase when comparing changes:

```bash
node projects/project-synthetic/benchmark.mjs --command=build --repeat=3
```

For a conservative single-worker comparison, set `UV_THREADPOOL_SIZE=1` in
the shell before running the benchmark. JavaScript parsing and evaluation still
run on Node's main thread, while this also prevents filesystem work from using
the default libuv worker pool.

Set `MESSAGEVISOR_NO_CACHE=1` when a cold parse is required. The normal parsed
entity cache is sharded under `.messagevisor/cache/` and is ignored by Git.

For a manual `catalog export` verification run, use `--outDir=.catalog-<name>`.
That prefix is ignored by both Git and Prettier, unlike an arbitrary directory
name, which would otherwise dirty the working tree and fail formatting checks.

Generated data is not part of the repository. Run the generator again after
`make clean` if the fixture is needed locally.
