# Runtime SDK

Apps consume generated datafiles through `@messagevisor/sdk` and optional framework packages. The SDK is separate from the CLI. They share modules but run independently.

## Core setup

```bash
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

Use the same modules at runtime that the project config used when building datafiles.

```js
import { createICUModule } from "@messagevisor/module-icu";

const m = createMessagevisor({
  datafile,
  modules: [createICUModule()],
});
```

## Translate

```js
m.translate("auth.signin");
m.translate("cart.items", { count: 3 });
m.translate("dashboard.welcome", { name: "Ada" }, { locale: "nl-NL" });
```

## Format helpers

```js
m.formatNumber(1234.5, "money");
m.formatNumber(1234.5, "money", { currency: "EUR" });
m.formatDate(new Date(), "long");
m.formatTime(new Date(), "short", { timeZone: "UTC" });
```

## Diagnostics

```js
const m = createMessagevisor({
  datafile,
  onDiagnostic(diagnostic) {
    console.warn(diagnostic);
  },
});
```

Diagnostics cover missing translations, deprecated messages, unsupported formatter behavior, and module events.

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

```bash
npm install @messagevisor/react
```

Use the provider and hooks from `@messagevisor/react`. Keep the SDK instance lifecycle stable and update datafiles intentionally when locale or target changes.

The generic `change` event carries a `source` naming the specific state event. On `datafile_set`, `locale` is the affected datafile locale and `activeLocale` is the locale currently selected for evaluation.

```jsx
import { MessagevisorProvider, useMessagevisor } from "@messagevisor/react";

function App({ m }) {
  return (
    <MessagevisorProvider instance={m}>
      <MyComponent />
    </MessagevisorProvider>
  );
}

function MyComponent() {
  const { t } = useMessagevisor();
  return <p>{t("auth.signin")}</p>;
}
```

`useMessagevisor` returns `t`, `formatMessage`, and the format helpers bound to the active instance. Rich text values render as React nodes.

## Vue

```bash
npm install @messagevisor/vue
```

Use the provider plugin and composables from `@messagevisor/vue`:

```js
import { createApp } from "vue";
import { createMessagevisorProvider } from "@messagevisor/vue";

const app = createApp(App);
app.use(createMessagevisorProvider({ instance: m }));
```

Inside components, call `useMessagevisor()` for the bound API, or use the `$t` and `$messagevisor` global properties. A `MessagevisorProvider` component is also exported for scoped setups.

## react-intl compatibility

```bash
npm install @messagevisor/react-intl-compat
```

Use this when migrating code that expects `formatMessage`, `formatNumber`, and react-intl-style components.

## Runtime rules

- Do not fetch Catalog JSON as runtime translation data.
- Do not assume a message exists unless the active target includes it.
- Runtime operators are type-strict: numeric, string/regex, and array operators do not coerce mismatched values. `null` counts as present for `exists`.
- For request isolation, use `parent.spawn(context, { locale, currency, timeZone })`; children share parent datafiles, modules, and formatter caches.
- The supported runtime entry point is `createMessagevisor()`. Treat `Messagevisor` and supporting contracts as types, not constructable runtime exports.
- Keep module registration consistent between CLI and SDK.
- Use default translations sparingly for app-level fallback, not as a substitute for source definitions.
- Match locale keys exactly. `"en-US"` and `"en_US"` are different.
