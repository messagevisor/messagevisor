# Messagevisor Project Test Envs

This example models dev, staging, and production as independent Messagevisor sets.

Each set has the same ecommerce store messages and locales:

- en
- nl
- en-US
- en-NL
- nl-NL

Useful commands:

```bash
npm run lint
npm run build
npm test
npx messagevisor build --set=staging --showSize
npx messagevisor promote --from=dev --to=staging --dryRun
npx messagevisor promote --from=dev --to=staging --target=web --locale=en-US
npx messagevisor promote --from=staging --to=production --check
npx messagevisor promote --from=dev --to=staging --audit=markdown
npx messagevisor promote --from=dev --to=staging --excludeOverrides
```
