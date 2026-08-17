# Synthetic large project

This project is a reproducible performance fixture for large Messagevisor
projects. Its generated YAML contents are intentionally ignored by Git.

Generate the default fixture with:

```bash
npm run generate --workspace @messagevisor/project-synthetic
```

The default fixture contains three sets, 50,000 messages per set, twelve
locales per set, four targets, segments, attributes, named ICU format presets,
message examples, and hundreds of repeated target assertions. The
`used-formats` target also verifies that unused named formats are omitted from
its generated datafile.

Use smaller values while iterating:

```bash
node projects/project-synthetic/generate.mjs --sets=1 --messages=1000 --locales=3
```

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

Generated data is not part of the repository. Run the generator again after
`make clean` if the fixture is needed locally.
