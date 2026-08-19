/**
 * The dbmon row template for the `Vue 3 (template)` arm.
 *
 * Lives in its own module with no imports so `vite.config.ts` can read it at
 * BUILD time and precompile it with `@vue/compiler-dom` — see the
 * `virtual:dbmon-vue-render` plugin there. That is what an SFC does, and doing
 * it any other way measures the wrong thing: Vue's RUNTIME compiler wraps the
 * render body in `with (_ctx) { … }`, a V8 deoptimization barrier that an SFC
 * never emits, and `prefixIdentifiers: true` (which removes it) is rejected by
 * the browser build of the compiler because it needs `@babel/parser`.
 *
 * Structure is byte-equivalent to every other arm in the scenario: one static
 * name cell, one count cell wrapping a `<span>`, then five query cells each
 * carrying a threshold class and elapsed text.
 */
export const DBMON_VUE_TEMPLATE = `
<table><tbody>
  <tr v-for="(sample, i) in tick" :key="i">
    <td class="dbname">{{ names[i] }}</td>
    <td class="query-count"><span :class="sample.countCls">{{ sample.queryCount }}</span></td>
    <td :class="sample.queries[0].cls">{{ sample.queries[0].elapsed }}</td>
    <td :class="sample.queries[1].cls">{{ sample.queries[1].elapsed }}</td>
    <td :class="sample.queries[2].cls">{{ sample.queries[2].elapsed }}</td>
    <td :class="sample.queries[3].cls">{{ sample.queries[3].elapsed }}</td>
    <td :class="sample.queries[4].cls">{{ sample.queries[4].elapsed }}</td>
  </tr>
</tbody></table>`
