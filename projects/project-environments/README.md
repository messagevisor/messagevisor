# Messagevisor Project Environments

This example models `dev`, `staging`, and `production` as independent
Messagevisor sets.

Each set contains the same starter definitions as `projects/project-yml`:

- locales: `en`, `en-US`, `en-GB`
- attribute: `platform`
- segments: `platform-web`, `platform-mobile`
- targets: `web`, `mobile`
- messages: `auth.signin`, `auth.signout`, `nav.home`, `nav.contact`

Useful commands:

```bash
npm run lint
npm run build
npm test
npx messagevisor build --set=staging
npx messagevisor test --set=production
```
