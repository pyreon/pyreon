# The catalogue app every arm implements

Every arm builds the same small client-rendered app: a product catalogue with a filtered, sorted, paginated list, a detail view, a new-product form with validation, client-side routing between them and app-wide state that survives navigation. The correctness gate (`harness/session.ts`, driven by `gate.ts`) checks everything observable below; the rest keeps the work and the bytes comparable.

## The stack each arm uses

Each arm uses its framework's own recommended router and its documented approach to shared state, written the way that framework's docs write it. No arm-specific tuning: no `memo` or manual memoisation an ordinary app would not have, no hand-written compiler output, no virtualisation, no lazy route chunks unless the framework splits by itself. No form or validation library in any arm (validation is the shared `validateDraft`).

| arm      | router                                                  | shared state                                                       |
| -------- | ------------------------------------------------------- | ------------------------------------------------------------------ |
| `pyreon` | `@pyreon/router` (history mode)                         | `@pyreon/store` `defineStore` with signals and computeds           |
| `react`  | `react-router` (declarative mode, `BrowserRouter`)      | `useReducer` + context, derived values with `useMemo`              |
| `vue`    | `vue-router` (`createWebHistory`)                       | Pinia setup store (`ref` + `computed`), SFCs                       |
| `solid`  | `@solidjs/router`                                       | `createStore` + `createSignal` in a context provider, `createMemo` |
| `svelte` | SvelteKit in SPA mode (`adapter-static`, `ssr = false`) | a `$state` class in a `.svelte.ts` module, `$derived`              |
| `preact` | `preact-iso`                                            | `@preact/signals` (`signal` + `computed`)                          |

Each arm's `arm.json` names the exact choice and the docs page it follows.

## Data and shared files

- Copy `shared/data.ts` and `shared/app.css` **verbatim** into the arm (any path; name them in `arm.json` → `dataFile`, `cssFile`). Never edit a copy: `setup.ts` and `gate.ts` refuse an arm whose copy differs (`bun setup.ts --copy-shared` refreshes every copy).
- The catalogue is `createProducts()` (5,000 seeded records), created once at startup in the browser.
- Every derived list goes through `selectProducts(all, filters)`, then `pageSlice(list, page)`; the aggregate is `summarize(list)`. Every visible string comes from a helper in `data.ts` (`countLabel`, `summaryLabel`, `pageLabel`, `favouritesLabel`, `favIcon`, `favButtonLabel`, `formatPrice`, `formatStock`, `formatRating`, `ERRORS`). Never stringify a number in a template yourself.
- `app.css` is imported once by the entry. No other CSS, fonts, images or favicon (an arm whose framework template ships a favicon removes it).

## App-wide state

State that outlives a view lives in the arm's shared state, not in a view:

- `products`: the catalogue, plus every product the form added (appended).
- `filters`: `query`, `category`, `sort` (`DEFAULT_FILTERS` at start) and the current `page` (1 at start).
- `favourites`: the set of favourite product ids (empty at start).

Leaving the list and coming back keeps the filters, the page and the favourites.

## Routes

History-mode URLs. The harness only loads `/products`, `/products/new`, `/products/<id>` and unknown paths; `/` is not part of the contract. The static server answers every path without a file extension with the arm's fallback HTML (`arm.json` → `fallback`).

### Layout (every route)

```html
<header>
  <nav>
    <a id="nav-products" href="/products">Products</a>
    <a id="nav-new" href="/products/new">New product</a>
  </nav>
  <span id="fav-count">Favourites: 0</span>
</header>
<main>…the route's view…</main>
```

Links are the router's own link component (`<Link>`, `<RouterLink>`, `<A>`, `<a>` in SvelteKit and preact-iso), with the router's default prefetch behaviour.

### `/products`: the list

```html
<h1>Products</h1>
<div id="filters">
  <input id="search" type="search" placeholder="Search products" />
  <select id="category">
    <option value="">All categories</option>
    …one option per CATEGORIES entry, value = label…
  </select>
  <select id="sort">
    …one option per SORT_OPTIONS entry…
  </select>
  <button id="reset" type="button">Reset</button>
</div>
<p id="count">412 products</p>
<!-- countLabel(filtered.length) -->
<p id="summary">104857 in stock · average $251.80</p>
<!-- summaryLabel(summarize(filtered)) -->
<table id="products">
  <tbody>
    <tr data-id="17">
      <!-- one per row of pageSlice(filtered, page), in order -->
      <td><a href="/products/17">Amber Lamp 17</a></td>
      <td>Garden</td>
      <td>$12.34</td>
      <!-- formatPrice -->
      <td>120</td>
      <!-- formatStock -->
      <td><button class="fav" type="button" aria-pressed="false">☆</button></td>
    </tr>
  </tbody>
</table>
<div id="pager">
  <button id="prev" type="button">Previous</button>
  <!-- disabled on page 1 -->
  <span id="page">Page 1 of 9</span>
  <!-- pageLabel(page, pageCount(filtered.length)) -->
  <button id="next" type="button">Next</button>
  <!-- disabled on the last page -->
</div>
```

- The inputs are controlled by the shared state: they show the current filters when the view is re-entered.
- `#search` updates `query` on every `input` event. `#category` and `#sort` update on `change`. Any filter change sets `page` to 1.
- `#reset` restores `DEFAULT_FILTERS` and page 1 (favourites are kept).
- A row's `.fav` toggles that id in `favourites`; its text is `favIcon(on)` and `aria-pressed` is `"true"`/`"false"`.
- With no match: `#count` is `0 products`, the `<tbody>` is empty, `#page` is `Page 1 of 1`.

### `/products/:id`: the detail

```html
<article id="detail">
  <h1 id="detail-name">Amber Lamp 17</h1>
  <dl>
    <dt>Category</dt>
    <dd id="detail-category">Garden</dd>
    <dt>Price</dt>
    <dd id="detail-price">$12.34</dd>
    <dt>Stock</dt>
    <dd id="detail-stock">120</dd>
    <dt>Rating</dt>
    <dd id="detail-rating">4.5 / 5</dd>
    <!-- formatRating -->
  </dl>
  <button id="detail-fav" class="fav" type="button" aria-pressed="false">
    ☆ Add to favourites
  </button>
  <a id="back" href="/products">Back to products</a>
</article>
```

- The id comes from the route param through `parseId`, the record from `findProduct`. No such product → the not-found view below (inside the layout), not a redirect.

### `/products/new`: the form

```html
<h1>New product</h1>
<form id="new-form" novalidate>
  <label>Name <input id="f-name" name="name" /></label>
  <p id="error-name" class="error">Name must be 3-60 characters</p>
  <!-- only while shown, see below -->
  <label
    >Category
    <select id="f-category" name="category">
      <option value="">Choose…</option>
      …CATEGORIES…
    </select></label
  >
  <p id="error-category" class="error">…</p>
  <label>Price <input id="f-price" name="price" inputmode="decimal" /></label>
  <p id="error-price" class="error">…</p>
  <label>Stock <input id="f-stock" name="stock" inputmode="numeric" /></label>
  <p id="error-stock" class="error">…</p>
  <button id="f-submit" type="submit">Create</button>
</form>
```

- The draft is the view's own local state, starting at `EMPTY_DRAFT`. Text inputs update on `input`, the select on `change`.
- No error is shown before the first submit. A submit (the form's `submit` event, default prevented) marks the form submitted. From then on the errors shown are `validateDraft(draft)`, recomputed on every change: an `<p id="error-<field>">` exists exactly while that field has an error.
- A valid submit appends `draftToProduct(draft, nextProductId(products))` to `products` and navigates with the router (push) to `/products/<newId>`.

### Anything else: not found

```html
<h1 id="not-found">Not found</h1>
```

Rendered inside the layout for an unknown path and for a detail URL with no such product.

## Build and serve

- Production build with the framework's own Vite plugin (`npm run build` in the arm, `NODE_ENV=production`), output in `arm.json` → `outDir`, with `arm.json` → `fallback` as the SPA fallback page.
- The harness serves every arm with the same static server (`harness/serve.ts`): brotli or gzip by `Accept-Encoding` (precompressed once at start), cross-origin isolated (COOP/COEP), no caching. No arm configures its own server.
- Exact versions in `package.json` (no `^` or `~`), the arm's own `package-lock.json` committed, installed with `npm ci`. Every version was published at least two weeks before it was pinned.

## `arm.json`

See `harness/arms.ts` → `ArmManifest`. Check an arm with `bun gate.ts <id>` after `bun setup.ts <id>`.
