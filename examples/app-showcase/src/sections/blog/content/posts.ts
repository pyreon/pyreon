import type { Post } from './types'

/**
 * Blog post seed data. In a real app these might come from a CMS, an
 * MDX folder, or a remote API — the loader pattern stays the same.
 *
 * Posts are kept here as a plain TS array so the example doesn't need
 * a markdown parser at build time and the content is fully type-checked.
 */
const RAW: Omit<Post, 'readMinutes'>[] = [
  {
    slug: 'why-signals',
    title: 'Why signals beat the virtual DOM',
    excerpt:
      'Fine-grained reactivity skips the diff phase entirely. Updates flow directly to the DOM nodes that actually need them.',
    date: '2026-04-02',
    author: 'Vít Bokisch',
    tags: ['reactivity', 'performance'],
    body: [
      {
        kind: 'p',
        text: 'Most JS frameworks built in the React era diff a virtual DOM tree to figure out what changed. The diff is the cost — for a counter that updates one number, the framework still walks the entire component subtree before realizing only one text node needs to change.',
      },
      {
        kind: 'p',
        text: 'Signals flip the model. Each reactive value remembers which DOM nodes depend on it. When the value changes, only those nodes re-run. The component function ran exactly once, at mount.',
      },
      { kind: 'h2', text: 'A counter, two ways' },
      {
        kind: 'code',
        lang: 'tsx',
        text: '// Pyreon — runs once, the text node updates directly\nfunction Counter() {\n  const count = signal(0)\n  return <button onClick={() => count.set(count() + 1)}>{count()}</button>\n}',
      },
      {
        kind: 'p',
        text: 'On click, Pyreon walks zero VNodes. The compiler emits a `_bind` call against the text node behind `{count()}` and the runtime updates `node.data` directly. No reconciliation, no children comparison, no parent walks.',
      },
      { kind: 'h2', text: 'Where the gap shows' },
      {
        kind: 'p',
        text: 'On the standard JS framework benchmark, Pyreon updates 1,000 partial rows in 5ms — the same as Solid, faster than Vue and React. The closer you get to the metal, the more the gap matters.',
      },
      {
        kind: 'quote',
        text: 'The fastest code is the code that never runs.',
        cite: 'Every performance engineer ever',
      },
    ],
  },
  {
    slug: 'styler-vs-rocketstyle',
    title: 'When to reach for styler vs rocketstyle',
    excerpt:
      "Pyreon's UI system has two layers of styling. They look similar but solve different problems — pick the wrong one and you'll fight the framework.",
    date: '2026-03-28',
    author: 'Vít Bokisch',
    tags: ['ui-system', 'styling'],
    body: [
      {
        kind: 'p',
        text: '`@pyreon/styler` is a CSS-in-JS layer with `styled()` tagged templates. It produces a class name and a stylesheet rule. That is the entire feature set.',
      },
      {
        kind: 'p',
        text: '`@pyreon/rocketstyle` builds on top of styler to add multi-dimensional styling: states (primary, danger), sizes (small, medium, large), variants (outline, filled), themes, and dark mode. Every component in `@pyreon/ui-components` is a rocketstyle chain.',
      },
      { kind: 'h2', text: 'The rule of thumb' },
      {
        kind: 'list',
        items: [
          'New visual primitive that has no dimension axes (just static styling) → `styled(\'tag\')`',
          'Existing rocketstyle component you want to tweak → extend the chain: `Component.attrs(...).theme(...)`',
          'Brand-new design-system component with state/size/variant axes → start with `el`/`txt`/`list` and build a rocketstyle chain',
        ],
      },
      { kind: 'h3', text: 'Don\'t mix them in one component' },
      {
        kind: 'p',
        text: 'A `styled(Card)` wrapper around a rocketstyle Card defeats the purpose: rocketstyle generates one set of classes, styler generates another, and you lose the typed `t` parameter on the inner `.theme()` callback.',
      },
    ],
  },
  {
    slug: 'zero-app-routing',
    title: 'How Zero turns src/routes into a router',
    excerpt:
      'Drop a file in src/routes, get a route. The convention is small enough to memorize and powerful enough to host an entire app.',
    date: '2026-03-21',
    author: 'Vít Bokisch',
    tags: ['zero', 'routing'],
    body: [
      {
        kind: 'p',
        text: 'Every file under `src/routes` becomes a route. The path mirrors the file structure with one rewrite: `index` collapses to its parent folder, brackets become parameters, and underscored files are reserved for layouts and special pages.',
      },
      { kind: 'h2', text: 'The conventions' },
      {
        kind: 'list',
        items: [
          '`src/routes/index.tsx` → `/`',
          '`src/routes/about.tsx` → `/about`',
          '`src/routes/blog/[slug].tsx` → `/blog/:slug`',
          '`src/routes/users/[...rest].tsx` → catch-all `/users/*`',
          '`src/routes/_layout.tsx` → wraps every route at this level',
          '`src/routes/_404.tsx` → renders on no-match',
          '`src/routes/_error.tsx` → renders on render-time errors',
        ],
      },
      { kind: 'h2', text: 'Co-locate per route' },
      {
        kind: 'p',
        text: 'Each route file can export `default` (the page), `loader` (data fetch), `meta` (head tags), `guard` (navigation guard), and `renderMode` (`ssr` | `ssg` | `spa`). The fs-router scans these at build time so the router emits `lazy()` for routes with no metadata and a single namespace import for routes that need it. No `_pick` runtime indirection, no `INEFFECTIVE_DYNAMIC_IMPORT` warnings.',
      },
      { kind: 'h3', text: 'Helpers don\'t belong under routes/' },
      {
        kind: 'p',
        text: 'Anything you put under `src/routes/` becomes a route — including helpers like `TodoList.tsx` or `store/todos.ts`. The convention is to keep route files thin and put section helpers under `src/sections/<section>/`. The route file just imports them.',
      },
    ],
  },
  {
    slug: 'rx-pipe-filters',
    title: 'Filtering 10,000 items with rx.pipe',
    excerpt:
      "Hand-rolled filter chains read fine but re-derive everything on every change. rx.pipe gives you a single Computed that only re-runs when its inputs actually change.",
    date: '2026-03-14',
    author: 'Vít Bokisch',
    tags: ['rx', 'reactivity'],
    body: [
      {
        kind: 'p',
        text: 'A typical filter pipeline reads a source list, a search query, a status filter, and a category, then chains `.filter()` calls. Easy to write, but every signal read re-runs the whole chain on every change.',
      },
      {
        kind: 'p',
        text: '`@pyreon/rx` provides signal-aware transforms. Pass a signal in, get a `Computed` out. Multiple transforms compose into one big derivation that only re-runs when one of its inputs actually changes.',
      },
      { kind: 'h2', text: 'rx.combine for multi-source filters' },
      {
        kind: 'code',
        lang: 'ts',
        text: 'const filtered = rx.combine(\n  store.todos,\n  searchQuery,\n  status,\n  (items, q, currentStatus) =>\n    items.filter((todo) => /* … */),\n)',
      },
      {
        kind: 'p',
        text: 'The result is `Computed<Todo[]>`. Read it as `filtered()` from a render scope and Pyreon\'s compiler tracks the dependency. Update `searchQuery`, only the filter re-runs and the `<For>` reconciles the diff. Update an unrelated signal, the filter doesn\'t run at all.',
      },
    ],
  },
  {
    slug: 'shipping-with-zero',
    title: 'Shipping a Pyreon Zero app to production',
    excerpt:
      'One config file, one adapter, every major host. Zero apps build to the same artifact regardless of where they run.',
    date: '2026-03-05',
    author: 'Vít Bokisch',
    tags: ['zero', 'deployment'],
    body: [
      {
        kind: 'p',
        text: 'Zero ships with adapters for Node, Bun, Vercel, Cloudflare Pages, Netlify, and a static-build adapter. Pick one in `vite.config.ts`, run the build, deploy.',
      },
      {
        kind: 'code',
        lang: 'ts',
        text: '// vite.config.ts — Vercel example\nimport pyreon from "@pyreon/vite-plugin"\nimport zero, { vercelAdapter } from "@pyreon/zero/server"\n\nexport default {\n  plugins: [pyreon(), zero({ adapter: vercelAdapter() })],\n}',
      },
      { kind: 'h2', text: 'What the build emits' },
      {
        kind: 'list',
        items: [
          'Static adapter → `dist/` of HTML files (one per route, plus assets)',
          'Vercel adapter → `.vercel/output/` with serverless functions per dynamic route',
          'Cloudflare adapter → `dist/_worker.js` and asset bindings',
          'Node adapter → a `dist/server.js` that boots on a port',
        ],
      },
      {
        kind: 'p',
        text: 'Loader data is serialized into the HTML, picked up at hydration, and the app continues from where the server left off. No flash, no re-fetch.',
      },
    ],
  },
]

/** Estimate read time at ~200 words per minute. */
function estimateReadMinutes(body: Post['body']): number {
  let words = 0
  for (const block of body) {
    if (block.kind === 'list') {
      for (const item of block.items) words += item.split(/\s+/).length
    } else {
      words += block.text.split(/\s+/).length
    }
  }
  return Math.max(1, Math.round(words / 200))
}

/** All posts, newest first. */
export const posts: Post[] = RAW.map((post) => ({
  ...post,
  readMinutes: estimateReadMinutes(post.body),
})).sort((a, b) => (a.date < b.date ? 1 : -1))

/** Lookup helper used by both routes and the loader. */
export function findPost(slug: string): Post | undefined {
  return posts.find((p) => p.slug === slug)
}

/** All unique tags across all posts, sorted alphabetically. */
export const allTags: string[] = Array.from(new Set(posts.flatMap((p) => p.tags))).sort()
