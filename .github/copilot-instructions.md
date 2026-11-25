# Copilot instructions

- Read `AGENTS.md` and the relevant product, architecture, and roadmap docs before changing features.
- Keep personal finance data local. Do not add analytics, external AI, a backend, or remote financial services.
- Store monetary values as safe integer centavos; use the domain money helpers for parsing, aggregation, and PHP formatting.
- Keep database reads/writes in `src/db`, pure financial logic in `src/domain`, and surface storage errors to the UI.
- Treat IndexedDB schema changes as migrations: increment the version and preserve existing user records.
- Never silently alter or discard balances. Archiving must preserve the wallet record and disclose how it affects totals.
- Preserve keyboard access, focus handling, reduced-motion support, and mobile layouts.
- Run `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build` for relevant changes; report any check not run.
- Finish the requested roadmap milestone before moving to later phases.
