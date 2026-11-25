# Development conventions

- Inspect existing code and Git status before editing; preserve unrelated work.
- Keep financial calculations in the domain layer and database access in `src/db`.
- Represent money as safe integer centavos and format Philippine pesos with `en-PH`.
- Validate input and surface storage errors; do not silently substitute in-memory state.
- Derive balances from opening balances and posted ledger entries when the ledger exists.
- Transfers must not count as income or expenses. Expected income is not current available balance.
- Keep all financial data local. Do not add a backend, analytics, cloud database, or external financial service.
- Support keyboard access, visible focus, responsive layouts, and reduced-motion preferences.
- Run relevant tests, lint, type checks, and builds when available. Report checks that could not be run.
- Keep product and architecture docs current; see `docs/PRODUCT_SPEC.md` and `docs/ROADMAP.md`.
- Update docs/PROGRESS.md with completed checks and remaining release work before handing off.
