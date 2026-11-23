// Shared state as the Svelte docs write it: a class with $state fields and
// $derived values, one instance exported from a .svelte.ts module.
import { SvelteSet } from 'svelte/reactivity'
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

class Catalog {
  products = $state<Product[]>(createProducts())
  filters = $state<Filters>({ ...DEFAULT_FILTERS })
  page = $state(1)
  favourites = new SvelteSet<number>()

  filtered = $derived(selectProducts(this.products, this.filters))
  pages = $derived(pageCount(this.filtered.length))
  rows = $derived(pageSlice(this.filtered, this.page))
  summary = $derived(summarize(this.filtered))

  setFilters(patch: Partial<Filters>) {
    this.filters = { ...this.filters, ...patch }
    this.page = 1
  }

  resetFilters() {
    this.filters = { ...DEFAULT_FILTERS }
    this.page = 1
  }

  toggleFavourite(id: number) {
    if (this.favourites.has(id)) this.favourites.delete(id)
    else this.favourites.add(id)
  }

  addProduct(draft: Draft): number {
    const id = nextProductId(this.products)
    this.products.push(draftToProduct(draft, id))
    return id
  }
}

export const catalog = new Catalog()
