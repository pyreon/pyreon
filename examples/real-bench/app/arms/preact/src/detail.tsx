import { useRoute } from 'preact-iso'
import { favButtonLabel, findProduct, formatPrice, formatRating, formatStock, parseId } from './data'
import { NotFound } from './not-found'
import { useAppState } from './state'

export function ProductDetail() {
  const state = useAppState()
  const { params } = useRoute()
  const p = findProduct(state.products.value, parseId(params.id))
  if (!p) return <NotFound />
  const on = state.favourites.value.has(p.id)

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
        class="fav"
        type="button"
        aria-pressed={String(on)}
        onClick={() => state.toggleFavourite(p.id)}
      >
        {favButtonLabel(on)}
      </button>
      <a id="back" href="/products">
        Back to products
      </a>
    </article>
  )
}
