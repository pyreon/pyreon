import { RouterLink, useRoute } from '@pyreon/router'
import { favButtonLabel, findProduct, formatPrice, formatRating, formatStock, parseId } from './data'
import { NotFound } from './not-found'
import { useCatalog } from './store'

export function ProductDetail() {
  const catalog = useCatalog().store
  const route = useRoute()
  const product = () => findProduct(catalog.products(), parseId(route().params.id))

  return () => {
    const p = product()
    if (!p) return <NotFound />
    const on = () => catalog.favourites().has(p.id)
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
          aria-pressed={String(on())}
          onClick={() => catalog.toggleFavourite(p.id)}
        >
          {favButtonLabel(on())}
        </button>
        <RouterLink id="back" to="/products">
          Back to products
        </RouterLink>
      </article>
    )
  }
}
