# {{name}}

A [Pyreon Zero](https://pyreon.dev/docs/zero) blog — markdown-style TSX posts, static site generation, RSS + SEO baked in.

## Getting started

```bash
bun install
bun run dev          # → http://localhost:3000
```

## What's in this project

- **`src/content/posts/`** — your blog posts as TSX (one file per post: title, date, tags, body)
- **`src/routes/index.tsx`** — landing page with the latest posts
- **`src/routes/blog/index.tsx`** — full posts list (paginated, tag-filtered)
- **`src/routes/blog/[slug].tsx`** — individual post page (dynamic route)
- **`src/routes/about.tsx`** — about page
- **`src/routes/api/rss.ts`** — RSS feed at `/rss.xml`
- **`src/lib/posts.ts`** — post discovery + sorting (uses `import.meta.glob`)

### Adding a post

Drop a new file under `src/content/posts/<slug>.tsx`:

```tsx
export const meta = {
  title: 'Hello, Pyreon',
  date: '2026-05-25',
  tags: ['announcement'],
  excerpt: 'A short summary that appears in the listing and RSS feed.',
}

export default function Post() {
  return (
    <article>
      <h1>{meta.title}</h1>
      <p>Your post body — anything JSX can express.</p>
    </article>
  )
}
```

The post auto-appears in the listing, gets a per-route HTML at build time, and lands in the RSS feed.

## Scripts

| Command | What it does |
| --- | --- |
| `bun run dev` | Dev server with HMR |
| `bun run build` | Pre-render every post + index → static HTML |
| `bun run preview` | Serve the production build locally |
| `bun run doctor` | Audit the project (lint + types + perf budgets) |
| `bun run lint` | Run `@pyreon/lint` (Pyreon-specific rules) |

## Deploying

Static site generation produces a fully self-contained `dist/` — deploy to any static host. The project was scaffolded with a deployment adapter (see `vercel.json` / `wrangler.toml` / etc.) for one-click deploys.

## Learn more

- **Docs** — https://pyreon.dev/docs
- **Zero meta-framework** — https://pyreon.dev/docs/zero
- **SSG mode** — https://pyreon.dev/docs/ssg
- **`<Image>` + `<Head>`** — https://pyreon.dev/docs/zero#meta

Found a bug or have a question? https://github.com/pyreon/pyreon/issues
