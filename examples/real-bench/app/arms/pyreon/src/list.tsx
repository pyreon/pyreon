import { For } from '@pyreon/core'
import { RouterLink } from '@pyreon/router'
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
import { useCatalog } from './store'

export function ProductList() {
  const catalog = useCatalog().store
  const value = (e: Event) => (e.target as HTMLInputElement | HTMLSelectElement).value

  return (
    <>
      <h1>Products</h1>
      <div id="filters">
        <input
          id="search"
          type="search"
          placeholder="Search products"
          value={catalog.filters().query}
          onInput={(e) => catalog.setFilters({ query: value(e) })}
        />
        <select
          id="category"
          value={catalog.filters().category}
          onChange={(e) => catalog.setFilters({ category: value(e) as Category | '' })}
        >
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option value={c}>{c}</option>
          ))}
        </select>
        <select
          id="sort"
          value={catalog.filters().sort}
          onChange={(e) => catalog.setFilters({ sort: value(e) as SortKey })}
        >
          {SORT_OPTIONS.map((o) => (
            <option value={o.value}>{o.label}</option>
          ))}
        </select>
        <button id="reset" type="button" onClick={() => catalog.resetFilters()}>
          Reset
        </button>
      </div>
      <p id="count">{countLabel(catalog.filtered().length)}</p>
      <p id="summary">{summaryLabel(catalog.summary())}</p>
      <table id="products">
        <tbody>
          <For each={catalog.rows()} by={(p) => p.id}>
            {(p) => (
              <tr data-id={p.id}>
                <td>
                  <RouterLink to={`/products/${p.id}`}>{p.name}</RouterLink>
                </td>
                <td>{p.category}</td>
                <td>{formatPrice(p.priceCents)}</td>
                <td>{formatStock(p.stock)}</td>
                <td>
                  <button
                    class="fav"
                    type="button"
                    aria-pressed={String(catalog.favourites().has(p.id))}
                    onClick={() => catalog.toggleFavourite(p.id)}
                  >
                    {favIcon(catalog.favourites().has(p.id))}
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
          disabled={catalog.page() === 1}
          onClick={() => catalog.page.set(catalog.page() - 1)}
        >
          Previous
        </button>
        <span id="page">{pageLabel(catalog.page(), catalog.pages())}</span>
        <button
          id="next"
          type="button"
          disabled={catalog.page() === catalog.pages()}
          onClick={() => catalog.page.set(catalog.page() + 1)}
        >
          Next
        </button>
      </div>
    </>
  )
}
