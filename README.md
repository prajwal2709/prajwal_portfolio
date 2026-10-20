# Prajwal's portfolio

Static portfolio hosted on Cloudflare Pages, with Cloudflare Pages Functions and a D1 database for the shared heart total and live viewer count. The deployed page does not call an AI provider or require API keys.

## Deploy on Cloudflare Pages

1. In Cloudflare, create a D1 database named `prajwal-portfolio-stats`.
2. Open the database's SQL console, paste in `schema.sql`, and run it.
3. Create a Pages project from the `prajwal2709/prajwal_portfolio` GitHub repository. Set the project root to `/`, build command to `exit 0`, and build output directory to `site`.
4. In the Pages project, open **Settings → Bindings → Add → D1 database binding**. Set the variable name to `DB` and select `prajwal-portfolio-stats`.
5. Save and redeploy the Pages project so the binding is available to the Functions.

Cloudflare's root-level `functions/api/` directory provides `/api/presence` and `/api/appreciation`. The `site/_routes.json` file limits Functions to `/api/*`, leaving the portfolio files served as static assets.

## Counters

- Viewer count is the number of browser IDs that sent a heartbeat in the last 90 seconds. The page sends a heartbeat every 30 seconds.
- Each browser can add or remove one heart. Its random ID is stored in that browser's local storage; the counters do not save IP addresses.
- The database binding must be named `DB`, and the tables and index are created by `schema.sql`.

## Repository layout

- `site/` — portfolio page, images, resume, and Pages routing config.
- `functions/api/` — the two Pages Functions used by the counters.
- `schema.sql` — D1 schema.

The FastAPI files at the repository root are not part of the Cloudflare Pages deployment. The live portfolio does not call them.
