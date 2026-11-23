<script setup lang="ts">
import { favouritesLabel } from './data'
import { useCatalogStore } from './stores/catalog'

const catalog = useCatalogStore()
</script>

<template>
  <header>
    <nav>
      <RouterLink id="nav-products" to="/products">Products</RouterLink>
      <RouterLink id="nav-new" to="/products/new">New product</RouterLink>
    </nav>
    <span id="fav-count">{{ favouritesLabel(catalog.favourites.size) }}</span>
  </header>
  <main>
    <RouterView />
  </main>
</template>
