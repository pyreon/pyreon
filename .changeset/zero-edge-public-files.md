---
'@pyreon/zero': patch
---

Serve `public/` files as files on the Netlify Edge, Vercel and Cloudflare deploys. The adapters carved out only a hardcoded list (`/favicon.*`, `/robots.txt`, `/sitemap.xml`, `/site.webmanifest`), so any other file in `public/` — `humans.txt`, `og.png`, `/.well-known/security.txt` — reached the SSR function and came back as a server-rendered HTML page with status 200. On Netlify Edge, which runs before static files, even `robots.txt` did. The adapters now enumerate the client output at build time: Netlify Edge excludes each file from the edge function, Vercel routes each to `static/` before the SSR catch-all, and Cloudflare excludes them in `_routes.json` (within its 100-rule limit) while the worker serves any it still receives from `env.ASSETS`.

The node and deno standalone runners now serve `.txt`, `.xml`, `.webp`, `.avif`, `.gif`, `.map`, `.wasm` and other common `public/` types with a real content type instead of `application/octet-stream`.
