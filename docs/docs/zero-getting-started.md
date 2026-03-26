# Getting Started

Pyreon Zero is a signal-based meta-framework built on [Pyreon](https://github.com/pyreon/pyreon) and [Vite](https://vite.dev). It provides file-based routing, SSR, SSG, ISR, and SPA modes out of the box.

## Create a project

```bash
bun create zero my-app
cd my-app
bun install
```

## Project structure

```
my-app/
├── index.html
├── vite.config.ts
├── env.d.ts
├── package.json
├── tsconfig.json
└── src/
    ├── entry-client.ts
    ├── entry-server.ts
    └── routes/
        ├── index.tsx       → /
        └── about.tsx       → /about
```

## Development

```bash
bun run dev       # Start dev server on :3000
bun run build     # Build for production (client + server)
bun run preview   # Preview production build
```

## How it works

1. **`vite.config.ts`** loads two plugins:
   - `@pyreon/vite-plugin` — handles JSX transform and SSR dev middleware
   - `@pyreon/zero` — adds file-based routing via `virtual:zero/routes`

2. **`src/entry-client.ts`** imports routes from the virtual module and calls `startClient()` to hydrate or mount the app.

3. **`src/entry-server.ts`** imports routes and calls `createServer()` to create an SSR request handler.

4. **`src/routes/`** — every `.tsx` file becomes a route. The file path maps to the URL path.

## Adding a page

Create `src/routes/contact.tsx`:

```tsx
import { useHead } from "@pyreon/head"

export default function Contact() {
  useHead({ title: "Contact" })

  return (
    <main>
      <h1>Contact us</h1>
      <p>hello@example.com</p>
    </main>
  )
}
```

The route `/contact` is now live — no config or registration needed.

## Next steps

- [Routing](./routing.md) — dynamic params, catch-all, layouts, groups
- [Configuration](./configuration.md) — rendering modes, adapters, middleware
- [API Reference](./api.md) — exports from `@pyreon/zero`
