---
'@pyreon/lint': minor
---

The general BE/FE/shared tiers are complete — 16 new rules, taking the linter
to 131. Every tier now matches the role-aware plan exactly: isomorphic 6,
backend 7, web-perf 6, portable 6, js 3.

**isomorphic** — `no-env-branch-in-render` (an environment branch deciding
rendered OUTPUT rather than behaviour is a guaranteed mismatch) and
`require-stable-iteration-order` (`Object.keys()` order is stable within one
process and guarantees nothing between two — a data-dependent mismatch that
fixtures never reproduce).

**backend** — `no-unvalidated-request-body`, `no-await-in-loop-over-io`,
`require-request-signal-forwarding`, `no-module-mutable-in-handler` (per-request
state on a module binding is a data leak, not a race), `no-secret-in-shared-module`.

**web-perf** — `no-layout-thrash`, `require-abort-on-unmount`,
`require-img-loading-hint`, `no-blocking-third-party-script`.

**portable** — `no-web-only-import-in-portable` (mirrors the compiler's
generated web-only set), `prefer-canonical-primitive`,
`require-native-compat-marker`, `no-css-in-js-in-portable`. All opt-in and all
silent until `portablePaths` names the files that must travel.

**js** — `no-catch-without-rethrow-or-report`, opt-in.

Running them over this monorepo is what shaped three of them, and each
correction is recorded in the rule's own docblock:

- `no-await-in-loop-over-io` gated on `appliesTo: ['server']` alone reported 15
  findings, every one an SSG plugin, template engine or scanner. Server-role is
  not request-serving; it now needs a handler export or an api route, the line
  its siblings already drew. 15 → 0.
- `no-secret-in-shared-module` reported `FORCE_COLOR` three times in
  `@pyreon/ansi` — a TTY capability check, not a credential. The benign list
  now earns entries by measurement.
- `no-catch-without-rethrow-or-report` reported 411. A rule that cannot be
  driven to zero does not belong in a preset that gates CI, so it ships opt-in
  with the measured number in its docblock.

`pyreon doctor --only lint --ci` reports **no findings** with all 131 live.
