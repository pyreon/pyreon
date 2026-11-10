<!--
  /items — data from a Nitro server route through useFetch (SSR, payload forwarded to the client);
  the form posts to a server route with $fetch (event-based) and navigates on success.
  https://nuxt.com/docs/4.x/getting-started/data-fetching
  https://nuxt.com/docs/4.x/api/composables/use-fetch
  https://nuxt.com/docs/4.x/api/utils/dollarfetch
  https://nuxt.com/docs/4.x/api/utils/navigate-to
  https://nuxt.com/docs/4.x/api/components/nuxt-link
-->
<script setup lang="ts">
const { data: items } = await useFetch('/api/items')

const formError = ref<string | null>(null)

async function onSubmit(event: Event) {
  const form = event.currentTarget as HTMLFormElement
  try {
    const item = await $fetch('/api/items', {
      method: 'POST',
      body: new FormData(form),
    })
    await navigateTo(`/items/${item.id}`)
  } catch (error) {
    // $fetch throws on a 4xx; the route's createError message is in `data`.
    formError.value = (error as { data?: { message?: string } }).data?.message ?? 'Request failed'
  }
}
</script>

<template>
  <h1>Items</h1>
  <ItemCounter />
  <ul id="items">
    <li v-for="item in items" :key="item.id">
      <NuxtLink :to="`/items/${item.id}`">{{ item.name }}</NuxtLink>
      {{ ' ' }}<span class="price">{{ item.price }}</span>
    </li>
  </ul>
  <form method="post" action="/api/items" @submit.prevent="onSubmit">
    <input name="name" />
    <button type="submit">Add</button>
  </form>
  <p v-if="formError" id="form-error">{{ formError }}</p>
</template>
