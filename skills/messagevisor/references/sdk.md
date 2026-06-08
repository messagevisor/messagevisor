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

```jsx
import { MessagevisorProvider, useTranslate } from "@messagevisor/react";

function App({ m }) {
  return (
    <MessagevisorProvider instance={m}>
      <MyComponent />
    </MessagevisorProvider>
  );
}

function MyComponent() {
  const { t } = useTranslate();
  return <p>{t("auth.signin")}</p>;
}
```

## Vue

```bash
npm install @messagevisor/vue
```

Use the Vue plugin and composables from `@messagevisor/vue`:

```js
import { createApp } from "vue";
import { createMessagevisorPlugin } from "@messagevisor/vue";

const app = createApp(App);
app.use(createMessagevisorPlugin({ instance: m }));
```

## react-intl compatibility

```bash
npm install @messagevisor/react-intl-compat
```

Use this when migrating code that expects `formatMessage`, `formatNumber`, and react-intl-style components.

## Runtime rules

- Do not fetch Catalog JSON as runtime translation data.
- Do not assume a message exists unless the active target includes it.
- Keep module registration consistent between CLI and SDK.
- Use default translations sparingly for app-level fallback, not as a substitute for source definitions.
- Match locale keys exactly. `"en-US"` and `"en_US"` are different.
