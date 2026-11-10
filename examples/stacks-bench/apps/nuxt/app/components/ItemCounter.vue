<!--
  Counter with client state — https://vuejs.org/guide/essentials/reactivity-fundamentals.html
  onMounted — https://vuejs.org/api/composition-api-lifecycle.html#onmounted
-->
<script setup lang="ts">
const count = ref(0)

onMounted(() => {
  performance.mark('stacks:island-ready')
})
</script>

<template>
  <button id="counter" type="button" @click="count++">Count: {{ count }}</button>
</template>
