# The app every arm implements

Every arm builds the same small app. The harness gate (`lib/gate.ts`) checks the observable parts; the rest keeps bytes and work comparable.

## Data

- Copy `shared/data.ts` **verbatim** into the arm (any path; name it in `stack.json` → `dataFile`). Never edit the copy; the harness refuses to measure a copy that differs.
- All reads and writes go through it: `listItems()`, `getItem(id)`, `validateName(raw)`, `addItem(name)`, `formatPrice(cents)`.
- It is a server-side "database": it must only run on the server (a server loader / server function / server component / frontmatter), never be bundled to the client.

## Pages

No CSS, no fonts, no favicon, no analytics. Keep the root layout as small as the framework allows (`<html lang="en">`, `<head>` with `<meta charset>`, viewport meta and `<title>Items</title>`, and whatever the framework itself injects).

### `/items` (loader → `listItems()`)

```html
<h1>Items</h1>
<button id="counter" type="button">Count: 0</button>
<!-- the interactive widget -->
<ul id="items">
  <li><a href="/items/1">Item 1: …</a> <span class="price">$12.34</span></li>
  … one
  <li>per item, in order …</li>
</ul>
<form method="post" …>
  <!-- the framework's own form/action primitive -->
  <input name="name" />
  <!-- NO required/minlength: validation is server-side -->
  <button type="submit">Add</button>
</form>
<p id="form-error">Name must be 3-60 characters</p>
<!-- only when the last submission failed validation -->
```

- Links use the framework's own link component (`<Link>`, `<a>` in Svelte/Astro, `<NuxtLink>` …) with its default prefetch behaviour.
- The counter: clicking increments; text is exactly `Count: N`. It must be a real component with client state, written the way the framework's docs write a counter.
- **Hydration mark**: the counter's documented post-mount hook (React `useEffect`, Svelte `onMount`/`$effect`, Vue `onMounted`, Solid `onMount`, Pyreon `onMount`, Preact `useEffect` in an Astro island) calls `performance.mark('stacks:island-ready')` once. That mark ends the hydration window. Qwik (resumable) has no mount hook that runs without forcing eager JS, so it emits no mark (`"hydration": "resumable"`).

### `/items/:id` (loader → `getItem(Number(id))`)

```html
<h1 id="item-name">Item 7: …</h1>
<p>{description}</p>
<p class="price">$12.34</p>
<a href="/items">Back</a>
```

Unknown id → HTTP **404** (the framework's not-found mechanism).

### The form action (POST)

- Submits to the framework's documented action mechanism (React Router `action`, Next server action, SvelteKit form action, Nuxt server route, Astro action or POST handler, Solid `action`, TanStack server function, Qwik `routeAction$`, zero `defineAction`). It must work with the framework's enhanced (JS) path; it should also work without JS where the framework supports that.
- `validateName(formData.get('name'))`. Invalid → re-render `/items` with `<p id="form-error">` holding the error text. Valid → `addItem(name)` then redirect to `/items/<newId>`.

## Build and serve

- Production build; the framework's own documented Node server/adapter; started by the harness as `node <entry>` in the app dir with env `PORT`, `HOST=127.0.0.1`, `NODE_ENV=production`. The server must listen on `PORT`.
- No response caching, no CDN headers that change server work, no compression added by the arm. The load generator sends no `Accept-Encoding`; a server that compresses anyway is reported.
- SSR mode: render `/items` per request (no SSG/ISR/prerender for `/items` or `/items/:id`).
- Pin exact versions (no `^`/`~`), commit the arm's own `package-lock.json`.

## `stack.json`

See `lib/stacks.ts` → `StackManifest`. Example:

```json
{
  "id": "react-router",
  "label": "React Router 7 (framework mode)",
  "docs": ["https://reactrouter.com/start/framework/data-loading"],
  "packages": ["react-router", "@react-router/serve", "react", "react-dom"],
  "build": ["npm", "run", "build"],
  "start": ["node", "node_modules/@react-router/serve/dist/cli.js", "build/server/index.js"],
  "dataFile": "app/data.ts",
  "hydration": "full",
  "streaming": "streamed (renderToPipeableStream, onAllReady for bots only)",
  "notes": [
    "react-router-serve adds express + compression() middleware; compression only applies when the client sends Accept-Encoding"
  ]
}
```

Check an arm with `bun gate.ts <id>` from `examples/stacks-bench` after `npm ci && npm run build` in the arm.
