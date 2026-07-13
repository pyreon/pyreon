---
"@pyreon/lint": patch
---

Fix nine `@pyreon/lint` rule defects surfaced by an upstream consumer's hardening pass — accuracy, scope, and two code-corrupting autofixes.

- **LT-9** `vitest-config-uses-shared` + `no-querySelector-cast-in-test`: fired at `error` in the default preset mandating `@pyreon/vitest-config` / `@pyreon/test-utils` — both `"private": true`, so a consumer literally cannot satisfy them. Now gated on `isProjectDependency` — silent in a project that doesn't declare the (private) package; the monorepo (which self-depends) still enforces them.
- **LT-7** `no-signal-leak`: flagged `export const x = signal(0)` as "unused" — exported signals are consumed cross-module. Now skips exported bindings.
- **LT-5** `no-signal-in-props`: flagged ANY call in a component prop (`String(v)`, `t(key)`, `humanize(id)` — none signals). Now resolves the callee to a `signal()`/`computed()` binding.
- **LT-4.1** `no-window-in-ssr` + **LT-6** `no-dom-in-setup`: fired inside test files (which never SSR and legitimately touch `window`/`document`). Now skip test files (+ `no-dom-in-setup` gains `exemptPaths`), consistent with the other SSR/browser-API rules.
- **LR-5** `no-onchange`: its **autofix** rewrote `onChange`→`onInput` on `<select>`/`checkbox`/`radio`/etc., where `onChange` is the correct DOM event. Now restricted to text-like inputs.
- **LR-8** `no-error-without-prefix`: **autofixed** a consumer's `throw new Error('Save failed (500)')` to `[Pyreon] …`, mislabeling app errors as framework errors. The `[Pyreon]` prefix is a framework-internal convention, so the rule now fires only inside `@pyreon/*` packages.
- **LR-6** `dev-guard-warnings`: recommended wrapping in `if (__DEV__)` — a global neither `@pyreon/zero` nor `@pyreon/vite-plugin` injects (a runtime `ReferenceError`). Message now recommends the bundler-agnostic `if (process.env.NODE_ENV !== 'production')` (which the rule already accepted).
- **LR-1** `no-bare-signal-in-jsx`: premise was false — `{sig()}` compiles byte-identically to `{() => sig()}` (both reactive), yet the rule flagged it at `error` and autofixed correct code. Demoted to a non-gating `info` style hint and the churning autofix removed.

Also carries a 39-byte `@pyreon/mcp` bundle-budget bump (drift making `Check Bundle Budgets` red on main; mcp is not otherwise touched).
