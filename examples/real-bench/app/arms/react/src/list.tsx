import { useMemo } from 'react'
import { Link } from 'react-router'
import { useCatalog, useCatalogDispatch } from './catalog'
import {
  CATEGORIES,
  type Category,
  countLabel,
  favIcon,
  formatPrice,
  formatStock,
  pageCount,
  pageLabel,
  pageSlice,
  selectProducts,
  type SortKey,
  SORT_OPTIONS,
  summarize,
  summaryLabel,
} from './data'

export function ProductList() {
  const { products, filters, page, favourites } = useCatalog()
  const dispatch = useCatalogDispatch()
  const filtered = useMemo(() => selectProducts(products, filters), [products, filters])
  const summary = useMemo(() => summarize(filtered), [filtered])
  const pages = pageCount(filtered.length)
  const rows = pageSlice(filtered, page)

  return (
    <>
      <h1>Products</h1>
      <div id="filters">
        <input
          id="search"
          type="search"
          placeholder="Search products"
          value={filters.query}
          onChange={(e) => dispatch({ type: 'filter', patch: { query: e.target.value } })}
        />
        <select
          id="category"
          value={filters.category}
          onChange={(e) => dispatch({ type: 'filter', patch: { category: e.target.value as Category | '' } })}
        >
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          id="sort"
          value={filters.sort}
          onChange={(e) => dispatch({ type: 'filter', patch: { sort: e.target.value as SortKey } })}
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button id="reset" type="button" onClick={() => dispatch({ type: 'reset' })}>
          Reset
        </button>
      </div>
      <p id="count">{countLabel(filtered.length)}</p>
      <p id="summary">{summaryLabel(summary)}</p>
      <table id="products">
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} data-id={p.id}>
              <td>
                <Link to={`/products/${p.id}`}>{p.name}</Link>
              </td>
              <td>{p.category}</td>
              <td>{formatPrice(p.priceCents)}</td>
              <td>{formatStock(p.stock)}</td>
              <td>
                <button
                  className="fav"
                  type="button"
                  aria-pressed={favourites.has(p.id)}
                  onClick={() => dispatch({ type: 'toggle-favourite', id: p.id })}
                >
                  {favIcon(favourites.has(p.id))}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div id="pager">
        <button id="prev" type="button" disabled={page === 1} onClick={() => dispatch({ type: 'page', page: page - 1 })}>
          Previous
        </button>
        <span id="page">{pageLabel(page, pages)}</span>
        <button
          id="next"
          type="button"
          disabled={page === pages}
          onClick={() => dispatch({ type: 'page', page: page + 1 })}
        >
          Next
        </button>
      </div>
    </>
  )
}
