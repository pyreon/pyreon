<script setup lang="ts">
interface Prop {
  name: string
  type: string
  default?: string
  required?: boolean
  description: string
}

defineProps<{
  title?: string
  props: Prop[]
}>()
</script>

<template>
  <div v-if="props?.length" class="prop-table">
    <div v-if="title" class="prop-table-title">{{ title }}</div>
    <table>
      <thead>
        <tr>
          <th>Prop</th>
          <th>Type</th>
          <th>Default</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="prop in props" :key="prop.name">
          <td>
            <code>{{ prop.name }}</code>
            <span v-if="prop.required" class="required">*</span>
          </td>
          <td><code class="type">{{ prop.type }}</code></td>
          <td>
            <code v-if="prop.default">{{ prop.default }}</code>
            <span v-else class="dash">&mdash;</span>
          </td>
          <td>{{ prop.description }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.prop-table {
  margin: 16px 0;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  overflow: hidden;
}
.prop-table-title {
  padding: 10px 16px;
  font-size: 14px;
  font-weight: 600;
  border-bottom: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-soft);
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}
thead tr {
  border-bottom: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-soft);
}
th {
  padding: 10px 16px;
  text-align: left;
  font-weight: 500;
}
td {
  padding: 10px 16px;
}
tbody tr:not(:last-child) {
  border-bottom: 1px solid var(--vp-c-divider);
}
code {
  font-size: 12px;
}
.type {
  color: var(--vp-c-text-2);
}
.required {
  color: var(--vp-c-red-1);
  margin-left: 4px;
}
.dash {
  color: var(--vp-c-text-3);
}
</style>
