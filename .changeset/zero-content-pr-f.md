---
'@pyreon/zero-content': minor
---

PR-F audit — link + image rewriting. Two items, 24 new bisect-verified specs.

**H7** — Local images now route through `<Image>`.
- Pre-fix every `![alt](./hero.png)` emitted as a plain `<img>`, bypassing zero's image-optimization pipeline (auto srcset, blur placeholder, lazy-loading).
- Now: when the image src starts with `./` or `../`, the emit-jsx layer emits `<Image src={import('./hero.png?optimize')} alt={...} />`. Absolute URLs and `data:` URIs fall through to `<img>`.
- `Image` was added to the shared `BUILT_IN_COMPONENTS` list + re-exported as a built-in (`@pyreon/zero-content` → `@pyreon/zero`'s `<Image>`). The rewriter registers `Image` via `mdxComponentRef` so it auto-imports through `virtual:zero-content/components` — no user-side `import { Image }` boilerplate.

**H8** — `[foo](./bar.md)` rewrites to route URLs.
- Pre-fix every internal `.md` link shipped as a literal `./bar.md` href, 404-ing on every static host and confusing the in-app router on others.
- Now: a plugin-supplied resolver rewrites relative `.md`/`.mdx` paths to `/<collection>/<slug>` (preserving any `#anchor` suffix). The resolver is conservative — non-`./`/`../` paths, non-.md targets (e.g. `./schema.json`), and files outside `/content/` all return `null` so the emitter passes them through.
- Internal `/index` collapse so `./index.md` → `/<collection>` (matching the `deriveSlug` convention).

Coverage: `_link-image-rewrite.test.ts` — 24 new specs spanning `isRelativePath`, `makeInternalLinkResolver` (8 specs covering happy paths, anchor preservation, nested dirs, `/index` collapse, `.mdx` extension, null passthroughs), and 3 end-to-end `compileMarkdown` specs.

Total: 466 specs pass (was 454).
