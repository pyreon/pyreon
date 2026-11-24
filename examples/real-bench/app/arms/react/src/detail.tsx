import { Link, useParams } from 'react-router'
import { useCatalog, useCatalogDispatch } from './catalog'
import { favButtonLabel, findProduct, formatPrice, formatRating, formatStock, parseId } from './data'
import { NotFound } from './not-found'

export function ProductDetail() {
  const { id } = useParams()
  const { products, favourites } = useCatalog()
  const dispatch = useCatalogDispatch()
  const p = findProduct(products, parseId(id))
  if (!p) return <NotFound />
  const on = favourites.has(p.id)

  return (
    <article id="detail">
      <h1 id="detail-name">{p.name}</h1>
      <dl>
        <dt>Category</dt>
        <dd id="detail-category">{p.category}</dd>
        <dt>Price</dt>
        <dd id="detail-price">{formatPrice(p.priceCents)}</dd>
        <dt>Stock</dt>
        <dd id="detail-stock">{formatStock(p.stock)}</dd>
        <dt>Rating</dt>
        <dd id="detail-rating">{formatRating(p.rating)}</dd>
      </dl>
      <button
        id="detail-fav"
        className="fav"
        type="button"
        aria-pressed={on}
        onClick={() => dispatch({ type: 'toggle-favourite', id: p.id })}
      >
        {favButtonLabel(on)}
      </button>
      <Link id="back" to="/products">
        Back to products
      </Link>
    </article>
  )
}
