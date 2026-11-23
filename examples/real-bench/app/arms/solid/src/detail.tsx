import { A, useParams } from '@solidjs/router'
import { createMemo, Show } from 'solid-js'
import { useCatalog } from './catalog'
import { favButtonLabel, findProduct, formatPrice, formatRating, formatStock, parseId } from './data'
import { NotFound } from './not-found'

export function ProductDetail() {
  const catalog = useCatalog()
  const params = useParams()
  const product = createMemo(() => findProduct(catalog.products(), parseId(params.id)))

  return (
    <Show when={product()} fallback={<NotFound />}>
      {(p) => (
        <article id="detail">
          <h1 id="detail-name">{p().name}</h1>
          <dl>
            <dt>Category</dt>
            <dd id="detail-category">{p().category}</dd>
            <dt>Price</dt>
            <dd id="detail-price">{formatPrice(p().priceCents)}</dd>
            <dt>Stock</dt>
            <dd id="detail-stock">{formatStock(p().stock)}</dd>
            <dt>Rating</dt>
            <dd id="detail-rating">{formatRating(p().rating)}</dd>
          </dl>
          <button
            id="detail-fav"
            class="fav"
            type="button"
            aria-pressed={String(catalog.isFavourite(p().id))}
            onClick={() => catalog.toggleFavourite(p().id)}
          >
            {favButtonLabel(catalog.isFavourite(p().id))}
          </button>
          <A id="back" href="/products">
            Back to products
          </A>
        </article>
      )}
    </Show>
  )
}
