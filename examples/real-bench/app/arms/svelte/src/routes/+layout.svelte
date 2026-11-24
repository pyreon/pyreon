<script lang="ts">
  import '#lib/app.css'
  import { catalog } from '#lib/catalog.svelte.ts'
  import { favouritesLabel } from '#lib/data.ts'

  let { children } = $props()
</script>

<header>
  <nav>
    <a id="nav-products" href="/products">Products</a>
    <a id="nav-new" href="/products/new">New product</a>
  </nav>
  <span id="fav-count">{favouritesLabel(catalog.favourites.size)}</span>
</header>
<main>
  {@render children()}
</main>
