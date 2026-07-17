# Submitting Pyreon to krausest/js-framework-benchmark

This directory is a ready-to-submit `frameworks/keyed/pyreon` implementation
for the independent [js-framework-benchmark](https://github.com/krausest/js-framework-benchmark).
Submitting it upstream is the one step that resolves the documented
author-judge limit on Pyreon's own benchmark claims (see CLAUDE.md
"Benchmark Results — honest limits").

It uses ONLY published npm packages (`@pyreon/*@^0.48.0`) — no workspace
references — so it builds standalone inside the upstream repo.

**Keep this pin current before submitting.** `^0.x.y` locks the MINOR (npm
caret semantics for 0.x), so a stale pin does not drift forward on its own —
it silently submits an OLD Pyreon and gets it published as our independent
number. This was staged at `^0.38.0` and sat unrefreshed through ten releases
(0.38 → 0.48), which would have had krausest measure a Pyreon predating, among
others, the `remove` fast path (#2288) and the anchor-registry retained fix
(#2003) — i.e. worse than shipped code, permanently, under our own name.
Re-pin + re-verify (below) as part of submitting.

## Steps (manual — an external PR must be a human decision)

1. Fork https://github.com/krausest/js-framework-benchmark and clone it.
2. Copy this directory (everything except this README) to
   `frameworks/keyed/pyreon/` in the fork.
3. From the fork root, follow their contribution docs (README + wiki):
   `npm ci` at the root, then in `frameworks/keyed/pyreon/`:
   `npm install && npm run build-prod`.
   (`npm install`, NOT `npm ci` — no `package-lock.json` is committed here, and
   `npm ci` requires one. Generate the lock in the fork; that is also where it
   belongs, since the lock should pin against the upstream repo's tree.)
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
