import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'core',
  // load-native.ts: napi-rs binary loader; resolution depends on per-platform
  //   packages unavailable in test env. Exercised by build job's binary load.
  // event-names.ts: DOM-event-name remap table — data constants exercised only
  //   when matching event handlers appear in compiled JSX.
  coverageExclude: ['src/load-native.ts', 'src/event-names.ts'],
  // Re-baselined 92/85/94/94 → 89/83/93/92 (measured 89.12/83.14/93.51/92.36
  // at the 2026-07 coverage-gate restoration; the Coverage (Full) gate had
  // been red on every main run — a red-on-arrival threshold detects nothing).
  // Beyond the long-standing jsx.ts edge-case tail, the drift came from the
  // PMTC/audit-era modules landing with integration-tier coverage:
  // validate-emit.ts (56% — swiftc/kotlinc validation loops run in the
  // `test (native)` CI cell, not vitest), native-audit.ts (56% — same),
  // diagnose.ts (63% — the throw-time fix-printer catalog, exercised by
  // e2e/dev-error-printer.spec.ts). Aspiration stays 95/95 — raise back in
  // lockstep as targeted tests land (BELOW_FLOOR_EXEMPTIONS entry in
  // scripts/check-coverage.ts mirrors these numbers).
  // Ratcheted 89→91 stmts / 83→85 branches / 93→94 funcs / 92→94 lines
  // (measured 91.79 / 85.56 / 94.77 / 95.10) after validate-emit.ts — the
  // compile-time @pyreon/validate specializer — gained full behavioral
  // coverage of its check vocabulary (string max/length/url/uuid/regex,
  // number gt/lt/positive/negative/gte-lte) + the emitSchemaSource mini
  // rewrite (56.3%→98.9% stmts). A ~0.5–1pp buffer under each measured value
  // absorbs `test (native)`-cell variance in the jsx.ts native-equivalence tail.
  // Ratcheted 91/85/94/94 -> 93/86/99/96 (measured 93.71 / 86.15 / 99.18 /
  // 96.88) by the 92%+ campaign. Branches remain well short of 92, and the
  // reason is worth stating because it is not "nobody wrote the tests":
  //
  // 871 arms are uncovered and roughly 240 of them are `?? []` / `?? null`
  // guards on AST node fields in plain.ts + plain-migrate.ts — a
  // `VariableDeclaration` always has `declarations`, so no valid parsed source
  // reaches them. Reaching those needs hand-forged malformed ASTs, which
  // tests the guard rather than the compiler.
  //
  // jsx.ts holds 368 more, and a purpose-written 42-spec suite over its
  // SSR-lowering eligibility moved coverage by ZERO: the 300-seed
  // differential fuzz already reaches every one of those lines. The suite was
  // kept anyway — the fuzz's oracle is byte-identity, which a BAIL satisfies
  // trivially, so nothing in it can detect the fast path silently ceasing to
  // fire. That is the shape of what is left here: lines the existing gates
  // cross without asserting anything about.
  coverageThresholds: { statements: 93, branches: 86, functions: 99, lines: 96 },
})
