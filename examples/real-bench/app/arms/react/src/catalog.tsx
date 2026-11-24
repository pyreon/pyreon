// Shared app state the way react.dev scales it up: a reducer, and a provider
// that puts the state and the dispatch function in two contexts.
import { createContext, type Dispatch, type ReactNode, useContext, useReducer } from 'react'
import { createProducts, DEFAULT_FILTERS, type Filters, type Product } from './data'

export interface CatalogState {
  products: Product[]
  filters: Filters
  page: number
  favourites: ReadonlySet<number>
}

export type CatalogAction =
  | { type: 'filter'; patch: Partial<Filters> }
  | { type: 'reset' }
  | { type: 'page'; page: number }
  | { type: 'toggle-favourite'; id: number }
  | { type: 'add'; product: Product }

function catalogReducer(state: CatalogState, action: CatalogAction): CatalogState {
  switch (action.type) {
    case 'filter':
      return { ...state, filters: { ...state.filters, ...action.patch }, page: 1 }
    case 'reset':
      return { ...state, filters: DEFAULT_FILTERS, page: 1 }
    case 'page':
      return { ...state, page: action.page }
    case 'toggle-favourite': {
      const favourites = new Set(state.favourites)
      if (favourites.has(action.id)) favourites.delete(action.id)
      else favourites.add(action.id)
      return { ...state, favourites }
    }
    case 'add':
      return { ...state, products: [...state.products, action.product] }
  }
}

function initialState(): CatalogState {
  return { products: createProducts(), filters: DEFAULT_FILTERS, page: 1, favourites: new Set() }
}

const CatalogContext = createContext<CatalogState | null>(null)
const CatalogDispatchContext = createContext<Dispatch<CatalogAction> | null>(null)

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(catalogReducer, undefined, initialState)
  return (
    <CatalogContext value={state}>
      <CatalogDispatchContext value={dispatch}>{children}</CatalogDispatchContext>
    </CatalogContext>
  )
}

export function useCatalog(): CatalogState {
  return useContext(CatalogContext) as CatalogState
}

export function useCatalogDispatch(): Dispatch<CatalogAction> {
  return useContext(CatalogDispatchContext) as Dispatch<CatalogAction>
}
