---
'@pyreon/zero': patch
---

A hybrid build (`mode: 'ssr' | 'isr' | 'auto'`) that prerenders the home page `/` now boots. The SSG pass writes the prerendered `/` to `dist/index.html`, and the SSR post-step copied that file as the server's `template.html`, so the template lost its `<!--pyreon-app-->` placeholder and the server exited with `[Pyreon] Template must contain <!--pyreon-app--> placeholder`. Every adapter (node, bun, deno, vercel, netlify, cloudflare) staged the same file. The template is now taken from the client build's own output before any post-step runs, so the `export const renderMode = 'ssr'` workaround on `/` is no longer needed.
