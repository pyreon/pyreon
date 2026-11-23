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
import { useAppState } from './state'

export function ProductList() {
  const state = useAppState()
  const filters = state.filters.value
  const page = state.page.value
  const favourites = state.favourites.value
  const value = (e: Event) => (e.currentTarget as HTMLInputElement | HTMLSelectElement).value

  return (
    <>
      <h1>Products</h1>
      <div id="filters">
        <input
          id="search"
          type="search"
          placeholder="Search products"
          value={filters.query}
          onInput={(e) => state.setFilters({ query: value(e) })}
        />
        <select
          id="category"
          value={filters.category}
          onChange={(e) => state.setFilters({ category: value(e) as Category | '' })}
        >
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select id="sort" value={filters.sort} onChange={(e) => state.setFilters({ sort: value(e) as SortKey })}>
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button id="reset" type="button" onClick={() => state.resetFilters()}>
          Reset
        </button>
      </div>
      <p id="count">{countLabel(state.filtered.value.length)}</p>
      <p id="summary">{summaryLabel(state.summary.value)}</p>
      <table id="products">
        <tbody>
          {state.rows.value.map((p) => (
            <tr key={p.id} data-id={p.id}>
              <td>
                <a href={`/products/${p.id}`}>{p.name}</a>
              </td>
              <td>{p.category}</td>
              <td>{formatPrice(p.priceCents)}</td>
              <td>{formatStock(p.stock)}</td>
              <td>
                <button
                  class="fav"
                  type="button"
                  aria-pressed={String(favourites.has(p.id))}
                  onClick={() => state.toggleFavourite(p.id)}
                >
                  {favIcon(favourites.has(p.id))}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div id="pager">
        <button id="prev" type="button" disabled={page === 1} onClick={() => (state.page.value = page - 1)}>
          Previous
        </button>
        <span id="page">{pageLabel(page, state.pages.value)}</span>
        <button
          id="next"
          type="button"
          disabled={page === state.pages.value}
          onClick={() => (state.page.value = page + 1)}
        >
          Next
        </button>
      </div>
    </>
  )
}
