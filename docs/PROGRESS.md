# Progress

## Current status

Foundation implementation is underway. The app shell, desktop/mobile navigation, theme selection, balance visibility, first-wallet setup, local IndexedDB persistence, and integer-centavo money utilities are implemented.

## Verified

- Workspace was initially empty; Node.js v25.8.0, npm 11.11.0, and Git 2.46.1 are available.
- Vite scaffold created a local Git repository on `main`.
- Node supports `--experimental-strip-types`, enabling built-in tests without adding test dependencies.
- `npm test`: 3 tests passed.
- Node syntax checks passed for `src/db/database.ts` and `src/domain/money.ts`.

## Not verified

- Dependency installation was not approved in this environment. With no `node_modules` or package lockfile, `npm run lint` and `npm run build` fail because Oxlint and TypeScript are unavailable.
- Browser UI, IndexedDB reload persistence, responsive layouts, and accessibility have not yet been verified in a browser.
- No GitHub remote, GitHub Actions workflow, or Vercel project is configured.

## Next

Install dependencies and generate the lockfile, then run `npm test`, `npm run lint`, and `npm run build`. Validate first-run wallet setup, reload persistence, theme behavior, and mobile navigation in a browser before implementing the transaction ledger.
