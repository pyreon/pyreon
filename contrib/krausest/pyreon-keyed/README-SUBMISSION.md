# Submitting Pyreon to krausest/js-framework-benchmark

This directory is a ready-to-submit `frameworks/keyed/pyreon` implementation
for the independent [js-framework-benchmark](https://github.com/krausest/js-framework-benchmark).
Submitting it upstream is the one step that resolves the documented
author-judge limit on Pyreon's own benchmark claims (see CLAUDE.md
"Benchmark Results — honest limits").

It uses ONLY published npm packages (`@pyreon/*@^0.38.0`) — no workspace
references — so it builds standalone inside the upstream repo.

## Steps (manual — an external PR must be a human decision)

1. Fork https://github.com/krausest/js-framework-benchmark and clone it.
2. Copy this directory (everything except this README) to
   `frameworks/keyed/pyreon/` in the fork.
3. From the fork root, follow their contribution docs (README + wiki):
   `npm ci` at the root, then in `frameworks/keyed/pyreon/`:
   `npm ci && npm run build-prod`.
4. Smoke it: serve the repo root (`npm start`) and open
   `http://localhost:8080/frameworks/keyed/pyreon/` — every button must
   work, selection must highlight via the `danger` row class, remove via
   the glyphicon link.
5. Run their check tools (from `webdriver-ts`):
   `npm run isKeyed -- --headless true keyed/pyreon` must report KEYED.
   Then a bench sanity run: `npm run bench -- --headless true keyed/pyreon`.
6. Open the upstream PR (their template asks for the framework home URL
   and a maintainer contact).

## Implementation notes (for the upstream review)

- Idiomatic Pyreon: `signal()` state, `<For by={id}>` keyed reconciliation,
  `createSelector` for O(1) selection, per-row `signal` labels so "update
  every 10th" patches only the touched text nodes.
- `swapRows` follows the spec (indices 1 and 998).
- The compiled output comes from `@pyreon/vite-plugin` — the same compiler
  every Pyreon app uses; there is no bench-only fast path.
