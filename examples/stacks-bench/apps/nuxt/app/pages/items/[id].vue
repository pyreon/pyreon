<!--
  /items/:id — useFetch from a Nitro server route; 404 via createError in the page.
  https://nuxt.com/docs/4.x/api/composables/use-fetch
  https://nuxt.com/docs/4.x/getting-started/error-handling
  https://nuxt.com/docs/4.x/api/components/nuxt-link
-->
<script setup lang="ts">
const route = useRoute()
const { data: item } = await useFetch(`/api/items/${route.params.id}`)

if (!item.value) {
  throw createError({
    status: 404,
    statusText: 'Item Not Found',
  })
}
</script>

<template>
  <template v-if="item">
    <h1 id="item-name">{{ item.name }}</h1>
    <p>{{ item.description }}</p>
    <p class="price">{{ item.price }}</p>
    <NuxtLink to="/items">Back</NuxtLink>
  </template>
</template>
