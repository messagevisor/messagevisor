---
name: messagevisor-sdk
description: "Use this skill when wiring Messagevisor datafiles into an application. Trigger on `@messagevisor/sdk`, `@messagevisor/react`, `@messagevisor/vue`, `@messagevisor/react-intl-compat`, `createMessagevisor`, runtime translation calls, locale switching, datafile loading, diagnostics, modules, React providers, Vue plugins, or migrating from react-intl."
---

# Runtime SDK

Apps consume generated datafiles through `@messagevisor/sdk` and optional framework packages.

## Core setup

```sh
npm install @messagevisor/sdk
```

```js
import { createMessagevisor } from "@messagevisor/sdk";
import datafile from "./datafiles/messagevisor-web-en-US.json";

const m = createMessagevisor({
  datafile,
  locale: "en-US",
  context: { platform: "web" },
});

m.translate("dashboard.welcome", { name: "Ada" });
m.formatNumber(12, "money");
```

Use the same modules at runtime that the project used while building datafiles.

```js
import { createICUModule } from "@messagevisor/module-icu";

const m = createMessagevisor({
  datafile,
  modules: [createICUModule()],
});
```

## Diagnostics

Use diagnostics during integration and observability:

```js
const m = createMessagevisor({
  datafile,
  onDiagnostic(diagnostic) {
    console.warn(diagnostic);
  },
});
```

Diagnostics cover missing translations, deprecated messages, unsupported formatter behavior, and module events. The SDK also supports subscriptions for state changes.

## Locale and context

Set defaults on the instance and override per call when needed:

```js
m.translate("checkout.banner", undefined, {
  locale: "nl-NL",
  context: { plan: "pro" },
});
```

When switching locale or target at runtime, load the matching datafile. Datafiles are built per target and locale.

## React

```sh
npm install @messagevisor/react
```

Use the provider and hooks from `@messagevisor/react`. Keep the SDK instance lifecycle stable and update datafiles intentionally when locale or target changes.

## Vue

```sh
npm install @messagevisor/vue
```

Use the Vue provider/plugin and composables from `@messagevisor/vue`.

## react-intl compatibility

```sh
npm install @messagevisor/react-intl-compat
```

Use this when migrating code that expects `formatMessage`, `formatNumber`, and react-intl-style components.

## Runtime rules

- Do not fetch Catalog JSON as runtime translation data.
- Do not assume a message exists unless the active target includes it.
- Keep module registration consistent between CLI and SDK.
- Use default translations sparingly for app-level fallback, not as a substitute for source definitions.
