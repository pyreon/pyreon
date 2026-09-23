import { svelte } from '@sveltejs/vite-plugin-svelte'
import pyreon from '@pyreon/vite-plugin'
import { compileTemplate } from 'vue/compiler-sfc'
import { defineConfig, type Plugin } from 'vite'
import { FORM_VUE_TEMPLATE, VUE_SFC_COMPILE_OPTIONS } from './src/impl/vue-template'

/**
 * Precompiles the Vue arm's template the way an SFC is compiled — at build
 * time, in Node, via `@vue/compiler-sfc` — into `virtual:form-vue-render`.
 * Same approach and rationale as `examples/benchmark/vite.config.ts`: a
 * hand-written `h()` render function carries no patch flags / blocks, so it
 * full-diffs on every render, which no Vue app built with its toolchain does.
 */
function vueTemplatePlugin(): Plugin {
  const ID = 'virtual:form-vue-render'
  return {
    name: 'form-vue-template',
    resolveId(id) {
      return id === ID ? `\0${ID}` : undefined
    },
    load(id) {
      if (id !== `\0${ID}`) return undefined
      const { code, errors } = compileTemplate({
        source: FORM_VUE_TEMPLATE,
        filename: 'FormBench.vue',
        id: 'form-bench',
        compilerOptions: VUE_SFC_COMPILE_OPTIONS,
      })
      if (errors.length > 0) throw new Error(`[form-bench] Vue template: ${errors.join('; ')}`)
      return code
    },
  }
}

/**
 * Cross-origin isolation — LOAD-BEARING. Chromium clamps `performance.now()` to
 * 100µs in a non-isolated page and raises it to 5µs when isolated. Several
 * cells here are sub-millisecond, i.e. a handful of 100µs ticks. `bench-form.ts`
 * measures the quantum and ABORTS if the page is not isolated (same contract
 * as `examples/benchmark`). The build is fully same-origin, so `require-corp`
 * blocks nothing.
 */
const ISOLATION_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

export default defineConfig({
  server: { headers: ISOLATION_HEADERS },
  preview: { headers: ISOLATION_HEADERS },
  plugins: [
    vueTemplatePlugin(),
    // Pyreon's compiler runs over the Pyreon impl (`.tsx`). No other impl uses
    // JSX: the React-family arms are written as the automatic runtime's
    // `jsx()`/`jsxs()` output, Vue is a build-time-compiled template (above),
    // Solid is babel-preset-solid's emit written out by hand (`template` /
    // `spread` / `insert`). `svelte()` is the only other compiler, scoped to
    // `.svelte`.
    pyreon(),
    svelte(),
  ],
  resolve: {
    // `browser` first so each framework resolves its client build (Svelte 5's
    // mount() throws under the server build); `bun` keeps workspace `@pyreon/*`
    // resolving to `./src/index.ts`.
    conditions: ['browser', 'bun'],
  },
})
