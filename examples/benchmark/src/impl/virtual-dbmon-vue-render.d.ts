/**
 * Type for the build-time-compiled Vue dbmon render function.
 *
 * The module is produced by the `dbmon-vue-template` plugin in
 * `vite.config.ts`, which runs `@vue/compiler-dom` in Node with
 * `mode: 'module'` + `prefixIdentifiers: true` — the same emit
 * `@vue/compiler-sfc` produces for a `<template>` block. Vue's own
 * `compile()` types its output as source text, not as a typed render
 * function, so the shape is declared here.
 */
declare module 'virtual:dbmon-vue-render' {
  /** Compiled `render(_ctx, _cache)` — passed straight to `defineComponent`. */
  export const render: () => unknown
}
