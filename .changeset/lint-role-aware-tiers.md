---
'@pyreon/lint': minor
'@pyreon/cli': minor
'@pyreon/create-zero': patch
'@pyreon/loom': patch
'@pyreon/lathe': patch
'@pyreon/zero': patch
'@pyreon/create-multiplatform': patch
---

Role-aware rule tiers — one config now covers server, client, isomorphic and
multiplatform code, with no glob `overrides`.

A general-purpose linter splits backend from frontend with hand-written globs
the user keeps in sync. A framework does not have to guess: an fs-router API
route, a `node:` import, an `island()` call and an entry file each PROVE where
a file runs. `resolveFileRole()` reads them, strongest signal first, and
defaults to `shared` — the strict answer, because an isomorphic file must
satisfy both sides and guessing either one silently disables the other's rules.

**This was already happening, badly.** Two rules classified server files with
`filePath.includes('server')`, and `observer` contains `server` — so
`use-intersection-observer.ts`, a client hook, was treated as a server file by
both. Reproduced against `lintFile`, then fixed. A third rule re-implemented
`isTestFile` inline, omitting `/__tests__/`.

**Eleven new rules across five new groups** (113 rules, 25 categories,
10 groups). Every one gated by the RUNNER via `appliesTo`, never by the rule —
`exemptPaths` was opt-in per rule and 55 of 102 silently ignored it, and a role
gate written rule-by-rule would repeat that exactly.

- **`isomorphic`** — `no-locale-dependent-format`, `no-timezone-dependent-date`,
  `no-unstable-render-id`, `no-node-builtin-in-component`. Hydration mismatches
  that are correct in every unit test and wrong for some users in production.
- **`backend`** — `no-sync-fs-in-request-path`, `no-floating-promise-in-handler`.
- **`web-perf`** — `prefer-passive-listener`, `no-unbounded-raf-loop`.
- **`portable`** — `no-out-of-subset-construct`, `no-platform-branch-without-fallback`.
  PMTC warns about these too, but only for files a native app's entry graph
  reaches; the catalog names that gap directly ("a feature no example uses is
  one no gate ever compiles"). These fire at authoring time instead.
- **`js`** — `require-error-cause`.

**Precision came from measurement, not taste.** Run unscoped against this repo
the first cut produced **over 5,000 findings**; reading them produced five
narrowings, and the final count is **11**:

| finding | cause | narrowing |
|---|---|---|
| 4,388 subset | web-only internals are entitled to the whole language | fires only where `portablePaths` says a file must travel |
| 469 floating promise | a shared util is not a request handler | the file must EXPORT a handler |
| 149 sync fs | Vite plugins and the compiler are server-role, not request paths | same handler gate |
| 14 raf | a one-shot frame is ordinary | must schedule ITSELF |
| 1 raf | a double-rAF terminates | self-REFERENCE, not merely nested |
| 11 locale | benches print to a console | `bench/` and `e2e/` are build role |
| 2 timezone | `new Date(y, m, d).getDate()` is timezone-independent arithmetic | only Dates representing an INSTANT |
| 2 error-cause | a custom error class has no options slot | built-in error constructors only |

**Two real bugs found and fixed by the new rules.** The scaffolded dashboard
template formatted money and dates with no locale in 14 places — every
generated app shipped a hydration mismatch on its own front page. Fixed with a
`lib/format.ts` that pins locale AND timezone, which is also the pattern users
should copy. And five `throw new Error(msg)` sites inside `catch` now pass
`{ cause }`, so the stack points at what actually broke.

Also closes the review finding on `no-unsanitized-inner-html`: a dead
assignment was a half-written hop loop, and finishing it fixed a real
false positive — a sanitized value that had been renamed once
(`const body = clean`) was flagged.
