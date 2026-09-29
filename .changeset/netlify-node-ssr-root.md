---
'@pyreon/zero': patch
---

Netlify adapter (Node function, non-edge): two production SSR fixes, both reproduced under `netlify dev` against a real zero build.

- `/` no longer serves the unrendered SSR template. The function is `preferStatic: true`, so Netlify served `publish/index.html` for `/`, and that file is the client template with `<!--pyreon-app-->` still empty. The adapter now leaves out an `index.html` that is still unrendered. A prerendered `/` is kept.
- SSR pages now reference the hashed client entry. When Netlify bundles a function into one module (`netlify dev` always does, and a production build does with `node_bundler = "esbuild"`), the server bundle's `import.meta.url` read of `template.html` fails. Every page therefore fell back to the dev `/src/entry-client.ts` and never hydrated. The function now inlines the built template before dynamically importing the server bundle, as the Cloudflare adapter already does.
