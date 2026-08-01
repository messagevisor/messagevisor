# Runtime SDK

Apps consume generated datafiles through Messagevisor's runtime SDKs. The JavaScript SDK and optional framework packages are the primary web runtime; Java serves Android/JVM applications, and Swift serves iOS, macOS, tvOS, watchOS, and visionOS. SDKs are separate from the CLI. They share the generated datafile contract and module concepts but run independently.

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

Use the same modules at runtime that the project config used when building datafiles:

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
m.t("auth.signin"); // alias
m.translate("cart.items", { count: 3 });
m.translate("dashboard.welcome", { name: "Ada" }, { locale: "nl-NL" });
m.getRawTranslation("auth.signin"); // resolved string, no formatting
m.formatMessage("Hello {name}", { name: "Ada" }); // raw string, no message key
```

## Datafiles, locale, and state

One instance holds **one datafile per locale**; load more with `setDatafile` and switch with `setLocale`:

```js
m.setDatafile(nlDatafile); // add/merge another locale's datafile
m.setDatafile(updatedEnDatafile); // same locale updates in place
m.setDatafile(freshDatafile, true); // replace instead of merge
m.setLocale("nl-NL"); // switch active locale
m.translate("checkout.title", undefined, { locale: "nl-NL" }); // per-call, needs that datafile loaded
```

Per-call `locale` is evaluation state only — it emits no events and does not change `m.getLocale()`. Split datafiles (per-locale files from the same target) merge naturally into one instance.

Other instance state, settable at init or later: `setContext(context, replace?)`, `setCurrency("EUR")`, `setTimeZone("Europe/Amsterdam")`. Reads: `getLocale()`, `getContext()`, `getSnapshot()`, `getRevision(locale?)`, and `getDirection(locale?)` for RTL layout decisions (the app applies direction itself).

## Format helpers

```js
m.formatNumber(1234.5, "money");
m.formatNumber(1234.5, "money", { currency: "EUR" });
m.formatDate(new Date(), "long");
m.formatTime(new Date(), "short", { timeZone: "UTC" });
m.formatRelativeTime(-2, "day");
m.formatList(["a", "b", "c"]);
m.formatPlural(3); // plural rule category
```

`*ToParts` variants exist for custom rendering. Named presets come from locale `formats` in the datafile.

## Events

```js
const unsub = m.on("locale_set", ({ locale, previousLocale, snapshot }) => { … });
const unsubAll = m.subscribe(() => rerender()); // shorthand for on("change", …)
unsub();
```

Events: `datafile_set`, `locale_set`, `context_set`, `currency_set`, `timeZone_set`, `change`, `error`. `change` fires after any state event and carries `source` naming it. On `datafile_set`, `locale` is the affected datafile locale and `activeLocale` is the one selected for evaluation — they differ when preloading a locale without switching. Throwing listeners are isolated.

## Diagnostics

```js
const m = createMessagevisor({
  datafile,
  onDiagnostic(diagnostic) {
    console.warn(diagnostic);
  },
});
```

Key codes: `missing_datafile` (locale datafile not loaded) vs `missing_translation` (key absent), `missing_format`, `invalid_format`, `unsupported_formatter`, `message_override_matched` (debug), `deprecated_message` (includes `messageKey`, `locale`, `deprecationWarning` — route to observability to find stale call sites), `duplicate_module`, `module_setup_error`, `module_close_error`. Error-level diagnostics also emit the `error` event. Default `logLevel` is `"info"` (console with a `[Messagevisor]` prefix when no `onDiagnostic` is set); use `"warn"` in production consoles, `"debug"` to inspect override matching locally.

## Request-scoped child instances (servers)

Keep one parent with loaded datafiles; spawn cheap request-local children that share datafiles, modules, and bounded internal formatter caches but isolate context, locale, currency, and time zone:

```js
const parent = createMessagevisor({ datafile: enDatafile });
parent.setDatafile(nlDatafile);

export function handleRequest(request) {
  const child = parent.spawn(
    { accountId: request.accountId },
    { locale: request.locale, currency: request.currency },
  );
  return child.translate("checkout.title");
}
```

Datafiles loaded into the parent stay visible to existing children. Child `datafile_set` listeners and generic `change` listeners observe parent datafile updates through child-owned events. Their locale, context, snapshots, and incremented version belong to the child rather than being copied from the parent event. Closing a child removes its parent bridge and local listeners without closing parent modules.

## Lifecycle

```js
const remove = m.addModule(createICUModule()); // async removal fn
await remove(); // or: await m.removeModule("icu")
await m.close(); // run module close hooks, clear listeners; do not use after
```

If a module's setup throws, it is not registered, partial resources are cleaned up, and `module_setup_error` is reported.

## React

```bash
npm install @messagevisor/react
```

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

`useMessagevisor` returns `t`, `formatMessage`, and the format helpers bound to the active instance; components re-render on SDK `change` events. Rich text values render as React nodes. Keep the SDK instance lifecycle stable and update datafiles intentionally when locale or target changes.

Focused reactive hooks are also exported: `useTranslation(key, values?)`, `useFormatMessage`, `useLocale()`, `useDirection()` (RTL-aware layout that re-mirrors on locale switch), `useLocaleInfo()` (`{ locale, direction }`), `useCurrency()`, `useTimeZone()`, and `useSdk()` for the raw instance.

## Vue

```bash
npm install @messagevisor/vue
```

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

## Native Apple applications

Use `https://github.com/messagevisor/messagevisor-swift` through Swift Package Manager. The core product is `Messagevisor`; optional products include `MessagevisorICU`, `MessagevisorInterpolation`, and `MessagevisorMissingTranslations`.

```swift
import Messagevisor
import MessagevisorICU

let m = createMessagevisor(
    MessagevisorOptions(
        datafile: datafile,
        context: ["platform": .string("ios")],
        modules: [createICUModule()]
    )
)

let title = try m.translate("checkout.title")
```

Use a target such as `swift` to build the locales and message subset needed by the Apple app. Apple Foundation and JavaScript `Intl` can render valid locale output differently; use native SDK expectations for exact platform copy and keep target/source semantics shared.

## Runtime rules

- Do not fetch Catalog JSON as runtime translation data.
- Do not assume a message exists unless the active target includes it.
- Runtime operators are type-strict: numeric, string/regex, and array operators do not coerce mismatched values. `null` counts as present for `exists`.
- Portable regex flags are unique `i`, `m`, `s`, and `u`. The `u` flag maps to each SDK's Unicode-aware mode. Character classes and escaped literal backslashes are supported; lookaround, advanced groups, backreferences, and possessive quantifiers are rejected.
- Regex conditions use only portable `i`, `m`, `s`, and `u` flags. Date comparisons require timezone-qualified ISO date-time values.
- The supported runtime entry point is `createMessagevisor()`. Treat `Messagevisor` and supporting contracts as types, not constructable runtime exports.
- Keep module registration consistent between CLI and SDK.
- Use default translations sparingly for app-level fallback, not as a substitute for source definitions.
- Match locale keys exactly. `"en-US"` and `"en_US"` are different.
