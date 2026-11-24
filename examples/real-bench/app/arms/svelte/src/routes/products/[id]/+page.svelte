<script lang="ts">
  import { page } from '$app/state'
  import { catalog } from '#lib/catalog.svelte.ts'
  import { favButtonLabel, findProduct, formatPrice, formatRating, formatStock, parseId } from '#lib/data.ts'

  const product = $derived(findProduct(catalog.products, parseId(page.params.id)))
  const on = $derived(product !== undefined && catalog.favourites.has(product.id))
</script>

{#if product}
  <article id="detail">
    <h1 id="detail-name">{product.name}</h1>
    <dl>
      <dt>Category</dt>
      <dd id="detail-category">{product.category}</dd>
      <dt>Price</dt>
      <dd id="detail-price">{formatPrice(product.priceCents)}</dd>
      <dt>Stock</dt>
      <dd id="detail-stock">{formatStock(product.stock)}</dd>
      <dt>Rating</dt>
      <dd id="detail-rating">{formatRating(product.rating)}</dd>
    </dl>
    <button
      id="detail-fav"
      class="fav"
      type="button"
      aria-pressed={String(on)}
      onclick={() => catalog.toggleFavourite(product.id)}
    >
      {favButtonLabel(on)}
    </button>
    <a id="back" href="/products">Back to products</a>
  </article>
{:else}
  <h1 id="not-found">Not found</h1>
{/if}
