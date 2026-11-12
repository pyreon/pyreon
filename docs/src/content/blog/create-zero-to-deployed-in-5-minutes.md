---
title: "From npm create to a production server in five minutes"
description: "One command to scaffold, one to install, one to build: a Node server that streams server-rendered HTML, answers API routes and serves prerendered pages. Every command and every output here came from a real run."
date: 2027-01-04
slug: create-zero-to-deployed-in-5-minutes
tags: [javascript, webdev, tutorial, ssr]
cover: /blog/covers/create-zero-to-deployed-in-5-minutes.png
---

New year, new side project. Here is the fast lane: one command to scaffold, one to install, one to build, and you have a Node server that streams server-rendered HTML, answers API routes and serves prerendered pages straight from disk. Five minutes, most of it spent waiting on `npm install`.

This walkthrough shows every step with the real output it printed, so you know exactly what to expect, including the one line we recommend when you pair experimental `mode: 'auto'` with a Node server.

You need Node.js or Bun. The commands below use npm; the Bun equivalents are in brackets.

## 1. Scaffold

```bash
npm create @pyreon/zero@latest my-app -- --adapter node --yes
# [bun create @pyreon/zero my-app --adapter node --yes]
```

Run it bare and `@pyreon/create-zero` walks you through about a dozen questions: template, render mode, deploy target, feature preset, package imports, backend integrations, AI tooling, a migration compat layer, lint and typed routes. `--yes` takes the defaults for everything you didn't pass: the `app` template, streaming SSR, and the standard features (store, query, forms). With npm, the `--` hands the flags to the scaffolder instead of npm; `bun create` takes them directly.

```text
┌   Pyreon Zero
│
◇  Project created!
│
◇  Next steps
│  cd my-app
│  npm install
│  npm run dev
│
└  Happy building!
```

The next steps match the package manager you ran it with (npm, pnpm, yarn or bun). The scaffolder never installs anything itself.

## 2. What you got

```text
my-app/
├── .mcp.json              # MCP server registration for AI assistants
├── .pyreonlintrc.json     # @pyreon/lint, recommended preset
├── CLAUDE.md
├── Dockerfile             # from --adapter node
├── README.md
├── index.html
├── package.json
├── tsconfig.json          # jsxImportSource: @pyreon/core
├── vite.config.ts
├── public/favicon.svg
└── src/
    ├── entry-client.ts
    ├── entry-server.ts
    ├── global.css
    ├── stores/app.ts
    └── routes/
        ├── _layout.tsx  _error.tsx  _loading.tsx
        ├── index.tsx  about.tsx  counter.tsx
        ├── (admin)/dashboard.tsx
        ├── api/health.ts  api/posts.ts
        └── posts/index.tsx  posts/[id].tsx
```

There's no separate framework config. Everything lives in `vite.config.ts`:

```ts
import pyreon from '@pyreon/vite-plugin'
import zero from '@pyreon/zero/server'
import { nodeAdapter } from '@pyreon/zero/server'

export default {
  plugins: [
    pyreon(),
    zero({
      mode: 'ssr', ssr: { mode: 'stream' }, adapter: nodeAdapter(),
      typedRoutes: true,
      font: { /* Google Fonts, self-hosted at build time */ },
      seo: { /* sitemap.xml + robots.txt */ },
    }),
  ],
}
```

`pyreon()` is the JSX compiler. `zero()` adds file-based routing, server rendering and the build pipeline. The `package.json` scripts are `dev`, `build` and `preview` (all `zero …`), plus `typecheck`, `lint` and `doctor` for a project health audit.

## 3. Run it

```bash
cd my-app
npm install          # [bun install]
npm run dev          # [bun run dev]
```

The dev banner shows the app's render mode and how many routes use each one; `zero dev --routes` lists every route with its resolved mode.

Open `/counter` first. It's written in Plain Mode, the experimental dialect where reactive state reads like ordinary variables:

```tsx
import { derived, state } from "@pyreon/core/plain"

export default function Counter() {
  let count = state(0)
  const doubled = derived(count * 2)
  // ...
  <div class="counter-display">{count}</div>
  <button onClick={() => { count++ }}>+</button>
}
```

The compiler rewrites this into signals: `count++` becomes a signal write and `{count}` becomes a binding on one text node. The function still runs once. Prefer the explicit API (`signal()`, `count()`, `count.set()`)? Drop the `@pyreon/core/plain` import and write it that way. Both compile down to the same signal primitives.

Now open `src/routes/posts/[id].tsx`. A route file is a module, and Zero reads its exports:

```tsx
export const getStaticPaths: GetStaticPaths<{ id: string }> = () =>
  Object.keys(POSTS).map((id) => ({ params: { id } }))

export async function loader(ctx: LoaderContext) {
  const post = POSTS[ctx.params.id]
  if (!post) throw new Error("Post not found")
  return { post }
}

export default function PostDetail() {
  const data = useLoaderData<{ post: Post }>()
  // ...
}
```

`loader` runs on the server for SSR, and at build time for static routes. `getStaticPaths` lists the ids to prerender whenever this route is built statically. API routes are plain functions named after HTTP methods:

```ts
// src/routes/api/health.ts
export function GET() {
  return Response.json({ status: "ok", timestamp: new Date().toISOString() })
}
```

> **Static where it can be, server-rendered where it must be, decided per route.**

## 4. Pick a render mode per route

Zero has five app-level modes, chosen at scaffold time with `--mode`:

| `--mode` | `zero({ ... })` | what it does |
| --- | --- | --- |
| `ssr-stream` | `mode: 'ssr', ssr: { mode: 'stream' }` | progressive HTML with Suspense |
| `ssr-string` | `mode: 'ssr'` | buffered HTML |
| `ssg` | `mode: 'ssg'` | prerendered at build, no server at runtime |
| `isr` | `mode: 'isr'` | server rendering behind a stale-while-revalidate cache |
| `spa` | `mode: 'spa'` | client-only |

The app mode is only the default. Any route can pick its own. The about page has no data, so make it static with one line:

```tsx
// src/routes/about.tsx
export const renderMode = 'ssg'
```

Build:

```bash
npm run build
```

```text
[zero] Route modes (app: ssr) — 5 ssr λ · 1 ssg ○
  λ ssr  /
  ○ ssg  /about  (declared)
  λ ssr  /counter
  λ ssr  /dashboard
  λ ssr  /posts
  λ ssr  /posts/:id

  ○ 1 prerendered page (29.6 kB html)
  ✓ Build complete in 536 ms
```

`dist/about/index.html` now exists. The Node server serves it from disk first; if the file were ever missing it falls back to rendering the page, never to a 404.

A `_layout` file can declare a mode too, and it cascades to every route below it. Prefer policy in one place? `routeRules` maps path globs to modes:

```ts
zero({
  mode: 'ssr',
  routeRules: {
    '/blog/**': { renderMode: 'isr' },
    '/admin/**': { renderMode: 'spa' },
  },
})
```

Precedence is always the same: the page's own `renderMode`, then the nearest `_layout`, then `routeRules`, then `mode: 'auto'` inference, then the app `mode`. Impossible combinations fail the build and name the offending route: a route declaring `'ssr'` in an app built with `mode: 'ssg'` is an error, because a static deploy has no server.

## 5. Run the production server

```bash
PORT=8080 node dist/index.js
```

```text
  ⚡ Zero production server running on http://localhost:8080
```

```bash
curl -s localhost:8080/api/health
# {"status":"ok","timestamp":"2026-11-10T17:25:15.561Z"}

curl -s localhost:8080/posts/2 | grep -o "<h1[^>]*>[^<]*</h1>"
# <h1>Understanding Signals</h1>
```

That second command is the whole point of SSR: the post's title is in the HTML the server sent, before a single line of JavaScript runs. When the client bundle loads, hydration adopts those server nodes instead of replacing them. [December's hydration post](/blog/hydration-that-adopts-the-server-dom) shows how.

The Node adapter writes `dist/index.js` (a `node:http` server), `dist/server/` (the SSR bundle) and `dist/client/` (static assets). The SSR bundle imports your app's packages from `node_modules` at runtime, so ship `node_modules` with `dist/`. The scaffolded `Dockerfile` does exactly that: it builds with Bun, installs production dependencies in a separate stage, and runs the result on `node:26-alpine` as the unprivileged `node` user.

## 6. Let `mode: 'auto'` decide (experimental)

Rather not declare modes at all? Ask Zero to infer them. Change one word in `vite.config.ts` and remove the `renderMode` line from `about.tsx`:

```ts
zero({ mode: 'auto', ssr: { mode: 'stream' }, adapter: nodeAdapter(), /* ... */ })
```

The rule is "static unless the code says otherwise", per route. A `revalidate` export means ISR. A `getStaticPaths` export means SSG, even next to a loader. A `loader`, a `.server.ts` sibling, a `guard` or `middleware` means SSR. Everything else is SSG. Explicit `renderMode` exports, layouts and `routeRules` always win. The build announces its decision and prints the table:

```text
[Pyreon] mode: 'auto' → 'ssr' (8 page route(s) scanned; the build mode table
shows the per-route inference — explicit renderMode exports and routeRules always win)
[zero:ssg] Prerendered 8 page(s) in 115ms (concurrency: 4)
[zero] Route modes (app: auto) — 4 ssg ○ · 2 ssr λ
  ○ ssg  /
  ○ ssg  /about
  ○ ssg  /counter
  λ ssr  /dashboard
  λ ssr  /posts
  ○ ssg  /posts/:id
  ○ 8 prerendered pages (125.6 kB html)
```

Read it against the rule: `/posts` has a loader and no `getStaticPaths`, so SSR. `/dashboard` exports a `guard`, so SSR. `/posts/:id` has `getStaticPaths`, so all five posts are prerendered. The plain pages are static. Because some routes need a server, the app as a whole builds as a server app, and every `○` route lands in `dist/` as real HTML.

Shipping `auto` behind the Node adapter? Give the home page an explicit mode: `export const renderMode = 'ssr'` in `src/routes/index.tsx`. A page's own export always beats inference, every other route keeps its inferred mode, and this setup boots the Node server on every Zero version. In some versions, a hybrid Node build that prerendered `/` replaced the server's HTML template, and `node dist/index.js` stopped at boot with `[Pyreon] Template must contain <!--pyreon-app--> placeholder`; [issue #4250](https://github.com/pyreon/pyreon/issues/4250) has the details.

> **One word in your config, and Zero infers a render mode for every route.**

## Other targets

`--adapter` takes `vercel`, `cloudflare`, `netlify`, `node`, `bun` or `static`. Each writes its platform files (`vercel.json`, a `wrangler.toml` with `nodejs_compat` already set, `netlify.toml`, or a Dockerfile for `node` and `bun`) and wires the matching adapter into `vite.config.ts`. `static` writes nothing beyond `dist/`, and the scaffolder refuses it with SSR or ISR, because there's no server to run them.

Picked one adapter and want another? Scaffold again into a scratch folder and copy the adapter lines across. The config is short enough to read in one sitting.

## Know before you ship

- **`mode: 'auto'` is experimental.** It prerenders inferred static routes in mixed apps, and the build table tells you exactly what it chose. Behind the Node adapter, pin the home page to SSR as shown above.
- **This walkthrough ends at a production server running locally.** The Vercel, Netlify and Cloudflare adapters are covered by the project's own tests and [docs](/docs/zero), not by this tutorial, and the Dockerfile was not built for this post.
- **The default scaffold carries the full stack.** In this build the two client entry chunks came to about 51 kB gzipped, because the `app` template ships the router, head management, query, forms, a store and the demo pages. `--preset minimal` starts with no features, as an SPA on a static deploy.
- **Plain Mode is experimental**, and the scaffold uses it in `counter.tsx`. It compiles to the same signals as the explicit API; its edge cases are newer.
- **Pyreon is pre-1.0.** Breaking changes ship as minor versions. `pyreon upgrade` aligns your `@pyreon/*` versions and runs the codemods for each release it crosses (it's a dry run until you pass `--write`).

## Build something with it

```bash
npm create @pyreon/zero@latest
```

- Render modes, adapters and everything else from this walkthrough: [Zero docs](/docs/zero) and [create-zero](/docs/create-zero)
- Star the repo: [github.com/pyreon/pyreon](https://github.com/pyreon/pyreon)
- Questions, ideas, a bug: open an issue on [GitHub](https://github.com/pyreon/pyreon/issues), where every answer stays findable for the next person.
