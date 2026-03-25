<script setup lang="ts">
defineProps<{
  name: string
  type?: "fn" | "component" | "hook" | "type" | "constant" | "property" | "context"
  signature?: string
  description?: string
}>()

const labels: Record<string, { label: string; color: string }> = {
  fn: { label: "fn", color: "var(--vp-c-blue-1)" },
  component: { label: "C", color: "var(--vp-c-green-1)" },
  hook: { label: "H", color: "var(--vp-c-purple-1)" },
  type: { label: "T", color: "var(--vp-c-yellow-1)" },
  constant: { label: "K", color: "var(--vp-c-orange-1)" },
  property: { label: "P", color: "var(--vp-c-indigo-1)" },
  context: { label: "Cx", color: "var(--vp-c-red-1)" },
}
</script>

<template>
  <div class="api-card">
    <div class="api-card-header">
      <span v-if="type" class="api-badge" :style="{ color: labels[type]?.color }">
        {{ labels[type]?.label }}
      </span>
      <code class="api-name">{{ name }}</code>
    </div>
    <div v-if="signature" class="api-signature">
      <code>{{ signature }}</code>
    </div>
    <div v-if="description" class="api-desc">{{ description }}</div>
  </div>
</template>

<style scoped>
.api-card {
  padding: 12px 16px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  margin: 8px 0;
  background: var(--vp-c-bg-soft);
}
.api-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
}
.api-badge {
  font-family: var(--vp-font-family-mono);
  font-size: 11px;
  font-weight: 700;
}
.api-name {
  font-size: 14px;
  font-weight: 600;
}
.api-signature {
  margin-top: 6px;
  font-size: 12px;
  color: var(--vp-c-text-2);
}
.api-desc {
  margin-top: 6px;
  font-size: 13px;
  color: var(--vp-c-text-2);
}
</style>
