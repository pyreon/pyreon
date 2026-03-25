<script setup lang="ts">
defineProps<{
	version: string;
}>();
</script>

<template>
  <span class="since-badge">{{ version }}+</span>
</template>

<style scoped>
.since-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 12px;
  font-family: var(--vp-font-family-mono);
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
  vertical-align: middle;
}
</style>
