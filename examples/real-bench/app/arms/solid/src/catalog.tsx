// Shared app state, as the Solid docs put global state behind a context:
// a signal for the products array, a store for the rest, memos for derived values.
import { createContext, createMemo, createSignal, type ParentProps, useContext } from 'solid-js'
import { createStore } from 'solid-js/store'
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

function createCatalog() {
  const [products, setProducts] = createSignal<Product[]>(createProducts())
  const [state, setState] = createStore({
    filters: { ...DEFAULT_FILTERS } as Filters,
    page: 1,
    favourites: {} as Record<number, true | undefined>,
  })

  const filtered = createMemo(() => selectProducts(products(), state.filters))
  const pages = createMemo(() => pageCount(filtered().length))
  const rows = createMemo(() => pageSlice(filtered(), state.page))
  const summary = createMemo(() => summarize(filtered()))
  const favouriteCount = createMemo(() => Object.keys(state.favourites).length)

  return {
    products,
    state,
    filtered,
    pages,
    rows,
    summary,
    favouriteCount,
    isFavourite: (id: number) => state.favourites[id] === true,
    setFilters(patch: Partial<Filters>) {
      setState('filters', patch)
      setState('page', 1)
    },
    resetFilters() {
      setState('filters', { ...DEFAULT_FILTERS })
      setState('page', 1)
    },
    setPage(page: number) {
      setState('page', page)
    },
    toggleFavourite(id: number) {
      setState('favourites', id, state.favourites[id] ? undefined : true)
    },
    addProduct(draft: Draft): number {
      const id = nextProductId(products())
      setProducts([...products(), draftToProduct(draft, id)])
      return id
    },
  }
}

type Catalog = ReturnType<typeof createCatalog>

const CatalogContext = createContext<Catalog>()

export function CatalogProvider(props: ParentProps) {
  return <CatalogContext.Provider value={createCatalog()}>{props.children}</CatalogContext.Provider>
}

export function useCatalog(): Catalog {
  return useContext(CatalogContext) as Catalog
}
