import { A, Route, Router, type RouteSectionProps } from '@solidjs/router'
import { CatalogProvider, useCatalog } from './catalog'
import { favouritesLabel } from './data'
import { ProductDetail } from './detail'
import { NewProduct } from './form'
import { ProductList } from './list'
import { NotFound } from './not-found'

function Layout(props: RouteSectionProps) {
  const catalog = useCatalog()
  return (
    <>
      <header>
        <nav>
          <A id="nav-products" href="/products">
            Products
          </A>
          <A id="nav-new" href="/products/new">
            New product
          </A>
        </nav>
        <span id="fav-count">{favouritesLabel(catalog.favouriteCount())}</span>
      </header>
      <main>{props.children}</main>
    </>
  )
}

export function App() {
  return (
    <CatalogProvider>
      <Router root={Layout}>
        <Route path="/products" component={ProductList} />
        <Route path="/products/new" component={NewProduct} />
        <Route path="/products/:id" component={ProductDetail} />
        <Route path="*404" component={NotFound} />
      </Router>
    </CatalogProvider>
  )
}
