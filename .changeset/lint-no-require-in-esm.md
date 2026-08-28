---
'@pyreon/lint': minor
---

New rule `pyreon/no-require-in-esm` (error) — `require()` in a package declared
`"type": "module"`.

There is no `require` in an ES module, so the call throws at runtime. What
makes it worth a rule rather than a test is that **Bun defines `require` in
ESM**, so a bun-run vitest suite executes the line and reports green while Node
throws. The catalog records two shipped instances and concludes the lock has to
be static; this is that lock.

It found a third instance on its first run, inside `@pyreon/lint` itself. The
LSP's project-root walk and the `require-browser-smoke-test` rule both read the
filesystem through `require('node:fs')`, both inside `try/catch` — so under
Node they did not crash, they silently returned the fallback. For the
browser-smoke rule that fallback is an EMPTY package set, so the rule matched
nothing at all and `browser-packages.json` was ignored. Measured on the built
lib with identical input: **bun 1 diagnostic, node 0** — `npx pyreon-lint`
enforced less than `bun` did, invisibly. Both are fixed here, and Node now
agrees with Bun.

The rule gates on the owning package's `type` field (`.cjs`/`.mjs` beat the
manifest, and an unprovable file is left alone), and stays quiet on
`typeof require` environment detection and on a locally bound `require`.
