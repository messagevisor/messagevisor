---
name: messagevisor-icu
description: "Use this skill when authoring or debugging ICU message syntax in Messagevisor. Trigger on plurals, selects, selectordinal, interpolation, named number/date/time formats, inline skeletons, rich text tags, `@messagevisor/module-icu`, MessageFormat, FormatJS, or ICU runtime output."
---

# ICU in Messagevisor

ICU support comes from `@messagevisor/module-icu`. Register it in both project tooling and runtime SDK usage.

## Project config

```js
const { createICUModule } = require("@messagevisor/module-icu");

module.exports = {
  modules: [createICUModule()],
  // icuSkeleton: true,
};
```

`icuSkeleton: true` allows inline skeletons such as `{amount, number, ::currency/USD}`. Prefer named formats for shared product copy.

## Runtime

```js
import { createMessagevisor } from "@messagevisor/sdk";
import { createICUModule } from "@messagevisor/module-icu";
import datafile from "./datafiles/messagevisor-web-en-US.json";

const m = createMessagevisor({
  datafile,
  modules: [createICUModule()],
});
```

## Patterns

Interpolation:

```yml
translations:
  en-US: Hello {name}
```

Plural:

```yml
translations:
  en-US: "{count, plural, one {# item} other {# items}}"
```

Select:

```yml
translations:
  en-US: "{role, select, admin {Admin} member {Member} other {User}}"
```

Named format:

```yml
translations:
  en-US: "Total: {amount, number, money}"
```

## Rich text

Use rich text tags when the runtime integration supports callback values:

```yml
translations:
  en-US: "Read the <link>terms</link>."
```

React code typically passes a `link` function or element factory through message values.

## Authoring rules

- Quote ICU strings in YAML when punctuation or braces make parsing ambiguous.
- Always provide `other` for plural and select.
- Put number, date, and time styles in locale `formats` when product language needs consistency.
- Add examples for plural counts, select branches, and rich text cases.
- Run `npx messagevisor evaluate` for one string and `npx messagevisor catalog` for review.

## Debugging

```sh
npx messagevisor evaluate --message=cart.items --locale=en-US --values='{"count":2}'
npx messagevisor evaluate --rawMessage='{count, plural, one {# item} other {# items}}' --locale=en-US --values='{"count":2}'
```

If the output still contains literal ICU syntax, check module registration in both config and runtime.
