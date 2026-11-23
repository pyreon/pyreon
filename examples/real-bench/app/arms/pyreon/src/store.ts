// Shared app state, as the state-management pattern writes it: one store,
// defined at module scope, signals plus computeds.
import { computed, signal } from '@pyreon/reactivity'
import { defineStore } from '@pyreon/store'
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
} from './data'

export const useCatalog = defineStore('catalog', () => {
  const products = signal<Product[]>(createProducts())
  const filters = signal<Filters>(DEFAULT_FILTERS)
  const page = signal(1)
  const favourites = signal<ReadonlySet<number>>(new Set())

  const filtered = computed(() => selectProducts(products(), filters()))
  const pages = computed(() => pageCount(filtered().length))
  const rows = computed(() => pageSlice(filtered(), page()))
  const summary = computed(() => summarize(filtered()))

  function setFilters(patch: Partial<Filters>) {
    filters.set({ ...filters(), ...patch })
    page.set(1)
  }

  function resetFilters() {
    filters.set(DEFAULT_FILTERS)
    page.set(1)
  }

  function toggleFavourite(id: number) {
    const next = new Set(favourites())
    if (next.has(id)) next.delete(id)
    else next.add(id)
    favourites.set(next)
  }

  function addProduct(draft: Draft): number {
    const id = nextProductId(products())
    products.set([...products(), draftToProduct(draft, id)])
    return id
  }

  return {
    products,
    filters,
    page,
    favourites,
    filtered,
    pages,
    rows,
    summary,
    setFilters,
    resetFilters,
    toggleFavourite,
    addProduct,
  }
})
