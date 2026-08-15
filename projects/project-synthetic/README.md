# Synthetic large project

This project is a reproducible performance fixture for large Messagevisor
projects. Its generated YAML contents are intentionally ignored by Git.

Generate the default fixture with:

```bash
npm run generate --workspace @messagevisor/project-synthetic
```

The default fixture contains three sets, 50,000 messages per set, twelve
locales per set, three targets, segments, attributes, and representative test
specifications.

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

Generated data is not part of the repository. Run the generator again after
`make clean` if the fixture is needed locally.
