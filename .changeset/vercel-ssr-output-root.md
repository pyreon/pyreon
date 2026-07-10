---
"@pyreon/zero": minor
"@pyreon/create-zero": patch
---

**Vercel deploys now actually serve the SSR function (and SSG cache headers).** Vercel's Build Output API v3 is auto-detected ONLY at `<projectRoot>/.vercel/output` — `vercelAdapter` was writing the tree inside the build `outDir` (`dist/.vercel/output`), where Vercel never looks. The SSR function was therefore never discovered (dynamic routes 404 / fell through to static), and the SSG variant's `config.json` was a dead file whose long-cache `assets` routes never applied.

- `AdapterBuildOptions` gains a **required** `projectRoot: string` (Vite's resolved `root`) on both the `ssr` and `ssg` variants — required, not optional-with-fallback, so TypeScript rejects an omission at the call site and the bug can't silently reappear. Threaded from both invocation sites (`ssrPlugin` + `ssgPlugin`).
- `vercelAdapter` anchors `.vercel/output` at `projectRoot`, keyed off the shared `VERCEL_ADAPTER_OUTPUT` contract constants. The SSG branch copies (never moves — `materialize`) the prerendered dist into `.vercel/output/static/`, so the original `outDir` stays intact for `vite preview` and user post-build steps.
- Every other adapter (node/bun/netlify/cloudflare/static) is unchanged: they stage entirely inside `outDir` and never read `projectRoot`.

Bisect-verified: anchoring reverted to `outDir` → the two project-root specs fail; restored → 76/76 adapter tests (incl. spawn-and-curl runtime contracts). zero 1653 · create-zero 102 · zero-cli 19 · verify-modes 27/27.
