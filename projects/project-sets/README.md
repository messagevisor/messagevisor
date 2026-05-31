# Project Sets

This example shows one Messagevisor repository with multiple independent sets.

Each set under `sets/` owns its own locales, messages, targets, tests, attributes, and segments.
The same message keys can exist in multiple sets with different translations.

```sh
npx messagevisor lint
npx messagevisor build
npx messagevisor test

npx messagevisor build --set=storefront
npx messagevisor test --set=admin
```
