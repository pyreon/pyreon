import { BrowserRouter, Link, Route, Routes } from 'react-router'
import { CatalogProvider, useCatalog } from './catalog'
import { favouritesLabel } from './data'
import { ProductDetail } from './detail'
import { NewProduct } from './form'
import { ProductList } from './list'
import { NotFound } from './not-found'

function FavouriteCount() {
  const { favourites } = useCatalog()
  return <span id="fav-count">{favouritesLabel(favourites.size)}</span>
}

export function App() {
  return (
    <BrowserRouter>
      <CatalogProvider>
        <header>
          <nav>
            <Link id="nav-products" to="/products">
              Products
            </Link>
            <Link id="nav-new" to="/products/new">
              New product
            </Link>
          </nav>
          <FavouriteCount />
        </header>
        <main>
          <Routes>
            <Route path="/products" element={<ProductList />} />
            <Route path="/products/new" element={<NewProduct />} />
            <Route path="/products/:id" element={<ProductDetail />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
      </CatalogProvider>
    </BrowserRouter>
  )
}
