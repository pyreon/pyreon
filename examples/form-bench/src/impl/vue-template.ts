/**
 * The vee-validate form's template, compiled at BUILD time by `vite.config.ts`
 * into `virtual:form-vue-render` — never at runtime (the runtime compiler emits
 * `with (_ctx) {…}`, a deopt no SFC ships). `v-model` + `@blur` is the
 * idiomatic SFC shape for `defineField`'s `[model, props]` pair.
 */
export const FORM_VUE_TEMPLATE = `<form><div v-for="f in fields" :key="f.name"><input :data-field="f.name" v-model="f.model.value" @blur="f.props.value.onBlur"><span :data-error="f.name">{{ errors[f.name] ?? '' }}</span></div></form>`

/** `@vue/compiler-sfc`'s template options for a `<script setup>`-less SFC. */
export const VUE_SFC_COMPILE_OPTIONS = {
  mode: 'module',
  prefixIdentifiers: true,
  hoistStatic: true,
  cacheHandlers: true,
} as const
