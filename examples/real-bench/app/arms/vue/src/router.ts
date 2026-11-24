import { createRouter, createWebHistory } from 'vue-router'
import NewProduct from './views/NewProduct.vue'
import NotFound from './views/NotFound.vue'
import ProductDetail from './views/ProductDetail.vue'
import ProductList from './views/ProductList.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/products', component: ProductList },
    { path: '/products/new', component: NewProduct },
    { path: '/products/:id', component: ProductDetail },
    { path: '/:pathMatch(.*)*', component: NotFound },
  ],
})
