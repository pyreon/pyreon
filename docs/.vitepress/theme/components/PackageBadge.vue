<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    name: string
    href?: string
    status?: "stable" | "beta" | "alpha" | "deprecated"
  }>(),
  { status: "stable" },
)

const statusColors: Record<string, string> = {
  stable: "var(--vp-c-green-1)",
  beta: "var(--vp-c-yellow-1)",
  alpha: "var(--vp-c-orange-1)",
  deprecated: "var(--vp-c-red-1)",
}
</script>

<template>
  <component
    :is="href ? 'a' : 'span'"
    :href="href"
    class="package-badge"
  >
    <span class="package-badge-dot" :style="{ backgroundColor: statusColors[props.status] }" />
    <span class="package-badge-name">{{ name }}</span>
    <span class="package-badge-status">{{ status }}</span>
  </component>
</template>

<style scoped>
.package-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: 9999px;
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-soft);
  font-size: 13px;
  line-height: 1.5;
  text-decoration: none;
  color: var(--vp-c-text-1);
  transition: border-color 0.2s;
}
.package-badge:hover {
  border-color: var(--vp-c-brand-1);
}
.package-badge-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}
.package-badge-name {
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
}
.package-badge-status {
  color: var(--vp-c-text-3);
  font-size: 11px;
}
</style>
