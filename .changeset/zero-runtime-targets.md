---
'@pyreon/zero': minor
'@pyreon/mcp': patch
---

Edge runtimes, a Deno adapter, and scheduled API routes.

- Routes can declare `export const runtime = 'edge' | 'nodejs'`. `vercelAdapter()` splits edge routes into an Edge Function (`ssr-edge.func`); `vercelAdapter({ runtime: 'edge' })` runs the whole app on the edge. `netlifyAdapter({ edge: true })` / per-route declarations emit a Netlify Edge Function. Cloudflare honours them natively; node/bun fail the build clearly.
- New `denoAdapter()` — a `Deno.serve()` runner over the edge bundle.
- Edge functions ship a second server bundle built for a web-worker runtime with no `node:*` imports; `@pyreon/zero/edge` is the tooling-free server runtime it uses.
- API routes can declare `export const schedule = '<cron>'`, validated at build time and mapped to Vercel crons, Netlify scheduled functions, `Deno.cron`, or an opt-in in-process scheduler (`nodeAdapter({ scheduler: true })` / `bunAdapter({ scheduler: true })`). Cloudflare Pages has no cron triggers, so a schedule fails the build there.

Output is unchanged for apps without these declarations.
