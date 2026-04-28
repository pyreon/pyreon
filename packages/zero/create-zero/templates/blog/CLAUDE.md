# Blog (Pyreon Zero)

A statically-rendered blog. Posts live as TSX files in `src/content/posts/`.

## Reactivity (Pyreon, not React)

- `signal()` not `useState`; `computed()` not `useMemo`; `effect()` not `useEffect`.
- Write signals via `signal.set(value)` or `signal.update(fn)`. Calling `signal(value)` does NOT write — it reads.
- Inside JSX, signals auto-call: `{count}` (compiler inserts `()`). Outside JSX, call explicitly.

## JSX

- `class=` not `className`; `for=` not `htmlFor`; camelCase events (`onClick`, `onMouseEnter`).
- JSX import source is `@pyreon/core` — auto-configured via tsconfig.

## Adding a post

Drop a `.tsx` file in `src/content/posts/`:

```tsx
export const meta = {
  title: "My new post",
  date: "2026-04-28",
  description: "One sentence summary used in meta tags + RSS.",
  tags: ["pyreon", "ssg"],
}

export default function Post() {
  return (
    <>
      <p>The body of the post — JSX, including code blocks, images, etc.</p>
    </>
  )
}
```

The post auto-appears in `/blog/` and the `/rss.xml` feed via `src/lib/posts.ts`'s
`import.meta.glob` scan. The slug is derived from the filename.

## Routes

- `/` — landing page with the most recent posts
- `/blog/` — full post archive
- `/blog/:slug` — post detail with hydration
- `/rss.xml` — RSS feed (API route)

## Rendering

This template is configured for SSG — every route is pre-rendered at build time.
The `/rss.xml` API route is also pre-rendered. Per-post viewers are hydrated client-
side so internal links and theme toggles stay reactive.

## Commands

```bash
bun run dev       # dev server with HMR
bun run build     # static build → dist/
bun run preview   # serve dist/ locally
```
