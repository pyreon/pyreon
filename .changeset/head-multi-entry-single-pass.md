---
'@pyreon/head': patch
---

build(head): replace the #722 externalization workaround with rolldown's native multi-entry single-pass build

**Deeper fix attempt for the bug class #722 patched.** PR #722 fixed the SSG-Meta-dropped bug via per-package externalization (`vl-tools.config.mjs` + self-package source imports + a new `./context` sub-export + a vitest alias). The fix worked but used a *workaround* — telling rolldown to keep the self-package specifier verbatim instead of solving the underlying "multi-entry rolldown invocation per entry, no cross-entry shared chunks" issue.

This commit replaces the workaround with rolldown's NATIVE multi-entry single-pass mode. All 5 entries (`index`, `context`, `provider`, `use-head`, `ssr`) are passed to ONE rolldown invocation; the shared `context` module is deduplicated automatically; every entry emits a clean relative `import { ... } from "./context.js"`. No externalization needed; source can use plain relative `./context` imports.

**Trade-offs (honest accounting — see PR body):**

This isn't a strict improvement. It trades #722's external-config workaround (~15 lines: `vl-tools.config.mjs` + 4 source comments + 1 vitest alias) for a per-package build pipeline (133-line `build.mjs` + 12-line `tsconfig.build.json` + the `_chunks/use-head-<hash>.js` artifact rolldown's chunking heuristic produces for `dom.ts`). Net +116 lines, plus per-package build maintenance vs the shared `@vitus-labs/tools-rolldown`.

**My recommendation: keep #722** unless source-side cleanliness (no self-package imports, no externalization workaround) is more important than build-pipeline simplicity. The bug class is equally locked by both approaches. See the PR description for the full trade-off analysis.

The TRULY deeper fix is upstreaming multi-entry single-pass to `@vitus-labs/tools-rolldown` so every Pyreon package benefits — out of scope here but the right long-term move.
