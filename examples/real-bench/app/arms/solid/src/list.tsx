import { A } from '@solidjs/router'
import { For } from 'solid-js'
import { useCatalog } from './catalog'
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
} from './data'

export function ProductList() {
  const catalog = useCatalog()

  return (
    <>
      <h1>Products</h1>
      <div id="filters">
        <input
          id="search"
          type="search"
          placeholder="Search products"
          value={catalog.state.filters.query}
          onInput={(e) => catalog.setFilters({ query: e.currentTarget.value })}
        />
        <select
          id="category"
          value={catalog.state.filters.category}
          onChange={(e) => catalog.setFilters({ category: e.currentTarget.value as Category | '' })}
        >
          <option value="">All categories</option>
          <For each={CATEGORIES}>{(c) => <option value={c}>{c}</option>}</For>
        </select>
        <select
          id="sort"
          value={catalog.state.filters.sort}
          onChange={(e) => catalog.setFilters({ sort: e.currentTarget.value as SortKey })}
        >
          <For each={SORT_OPTIONS}>{(o) => <option value={o.value}>{o.label}</option>}</For>
        </select>
        <button id="reset" type="button" onClick={() => catalog.resetFilters()}>
          Reset
        </button>
      </div>
      <p id="count">{countLabel(catalog.filtered().length)}</p>
      <p id="summary">{summaryLabel(catalog.summary())}</p>
      <table id="products">
        <tbody>
          <For each={catalog.rows()}>
            {(p) => (
              <tr data-id={p.id}>
                <td>
                  <A href={`/products/${p.id}`}>{p.name}</A>
                </td>
                <td>{p.category}</td>
                <td>{formatPrice(p.priceCents)}</td>
                <td>{formatStock(p.stock)}</td>
                <td>
                  <button
                    class="fav"
                    type="button"
                    aria-pressed={String(catalog.isFavourite(p.id))}
                    onClick={() => catalog.toggleFavourite(p.id)}
                  >
                    {favIcon(catalog.isFavourite(p.id))}
                  </button>
                </td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
      <div id="pager">
        <button
          id="prev"
          type="button"
          disabled={catalog.state.page === 1}
          onClick={() => catalog.setPage(catalog.state.page - 1)}
        >
          Previous
        </button>
        <span id="page">{pageLabel(catalog.state.page, catalog.pages())}</span>
        <button
          id="next"
          type="button"
          disabled={catalog.state.page === catalog.pages()}
          onClick={() => catalog.setPage(catalog.state.page + 1)}
        >
          Next
        </button>
      </div>
    </>
  )
}
