# Example Messagevisor project

A minimal working project showing the core entities and patterns.

## Structure

```text
messagevisor.config.js        project config with ICU module
package.json                  dependencies and scripts
locales/
  en.yml                      English with number, date, and time formats
  nl.yml                      Dutch inheriting formats from English, overriding money to EUR
attributes/
  plan.yml                    Subscription plan (free, pro, enterprise)
  platform.yml                Client platform (web, ios, android)
segments/
  plan-pro.yml                Pro plan users
  platform-web.yml            Web platform
messages/
  auth/
    signin.yml                Sign in button label
    signout.yml               Sign out button label
  dashboard/
    welcome.yml               Welcome message with Pro plan override
targets/
  web.yml                     Web app: auth* and dashboard* messages, en + nl locales
tests/
  messages/dashboard/
    welcome.spec.yml          Tests for default and Pro plan welcome copy
  segments/
    plan-pro.spec.yml         Tests for the plan-pro segment
```

## Get started

```bash
npm install
npx messagevisor lint
npx messagevisor test
npx messagevisor build
npx messagevisor catalog
```

## Key patterns shown

- **Locale inheritance**: `nl.yml` uses `inheritTranslationsFrom: en` and overrides only `number.money` to use EUR.
- **Conditional overrides**: `dashboard/welcome.yml` has a `plan-pro` override using a named segment.
- **Target filtering**: `web.yml` includes only `auth*` and `dashboard*` messages.
- **Named formats**: `en.yml` defines `money`, `decimal`, `percent`, `date.long`, `time.short` for use in ICU messages.
- **Examples**: `dashboard/welcome.yml` has three examples showing default and Pro variants.
- **Tests**: Both message translation and segment condition matching are tested.
