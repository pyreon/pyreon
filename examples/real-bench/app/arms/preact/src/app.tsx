import { LocationProvider, Route, Router } from 'preact-iso'
import { favouritesLabel } from './data'
import { ProductDetail } from './detail'
import { NewProduct } from './form'
import { ProductList } from './list'
import { NotFound } from './not-found'
import { AppStateContext, createAppState, useAppState } from './state'

function FavouriteCount() {
  const state = useAppState()
  return <span id="fav-count">{favouritesLabel(state.favourites.value.size)}</span>
}

const state = createAppState()

export function App() {
  return (
    <AppStateContext.Provider value={state}>
      <LocationProvider>
        <header>
          <nav>
            <a id="nav-products" href="/products">
              Products
            </a>
            <a id="nav-new" href="/products/new">
              New product
            </a>
          </nav>
          <FavouriteCount />
        </header>
        <main>
          <Router>
            <Route path="/products" component={ProductList} />
            <Route path="/products/new" component={NewProduct} />
            <Route path="/products/:id" component={ProductDetail} />
            <Route default component={NotFound} />
          </Router>
        </main>
      </LocationProvider>
    </AppStateContext.Provider>
  )
}
