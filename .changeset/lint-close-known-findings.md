---
'@pyreon/lint': minor
'@pyreon/test-utils': patch
'@pyreon/zero-content': patch
'@pyreon/create-zero': patch
'@pyreon/lathe': patch
---

Closes every open finding from the lint audit, and adds the leak class nothing
caught.

**The 280 `querySelector(…) as HTMLX` casts are gone.** They were ratcheted
because 92 files across 12 packages is not a safe hand-edit; a codemod with
paren-balancing did it, and the conversion is verified rather than assumed —
`query()` THROWS where a cast silently returned null, so a wrong conversion
fails loudly. Typecheck clean across all 17 packages, node tests green, and
**476 browser tests in real Chromium** covering the sites that only exist
there. The doctor grade goes **F → A**, the ratchet drops **284 → 9**, and
`no-query-selector-cast-in-test` is back at `error` rather than the `warn` it
was demoted to in order to fire at all.

**A ReDoS I introduced, caught by CodeQL.** `js/polynomial-redos`, high
severity: `/(?:^|\/)routes\/(.+)$/` backtracks on paths with many `/routes/a`
repetitions, and a linter is handed whatever paths its caller has. Replaced
with linear string slicing — which also fixed a real misclassification, since
the greedy regex anchored on the FIRST `/routes/` and mis-resolved nested
paths. Both halves are pinned.

**New rule — `pyreon/no-unguarded-async-signal-write`** (opt-in), for memory
leak class F, which the catalog lists as caught by nothing. A slow earlier
response resolves last and overwrites newer data: not a crash, not visible in
a heap snapshot, just the wrong answer intermittently. Precision came from
measuring — 42 findings became 9 after two narrowings the corpus taught:
tests and benches cannot race with themselves, and `Map.set(key, value)` takes
two arguments where a signal write takes one.

It found two real bugs, both fixed: `<Mermaid>` and `<Math>` wrote their
rendered output after an await with no cancellation, so unmounting mid-render
kept the whole closure alive for a signal nothing reads.

**Two rules stopped keying on what a thing is NAMED.** `no-mutate-store-state`
fired only when a variable name contained "store" — renaming `cartStore` to
`cart` disabled it silently. It now tracks the binding. `toast-a11y` exempted
the literal spelling `Toaster`, so `import { Toaster as AppToast }` was
reported for missing a11y it already has; the exemption follows the import.

**`<Icon svg>` now states its contract.** It renders raw and cannot sanitize —
the sanitized `innerHTML` prop needs a `DOMParser` and so cannot run during
SSR, which an icon must. Rather than change that, the prop documents that it
takes markup you control, and the new lint rule flags misuse in consumer code.

**A bundle-budget failure now explains itself.** gzip differs between macOS and
the ubuntu runner — measured ~177 B on a 16.5 KB package — so a budget with
less headroom than that fails on CI while passing locally. The overage message
now says when it is inside that band.

Also fixes an untimed `fetch()` in `lathe pull` that could hang the CLI
forever against a server that accepts and never answers.
