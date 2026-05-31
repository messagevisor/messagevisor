# Messagevisor Project Demo

A sets-based ecommerce storefront example for demos and walkthroughs. It models `dev`, `staging`, and `production` as independent Messagevisor sets with the same realistic content in each set.

## Locales

| Locale  | Role                                        |
| ------- | ------------------------------------------- |
| `en`    | Base English copy and shared format presets |
| `en-US` | United States (USD, inherits from `en`)     |
| `en-GB` | United Kingdom (GBP, basket-oriented copy)  |
| `nl-NL` | Dutch (Netherlands, EUR)                    |
| `de-DE` | German (Germany, EUR)                       |

## Content overview

- **Messages**: navigation, home, product, cart, checkout, auth, account, shipping, and footer copy typical of an online shop
- **Segments**: `pro-customer`, `platform-web`, `platform-mobile`
- **Attributes**: `plan`, `platform`
- **Targets**: `web` (all storefront locales), `mobile` (subset for apps)

## Commands

```bash
npm run lint
npm run build
npm test

npx messagevisor lint --set=dev
npx messagevisor build --set=staging --showSize
npx messagevisor test --set=production
npx messagevisor catalog export --set=dev

npx messagevisor promote --from=dev --to=staging --dryRun
npx messagevisor promote --from=staging --to=production --check
```
