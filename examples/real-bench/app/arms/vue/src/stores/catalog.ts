import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  createProducts,
  DEFAULT_FILTERS,
  type Draft,
  draftToProduct,
  type Filters,
  nextProductId,
  pageCount,
  pageSlice,
  type Product,
  selectProducts,
  summarize,
} from '../data'

export const useCatalogStore = defineStore('catalog', () => {
  const products = ref<Product[]>(createProducts())
  const filters = ref<Filters>({ ...DEFAULT_FILTERS })
  const page = ref(1)
  const favourites = ref(new Set<number>())

  const filtered = computed(() => selectProducts(products.value, filters.value))
  const pages = computed(() => pageCount(filtered.value.length))
  const rows = computed(() => pageSlice(filtered.value, page.value))
  const summary = computed(() => summarize(filtered.value))

  function setFilters(patch: Partial<Filters>) {
    filters.value = { ...filters.value, ...patch }
    page.value = 1
  }

  function resetFilters() {
    filters.value = { ...DEFAULT_FILTERS }
    page.value = 1
  }

  function toggleFavourite(id: number) {
    if (favourites.value.has(id)) favourites.value.delete(id)
    else favourites.value.add(id)
  }

  function addProduct(draft: Draft): number {
    const id = nextProductId(products.value)
    products.value.push(draftToProduct(draft, id))
    return id
  }

  return { products, filters, page, favourites, filtered, pages, rows, summary, setFilters, resetFilters, toggleFavourite, addProduct }
})
