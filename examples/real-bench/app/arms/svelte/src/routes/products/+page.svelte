<script lang="ts">
  import { catalog } from '#lib/catalog.svelte.ts'
  import {
    CATEGORIES,
    type Category,
    countLabel,
    favIcon,
    formatPrice,
    formatStock,
    pageLabel,
    type SortKey,
    SORT_OPTIONS,
    summaryLabel,
  } from '#lib/data.ts'
</script>

<h1>Products</h1>
<div id="filters">
  <input
    id="search"
    type="search"
    placeholder="Search products"
    bind:value={() => catalog.filters.query, (query: string) => catalog.setFilters({ query })}
  />
  <select
    id="category"
    bind:value={() => catalog.filters.category, (category: Category | '') => catalog.setFilters({ category })}
  >
    <option value="">All categories</option>
    {#each CATEGORIES as c (c)}
      <option value={c}>{c}</option>
    {/each}
  </select>
  <select id="sort" bind:value={() => catalog.filters.sort, (sort: SortKey) => catalog.setFilters({ sort })}>
    {#each SORT_OPTIONS as o (o.value)}
      <option value={o.value}>{o.label}</option>
    {/each}
  </select>
  <button id="reset" type="button" onclick={() => catalog.resetFilters()}>Reset</button>
</div>
<p id="count">{countLabel(catalog.filtered.length)}</p>
<p id="summary">{summaryLabel(catalog.summary)}</p>
<table id="products">
  <tbody>
    {#each catalog.rows as p (p.id)}
      <tr data-id={p.id}>
        <td><a href="/products/{p.id}">{p.name}</a></td>
        <td>{p.category}</td>
        <td>{formatPrice(p.priceCents)}</td>
        <td>{formatStock(p.stock)}</td>
        <td>
          <button
            class="fav"
            type="button"
            aria-pressed={String(catalog.favourites.has(p.id))}
            onclick={() => catalog.toggleFavourite(p.id)}
          >
            {favIcon(catalog.favourites.has(p.id))}
          </button>
        </td>
      </tr>
    {/each}
  </tbody>
</table>
<div id="pager">
  <button id="prev" type="button" disabled={catalog.page === 1} onclick={() => catalog.page--}>Previous</button>
  <span id="page">{pageLabel(catalog.page, catalog.pages)}</span>
  <button id="next" type="button" disabled={catalog.page === catalog.pages} onclick={() => catalog.page++}>Next</button>
</div>
