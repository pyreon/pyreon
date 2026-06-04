---
'@pyreon/zero-content': minor
---

zero-content PR 3: MDX (JSX-in-markdown) + `src/mdx/` convention scanner + `virtual:zero-content/components` virtual module + build-time component-reference validation.

The third piece of the markdown-driven Pyreon docs story — completes the user-facing contract of "drop a `.tsx` in `src/mdx/`, use it in any `.md` by name".

- **MDX integration** — `remark-mdx` plugged into the unified pipeline. The full MDX grammar works in any `.md` / `.mdx` file: JSX elements (flow + inline), `{expression}` blocks, fragments, spread attributes, expression attributes, boolean attributes, self-closing components. The pipeline gracefully composes with `remark-directive` so `:::tip` syntax keeps working alongside `<Callout>` JSX.
- **`src/mdx/**/*.{ts,tsx,js,jsx}` convention scanner** (`mdx-scan/scanner.ts`) discovers PascalCase exports recursively, excludes `_`-prefixed files (escape hatch for `defineComponents` bundles), supports the full export-form matrix (`const`/`let`/`var`/`function`/`class`/anonymous default with PascalCase basename/named `export { X }` / `export { X as Y }` / `export { X as default }`), and detects name collisions across the whole tree.
- **`virtual:zero-content/components` Vite virtual module** (in the plugin's `resolveId`/`load` hooks). Re-exports every scanned component (both default and named exports normalised). Duplicate-name collisions emit `this.warn()` so users see ALL collisions, not just the first.
- **Per-`.md` ESM hoisting** — `import X from './path'` statements at the top of a markdown file flow through `mdxjsEsm` → hoisted to the compiled `.tsx` module head. Useful for one-off components that don't fit `src/mdx/`.
- **Auto-import** — every uppercase JSX tag referenced in a markdown body produces one `import { Name1, Name2 } from "virtual:zero-content/components"` line at the top of the compiled `.tsx`. Names already brought in via hoisted ESM are suppressed (no double-import).
- **Build-time component-reference validation** with Levenshtein "did you mean?" suggestions. `<Calout type="tip">` → `[@pyreon/zero-content] src/content/x.md: 1 unknown component reference(s).\n  - Unknown component <Calout />. Did you mean <Callout />?` — surfaced via the plugin's `this.error()`. Distance threshold 3; case-insensitive matching.
- **HMR for `src/mdx/`** — the plugin's `handleHotUpdate` watches the scan directory; any change invalidates the cached `virtual:zero-content/components` module via `moduleGraph.invalidateModule`. Vite's graph propagation then re-renders every dependent `.md` page without a full reload.

Pipeline: `parse → frontmatter → gfm → directive → callout → codegroup → mdx → emit-jsx (with Shiki + mdx hoist callbacks)`.

100 new specs across `mdx.test.ts` (23), `scanner.test.ts` (35), `validate.test.ts` (24), `plugin-mdx.test.ts` (10), plus a few in `parse.test.ts`. 261/261 specs passing. Bisect-verified: removing `remark-mdx` from the pipeline fails 10/23 MDX specs with `expected '…' to contain '<Callout type=…>'`.

11/11 validate-fast gates pass. Coverage: statements 98.59%, branches 95.00%, functions 98.95%, lines 100%.
