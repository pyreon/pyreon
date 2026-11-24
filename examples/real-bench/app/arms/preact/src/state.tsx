// Global state as the Preact signals guide writes it: a factory of signals and
// computeds, created once and shared through context.
import { computed, signal } from '@preact/signals'
import { createContext } from 'preact'
import { useContext } from 'preact/hooks'
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

export function createAppState() {
  const products = signal<Product[]>(createProducts())
  const filters = signal<Filters>(DEFAULT_FILTERS)
  const page = signal(1)
  const favourites = signal<ReadonlySet<number>>(new Set())

  const filtered = computed(() => selectProducts(products.value, filters.value))
  const pages = computed(() => pageCount(filtered.value.length))
  const rows = computed(() => pageSlice(filtered.value, page.value))
  const summary = computed(() => summarize(filtered.value))

  return {
    products,
    filters,
    page,
    favourites,
    filtered,
    pages,
    rows,
    summary,
    setFilters(patch: Partial<Filters>) {
      filters.value = { ...filters.value, ...patch }
      page.value = 1
    },
    resetFilters() {
      filters.value = DEFAULT_FILTERS
      page.value = 1
    },
    toggleFavourite(id: number) {
      const next = new Set(favourites.value)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      favourites.value = next
    },
    addProduct(draft: Draft): number {
      const id = nextProductId(products.value)
      products.value = [...products.value, draftToProduct(draft, id)]
      return id
    },
  }
}

export type AppState = ReturnType<typeof createAppState>

export const AppStateContext = createContext<AppState | null>(null)

export function useAppState(): AppState {
  return useContext(AppStateContext) as AppState
}
