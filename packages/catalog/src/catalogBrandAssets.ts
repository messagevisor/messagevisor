/**
 * Paths are served from `packages/catalog/public/` at the site root.
 * Vite copies that folder into `dist/` on build; `scripts/dev.mjs` syncs the
 * same files into `.catalog-dev` after each export so `npm run dev` can use
 * `CATALOG_PUBLIC_DIR` without losing UI static assets.
 */
export const CATALOG_NAV_LOGO_MARK_SRC = "/favicon.png";
export const CATALOG_NAV_LOGO_WORDMARK_SRC = "/logo-text.png";
