<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { favButtonLabel, findProduct, formatPrice, formatRating, formatStock, parseId } from '../data'
import { useCatalogStore } from '../stores/catalog'
import NotFound from './NotFound.vue'

const catalog = useCatalogStore()
const route = useRoute()
const product = computed(() => findProduct(catalog.products, parseId(route.params.id as string)))
const on = computed(() => product.value !== undefined && catalog.favourites.has(product.value.id))
</script>

<template>
  <article v-if="product" id="detail">
    <h1 id="detail-name">{{ product.name }}</h1>
    <dl>
      <dt>Category</dt>
      <dd id="detail-category">{{ product.category }}</dd>
      <dt>Price</dt>
      <dd id="detail-price">{{ formatPrice(product.priceCents) }}</dd>
      <dt>Stock</dt>
      <dd id="detail-stock">{{ formatStock(product.stock) }}</dd>
      <dt>Rating</dt>
      <dd id="detail-rating">{{ formatRating(product.rating) }}</dd>
    </dl>
    <button id="detail-fav" class="fav" type="button" :aria-pressed="String(on)" @click="catalog.toggleFavourite(product.id)">
      {{ favButtonLabel(on) }}
    </button>
    <RouterLink id="back" to="/products">Back to products</RouterLink>
  </article>
  <NotFound v-else />
</template>
