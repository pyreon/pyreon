/**
 * Types for the build-time-compiled Vue render functions.
 *
 * The modules are produced by the `vue-templates` plugin in
 * `vite.config.ts`, which runs `@vue/compiler-dom` in Node with
 * `mode: 'module'` + `@vue/compiler-sfc`'s option set — the same emit
 * `@vue/compiler-sfc` produces for a `<template>` block. Vue's own
 * `compile()` types its output as source text, not as a typed render
 * function, so the shape is declared here.
 */
declare module 'virtual:dbmon-vue-render' {
  /** Compiled `render(_ctx, _cache)` — passed straight to `defineComponent`. */
  export const render: () => unknown
}

/** Compiled row-suite template — see `ROWS_VUE_TEMPLATE` in `vue-templates.ts`. */
declare module 'virtual:rows-vue-render' {
  export const render: () => unknown
}

/** Compiled hydration-fixture template — see `HYDRATION_VUE_TEMPLATE` in `vue-templates.ts`. */
declare module 'virtual:hydration-vue-render' {
  export const render: () => unknown
}

// Scenario templates — see the matching `*_VUE_TEMPLATE` in `vue-templates.ts`.
declare module 'virtual:tree-node-vue-render' {
  export const render: () => unknown
}
declare module 'virtual:tree-root-vue-render' {
  export const render: () => unknown
}
declare module 'virtual:fx-row-vue-render' {
  export const render: () => unknown
}
declare module 'virtual:fx-list-vue-render' {
  export const render: () => unknown
}
declare module 'virtual:memo-app-vue-render' {
  export const render: () => unknown
}
declare module 'virtual:memo-list-vue-render' {
  export const render: () => unknown
}
declare module 'virtual:memo-consumer-vue-render' {
  export const render: () => unknown
}
declare module 'virtual:apppage-vue-render' {
  export const render: () => unknown
}
declare module 'virtual:apppage-section-header-vue-render' {
  export const render: () => unknown
}
declare module 'virtual:apppage-form-row-vue-render' {
  export const render: () => unknown
}
