<script setup lang="ts">
interface Layer {
	name: string;
	support: ("full" | "partial" | "none")[];
}

defineProps<{
	features: string[];
	layers: Layer[];
}>();

const icons: Record<string, string> = {
	full: "\u2713",
	partial: "~",
	none: "\u2014",
};
</script>

<template>
  <div class="compat-matrix">
    <table>
      <thead>
        <tr>
          <th>Feature</th>
          <th v-for="layer in layers" :key="layer.name">{{ layer.name }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(feature, i) in features" :key="feature">
          <td>{{ feature }}</td>
          <td v-for="layer in layers" :key="layer.name" class="support-cell">
            <span :class="'support-' + layer.support[i]">
              {{ icons[layer.support[i]] }}
            </span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.compat-matrix {
  margin: 16px 0;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  overflow: hidden;
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
th, td {
  padding: 10px 16px;
  text-align: left;
}
tbody tr:not(:last-child) {
  border-bottom: 1px solid var(--vp-c-divider);
}
.support-cell {
  text-align: center;
  font-weight: 600;
}
.support-full {
  color: var(--vp-c-green-1);
}
.support-partial {
  color: var(--vp-c-yellow-1);
}
.support-none {
  color: var(--vp-c-text-3);
}
</style>
