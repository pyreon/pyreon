import { compile as compileVueTemplate } from '@vue/compiler-dom'
import { octane } from '@octanejs/vite-plugin'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import pyreon from '@pyreon/vite-plugin'
import { defineConfig, type Plugin } from 'vite'
import { DBMON_VUE_TEMPLATE } from './src/impl/dbmon-vue-template'
import {
  APPPAGE_FORM_ROW_VUE_TEMPLATE,
  APPPAGE_SECTION_HEADER_VUE_TEMPLATE,
  APPPAGE_VUE_TEMPLATE,
  FX_LIST_VUE_TEMPLATE,
  FX_ROW_VUE_TEMPLATE,
  HYDRATION_VUE_TEMPLATE,
  MEMO_APP_VUE_TEMPLATE,
  MEMO_CONSUMER_VUE_TEMPLATE,
  MEMO_LIST_VUE_TEMPLATE,
  ROWS_VUE_TEMPLATE,
  TREE_NODE_VUE_TEMPLATE,
  TREE_ROOT_VUE_TEMPLATE,
  VUE_SFC_COMPILE_OPTIONS,
} from './src/impl/vue-templates'

/**
 * Precompiles every Vue template the benchmark uses exactly the way an SFC is
 * compiled: at BUILD time, in Node, with `@vue/compiler-sfc`'s option set
 * (`VUE_SFC_COMPILE_OPTIONS` — `prefixIdentifiers`, `hoistStatic`,
 * `cacheHandlers`). One virtual module per template:
 *
 *  - `virtual:dbmon-vue-render`     — the dbmon scenario's `Vue 3 (template)` arm
 *  - `virtual:rows-vue-render`      — the row suite (`impl/vue.ts`)
 *  - `virtual:hydration-vue-render` — the hydration fixture's client side
 *  - `virtual:tree-*-vue-render`    — the deep-tree scenario (node + root)
 *  - `virtual:fx-*-vue-render`      — the effect-heavy list (row + list)
 *  - `virtual:memo-*-vue-render`    — the memoization wall (app, list, consumer)
 *  - `virtual:apppage-*-vue-render` — the app-page hydration page (client side)
 *
 * This exists because the two easier routes both measure something other than
 * Vue. Handing a `template:` string to `vue/dist/vue.esm-bundler.js` invokes
 * the RUNTIME compiler, which emits `with (_ctx) { … }` — a V8 deoptimization
 * barrier no SFC ever produces. Calling `compile()` in the browser with
 * `prefixIdentifiers: true` instead throws Vue compiler error 48, because
 * identifier prefixing needs `@babel/parser`, which the browser build omits.
 * And a hand-written `h()` render function (what the row suite used before)
 * carries no patch flags or blocks, so every re-render full-diffs every row —
 * a handicap no Vue app built with its toolchain pays.
 *
 * Compiling here sidesteps all three: `mode: 'module'` emits the same
 * `import { … } from "vue"` + `export function render(…)` pair an SFC does,
 * the browser bundle carries no compiler at all, and no compilation happens
 * inside a timed region.
 */
function vueTemplatesPlugin(): Plugin {
  const templates: Record<string, string> = {
    'virtual:dbmon-vue-render': DBMON_VUE_TEMPLATE,
    'virtual:rows-vue-render': ROWS_VUE_TEMPLATE,
    'virtual:hydration-vue-render': HYDRATION_VUE_TEMPLATE,
    'virtual:tree-node-vue-render': TREE_NODE_VUE_TEMPLATE,
    'virtual:tree-root-vue-render': TREE_ROOT_VUE_TEMPLATE,
    'virtual:fx-row-vue-render': FX_ROW_VUE_TEMPLATE,
    'virtual:fx-list-vue-render': FX_LIST_VUE_TEMPLATE,
    'virtual:memo-app-vue-render': MEMO_APP_VUE_TEMPLATE,
    'virtual:memo-list-vue-render': MEMO_LIST_VUE_TEMPLATE,
    'virtual:memo-consumer-vue-render': MEMO_CONSUMER_VUE_TEMPLATE,
    'virtual:apppage-vue-render': APPPAGE_VUE_TEMPLATE,
    'virtual:apppage-section-header-vue-render': APPPAGE_SECTION_HEADER_VUE_TEMPLATE,
    'virtual:apppage-form-row-vue-render': APPPAGE_FORM_ROW_VUE_TEMPLATE,
  }
  return {
    name: 'vue-templates',
    resolveId(id) {
      return id in templates ? `\0${id}` : undefined
    },
    load(id) {
      if (!id.startsWith('\0')) return undefined
      const template = templates[id.slice(1)]
      if (template === undefined) return undefined
      const { code } = compileVueTemplate(template, { mode: 'module', ...VUE_SFC_COMPILE_OPTIONS })
      return code
    },
  }
}

// bench-bundle.ts: per-framework isolated production builds — the driver sets
// BENCH_BUNDLE_ENTRY to a keep-reference entry file and this config swaps the
// rollup input (same plugins/minifier for every framework = fair comparison).
const bundleEntry = process.env.BENCH_BUNDLE_ENTRY

// bench-clearprofile.ts: BENCH_PROFILE=1 disables minification so CPU-profile
// callFrames keep their source function names (attribution only — V8 does not
// care about identifier length; never use this build for TIMED numbers).
const profileBuild = process.env.BENCH_PROFILE === '1'

/**
 * Cross-origin isolation headers — LOAD-BEARING for sub-millisecond ops.
 *
 * Chromium clamps `performance.now()` to **100µs** in a non-isolated page
 * (a Spectre mitigation). Several row-list ops cost ~100-200µs, i.e. ONE OR
 * TWO TICKS — at that scale the harness measures which side of a tick
 * boundary the op landed on, not the framework. The tell is a zero-width
 * CI95 sitting next to a large CV: a bootstrap CI over samples that are all
 * the same quantized value reports certainty precisely because it cannot see
 * the spread it quantized away.
 *
 * With COOP `same-origin` + COEP `require-corp` the page becomes
 * `crossOriginIsolated` and Chromium raises the resolution to **5µs** — 20×
 * finer, which puts a 100µs op at ~5% quantization instead of ~100%.
 * Measured on this repo's Playwright Chromium (see `bench-fair.ts`
 * `measureClockQuantum`, which re-verifies it at runtime rather than
 * trusting this comment).
 *
 * `require-corp` is safe here because the built benchmark is entirely
 * same-origin — there is no cross-origin subresource to block.
 *
 * `BENCH_NO_ISOLATION=1` serves the page WITHOUT the headers. That exists for
 * ONE purpose: the control experiment. Isolation changes Chromium's process
 * allocation, so "it cannot affect execution speed" is an assumption until an
 * op far above BOTH clamps (create-1k ~8ms, create-10k ~87ms) is shown to
 * agree in the two modes. Never use it for reported sub-ms numbers.
 */
const ISOLATION_HEADERS =
  process.env.BENCH_NO_ISOLATION === '1'
    ? {}
    : {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      }

export default defineConfig({
  server: { headers: ISOLATION_HEADERS },
  preview: { headers: ISOLATION_HEADERS },
  ...(bundleEntry
    ? { build: { rollupOptions: { input: bundleEntry } } }
    : profileBuild
      ? { build: { minify: false } }
      : {}),
  plugins: [
    vueTemplatesPlugin(),
    pyreon(),
    // Octane — the compiled-React framework (`.tsrx`). `requireDirective: true`
    // is LOAD-BEARING, not a preference: with the default `false`, Octane's
    // ownership gate also claims plain project `.tsx`, which would hijack
    // `impl/pyreon.tsx` (and every other `.tsx` here) away from the Pyreon
    // compiler. With it on, Octane owns `.tsrx` by extension only, and a
    // `.tsx` would need an explicit `@jsxImportSource octane` pragma — so the
    // two compilers coexist with no overlap.
    octane({ requireDirective: true }),
    // Svelte 5 — compiles `.svelte` files to runtime-optimized JS. The
    // benchmark uses this so the Svelte impl matches what real users
    // ship (compiled runes output), the same as Solid (compiled
    // template) and React (production JSX).
    svelte(),
  ],
  resolve: {
    // `browser` first so Svelte 5's mount() resolves to the client
    // build (server build's mount() throws lifecycle_function_unavailable).
    // `bun` is kept for workspace resolution (Pyreon workspace packages
    // expose `./src/index.ts` under the bun condition).
    conditions: ['browser', 'bun'],
  },
})
