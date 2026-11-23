import { createRouter, RouterLink, RouterProvider, RouterView } from '@pyreon/router'
import { favouritesLabel } from './data'
import { ProductDetail } from './detail'
import { NewProduct } from './form'
import { ProductList } from './list'
import { NotFound } from './not-found'
import { useCatalog } from './store'

const router = createRouter({
  mode: 'history',
  routes: [
    { path: '/products', component: ProductList },
    { path: '/products/new', component: NewProduct },
    { path: '/products/:id', component: ProductDetail },
    { path: '(.*)', component: NotFound },
  ],
})

export function App() {
  const catalog = useCatalog().store
  return (
    <RouterProvider router={router}>
      <header>
        <nav>
          <RouterLink id="nav-products" to="/products">
            Products
          </RouterLink>
          <RouterLink id="nav-new" to="/products/new">
            New product
          </RouterLink>
        </nav>
        <span id="fav-count">{favouritesLabel(catalog.favourites().size)}</span>
      </header>
      <main>
        <RouterView />
      </main>
    </RouterProvider>
  )
}
