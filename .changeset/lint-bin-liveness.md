---
"@pyreon/lint": patch
---

fix(lint): `pyreon-lint` CLI actually runs (was a silent no-op)

`bin/pyreon-lint.js` did a bare `import('../lib/cli.js')` and relied on an
`if (import.meta.main) main()` guard inside `cli.ts` to invoke the CLI. The
bundler treats `lib/cli.js` as a library entry (it has exports) and
tree-shook that guarded call away — the shipped `lib/cli.js` is a pure
re-export, so `npx pyreon-lint` / `pyreon-lint .` executed **nothing** and
exited 0. The bin now imports `runCli` and calls it explicitly (runtime-
agnostic, bundler-proof), mirroring `@pyreon/cli`'s unconditional invocation.
