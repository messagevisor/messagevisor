# Recipes — higher-level patterns

Full docs: <https://messagevisor.com/docs/use-cases> (one page per pattern)

Adapt the matching section; each links back to the granular references for shape details.

## Audience-targeted copy

Different personas, different copy, one `translate()` call. Name the audiences as segments (`plan-pro`, `new-user`, `onboarding-incomplete`), then stack overrides narrow-to-broad — first match wins:

```yml
translations:
  en: Welcome back
overrides:
  - key: new-pro-user
    segments:
      and: [plan-pro, new-user]
    translations:
      en: Welcome to Pro - let's get you set up
  - key: pro
    segments: plan-pro
    translations:
      en: Welcome back to your Pro workspace
```

The app supplies context (`plan`, `daysSinceSignup`, …) and never contains the branching logic. Write one test assertion per audience so variants can't silently break ([testing.md](testing.md)). The Catalog shows every variant with its conditions expanded — the PM sign-off surface.

## Copy variants for A/B tests

Overrides gated on experiment/flag conditions, resolved through the app's flag system ([featurevisor.md](featurevisor.md)):

```yml
overrides:
  - key: cta-test-treatment
    conditions:
      experiment: cta-copy-test
      operator: hasVariation
      value: treatment
    translations:
      en: Get started
```

Base translation = control. Test both sides with `withVariations: {cta-copy-test: treatment}` and `withFlags: {new-billing-ui: true}` assertions. Rolling back a losing variant is `git revert` — no app deploy.

## Consistent number/date/currency formatting

Named presets in locale `formats` (`money`, `decimal`, `long`, `short`) are the shared vocabulary: ICU strings reference them (`{amount, number, money}`) and apps call `m.formatNumber(x, "money")`. Regional locales inherit and override only what differs (whole style objects — [authoring.md](authoring.md)); targets can overlay per-surface conventions (highest precedence); currency can stay unset in presets and be filled from instance state at runtime. Lock resolved presets with locale-test `expectedFormats` assertions.

## Decoupling copy releases from deployments

The core value proposition: translations live in the project repo, ship as datafiles from a CDN, and apps fetch at runtime — copy changes go live in minutes without an app release. App-side refresh:

```js
setInterval(async () => {
  const fresh = await fetch(DATAFILE_URL).then((r) => r.json());
  m.setDatafile(fresh, true); // replace that locale's datafile
}, 5 * 60 * 1000);
```

Check `getRevision()` first to skip no-op updates. Rollback is `git revert` + CI republish. Keep datafiles small with targets so each app ships only its slice ([targets.md](targets.md)). Pipeline guides: GitHub Actions, AWS CloudFront/S3, Cloudflare Workers — <https://messagevisor.com/docs/deployment>.

## Deprecating and retiring message keys

Two-phase, never immediate deletion:

```yml
deprecated: true
deprecationWarning: Use onboarding.intro instead. Removed after 2026-06-01.
```

Phase 1: the key still resolves; the SDK emits a `deprecated_message` diagnostic (with `messageKey`, `locale`, `deprecationWarning`) on every evaluation — route it to observability via `onDiagnostic` to find remaining call sites in production. Phase 2, once call sites are gone: `archived: true` — excluded from builds, exports, Catalog listings, and translation-presence lint; the file stays in Git for history.

| State      | In build output | SDK evaluates | SDK warns |
| ---------- | --------------- | ------------- | --------- |
| Active     | Yes             | Yes           | No        |
| Deprecated | Yes             | Yes           | Yes       |
| Archived   | No              | —             | —         |

## Environment promotion (dev → staging → production)

Sets as release lanes with an explicit, merge-aware promotion flow ([sets.md](sets.md)). The invariant sequence: **preview → apply → validate destination**:

```bash
npx messagevisor promote --from=dev --to=staging                # preview (add --showUnchanged for the full picture)
npx messagevisor promote --from=dev --to=staging --apply
npx messagevisor lint --set=staging && npx messagevisor test --set=staging && npx messagevisor build --set=staging
```

Scope with `--includeMessages="checkout*"`, `--locale=nl-NL`, `--target=web`, or `--excludeOverrides` (keep experiment overrides out of production). Conflicts: `--conflicts=source|destination|fail` — use `fail` in automation. At the top level, `promotable: false` protects an existing destination version. On overrides and assertions, it keeps source entries out of the destination and protects matching destination entries. `--audit=markdown` produces a durable change record for compliance. A clean promotion preview doubles as a "are staging and production in sync?" pre-release gate.

## Platform-specific copy

Two tools, often combined: **separate targets** per platform (each app loads only its messages — different keys can even exist per platform) and **target `context`** (`platform: web` baked in, so platform overrides resolve at build time and impossible branches are pruned). Use runtime `platform` context instead when one datafile serves several surfaces. See [targets.md](targets.md) and [overrides.md](overrides.md).

## Regional language variants

One base locale per language (`en`, `de`), regional children declaring only differences (`en-GB`: GBP money format, a few spelling overrides) via `inheritTranslationsFrom` / `inheritFormatsFrom`. Chains can be multi-level. `mergeExamplesFrom` pulls the base locale's examples into a regional locale's Catalog/`examples` output. Export gaps for translators with `--onlyDirectlyUntranslated` so inherited values don't look missing ([csv.md](csv.md)).

## RTL language support

`direction: rtl` on the locale is metadata carried into the datafile — no hardcoded locale→direction tables in apps:

```js
document.documentElement.setAttribute("dir", m.getDirection());
```

React: `useDirection()` and `useLocaleInfo()` re-render on locale switches, so layout re-mirrors automatically. The Catalog renders RTL translation cells with correct `dir`, including mixed-script content.

## Ownership and review (CODEOWNERS)

Definitions are files, so ownership uses the tools teams already have: namespace directories that map to CODEOWNERS entries (`messages/legal/ @legal-team`, matching `tests/messages/legal/`), branch protection for genuinely gated content, and notify-without-blocking for visibility-only reviewers. In sets projects, rules per `sets/<set>/...` path add a checkpoint at every promotion stage.

## Onboarding non-engineers (PMs, editors, translators)

Their interface is the **Catalog** (deploy it as a static site — no repo access needed to browse) plus small, well-described PRs. Invest in `description` (placement, audience, character limits — shown in Catalog and CSV exports), `summary` for compact views, and `examples` so reviewers see rendered output with real values. CODEOWNERS routes their areas to them. CSV export/import is the translator path ([csv.md](csv.md)); agent-assisted translation has its own guardrails ([ai-translations.md](ai-translations.md)).

## Testing translations in CI

Every behavioral contract gets a spec: audience variants (one assertion per audience), experiment sides (`withVariations`/`withFlags`), resolved formats (`expectedFormats`), target inclusion (`expectedToIncludeMessages`), plural branches (matrix over counts). Lint + test + build in CI is what makes decoupled copy releases safe ([testing.md](testing.md), [deployment.md](deployment.md)).
