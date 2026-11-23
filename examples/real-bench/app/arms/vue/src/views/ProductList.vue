<script setup lang="ts">
import { computed } from 'vue'
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
} from '../data'
import { useCatalogStore } from '../stores/catalog'

const catalog = useCatalogStore()

const query = computed({
  get: () => catalog.filters.query,
  set: (query: string) => catalog.setFilters({ query }),
})
const category = computed({
  get: () => catalog.filters.category,
  set: (category: Category | '') => catalog.setFilters({ category }),
})
const sort = computed({
  get: () => catalog.filters.sort,
  set: (sort: SortKey) => catalog.setFilters({ sort }),
})
</script>

<template>
  <h1>Products</h1>
  <div id="filters">
    <input id="search" v-model="query" type="search" placeholder="Search products" />
    <select id="category" v-model="category">
      <option value="">All categories</option>
      <option v-for="c in CATEGORIES" :key="c" :value="c">{{ c }}</option>
    </select>
    <select id="sort" v-model="sort">
      <option v-for="o in SORT_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
    </select>
    <button id="reset" type="button" @click="catalog.resetFilters()">Reset</button>
  </div>
  <p id="count">{{ countLabel(catalog.filtered.length) }}</p>
  <p id="summary">{{ summaryLabel(catalog.summary) }}</p>
  <table id="products">
    <tbody>
      <tr v-for="p in catalog.rows" :key="p.id" :data-id="p.id">
        <td>
          <RouterLink :to="`/products/${p.id}`">{{ p.name }}</RouterLink>
        </td>
        <td>{{ p.category }}</td>
        <td>{{ formatPrice(p.priceCents) }}</td>
        <td>{{ formatStock(p.stock) }}</td>
        <td>
          <button
            class="fav"
            type="button"
            :aria-pressed="String(catalog.favourites.has(p.id))"
            @click="catalog.toggleFavourite(p.id)"
          >
            {{ favIcon(catalog.favourites.has(p.id)) }}
          </button>
        </td>
      </tr>
    </tbody>
  </table>
  <div id="pager">
    <button id="prev" type="button" :disabled="catalog.page === 1" @click="catalog.page--">Previous</button>
    <span id="page">{{ pageLabel(catalog.page, catalog.pages) }}</span>
    <button id="next" type="button" :disabled="catalog.page === catalog.pages" @click="catalog.page++">Next</button>
  </div>
</template>
