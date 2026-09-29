---
'@pyreon/zero': patch
'@pyreon/create-zero': patch
---

Remove the dead `[[redirects]] from = "/*" to = "/.netlify/functions/ssr"` rule from the Netlify adapter's `dist/netlify.toml` and from the root `netlify.toml` that `create-zero` scaffolds for SSR/ISR. The SSR function routes itself via `config.path = "/*"` (with `preferStatic: true`), and Netlify makes a function with a custom `path` unreachable at `/.netlify/functions/<name>`, so the rewrite pointed at nothing. Existing projects can delete that block from their `netlify.toml`; routing is unchanged either way.
