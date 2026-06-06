---
'@pyreon/zero-content': minor
---

fix(zero-content): re-export built-in MDX components from virtual:zero-content/components

The markdown compiler emits `<CodeBlock>` for highlighted fenced code blocks and `<Callout>` for `::: tip` admonitions, then auto-emits `import { CodeBlock } from 'virtual:zero-content/components'` at the top of the compiled `.tsx`. The virtual module however only re-exported user-scanned components from `src/mdx/` — never the built-ins themselves — so every page with a code block or callout crashed the build with `MISSING_EXPORT "CodeBlock" is not exported by "virtual:zero-content/components"`.

The virtual module now ALWAYS re-exports `Callout`, `CodeGroup`, `CodeBlock` from `@pyreon/zero-content`. User-scanned components with the same name take precedence (the documented escape hatch for projects shipping a custom `Callout.tsx` etc.).

Also fixed `emit-jsx.ts`: the `emitCode` highlighter path now calls `opts.mdxComponentRef?.('CodeBlock')` so `compileMarkdown` actually includes `CodeBlock` in the auto-import statement at the top of the emitted `.tsx`. Without the ref call, `CodeBlock` was referenced as a free identifier in the compiled output and threw `ReferenceError: CodeBlock is not defined` at SSG render time. Both halves of the bug — emit-side ref tracking + virtual-module re-export — needed fixing.

End-to-end consequence: `mode: 'ssg'` apps that use `@pyreon/zero-content` now ship FULL article body HTML in their prerendered `dist/<route>/index.html` (verified by docs-zero migration: 92/92 pages prerender with complete content, headings, code blocks). Pre-fix the body was empty until client-side hydration filled it in — bad for SEO, first paint, and no-JS users.
