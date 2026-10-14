import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
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


/**
 * Vue 3.6 Vapor (release candidate) for the row board — see impl/vue-vapor.ts.
 *
 * `virtual:rows-vue-vapor` is a real `<script setup vapor>` SFC compiled at
 * build time by the RC's `compiler-sfc` in production inline-template mode, the
 * output a Vapor app ships. Its `vue` imports are pointed at
 * `virtual:vue-vapor-runtime`, which re-exports the RC's self-contained
 * `vue.runtime-with-vapor` ESM build, so the stable Vue 3 arm keeps its own
 * copy of Vue and the two cannot mix.
 */
const ROWS_VUE_VAPOR_SFC = `<script setup vapor>
import { ref, shallowRef } from 'vue'
import { publishRowsVapor } from 'virtual:rows-vue-vapor-handles'
const rows = shallowRef([])
const selectedId = ref(null)
publishRowsVapor({ rows, selectedId })
</script>
<template>${ROWS_VUE_TEMPLATE}</template>`

function vueVaporPlugin(): Plugin {
  const RUNTIME = 'virtual:vue-vapor-runtime'
  const ROWS = 'virtual:rows-vue-vapor'
  const HANDLES = 'virtual:rows-vue-vapor-handles'
  return {
    name: 'vue-vapor-rc',
    resolveId(id) {
      if (id === RUNTIME || id === ROWS || id === HANDLES) return `\0${id}`
      return null
    },
    async load(id) {
      if (id === `\0${RUNTIME}`) {
        const path = createRequire(import.meta.url).resolve('vue-rc/dist/vue.runtime-with-vapor.esm-browser.prod.js')
        return `export * from ${JSON.stringify(path)}`
      }
      if (id === `\0${HANDLES}`) {
        return [
          'let waiting = null',
          'let published = null',
          'export function publishRowsVapor(h) { published = h; if (waiting) waiting(h) }',
          'export function onRowsVaporReady(cb) { if (published) cb(published); else waiting = cb }',
        ].join('\n')
      }
      if (id === `\0${ROWS}`) {
        const { parse, compileScript } = await import('vue-rc/compiler-sfc')
        const { descriptor, errors } = parse(ROWS_VUE_VAPOR_SFC, { filename: 'RowsVapor.vue' })
        if (errors.length) throw new Error(`[vue-vapor-rc] ${errors[0]}`)
        const out = compileScript(descriptor, { id: 'rows-vapor', inlineTemplate: true, isProd: true })
        const code = out.content.replace(/from 'vue'/g, `from '${RUNTIME}'`)
        return `${code}\nexport { onRowsVaporReady } from '${HANDLES}'`
      }
      return null
    },
  }
}

/**
 * SolidJS 2.0 (release candidate) for the row board — see impl/solid2.ts.
 *
 * `virtual:solid2-rows` is idiomatic Solid 2 JSX compiled at build time by
 * `babel-preset-solid@2.0.0-rc` (aliased `babel-preset-solid-rc`). Solid 2 is
 * installed as `solid-js-rc` beside the stable 1.9; `@solidjs/web` declares
 * `solid-js` as a peer, so every `solid-js` import made by `@solidjs/web` or by
 * this arm is resolved to the ONE `solid-js-rc` copy. Without that, the
 * renderer and the arm could load different Solid instances and their
 * reactive graphs would never connect.
 */
const SOLID2_ROWS_JSX = `
import { For, createProjection } from 'solid-js'
export function Rows(props) {
  // Keyed selection: only the previous and the new key change, so only those
  // two rows' class effects re-run (Solid 2's replacement for createSelector).
  const selected = createProjection((draft) => {
    const id = props.selectedId()
    if (draft.prev != null) draft[draft.prev] = false
    if (id != null) draft[id] = true
    draft.prev = id
  }, {})
  return (
    <table>
      <tbody>
        <For each={props.rows()}>
          {(row) => (
            <tr class={selected[row.id] ? 'selected' : ''}>
              <td>{row.id}</td>
              <td>{row.label()}</td>
            </tr>
          )}
        </For>
      </tbody>
    </table>
  )
}`

function solid2Plugin(): Plugin {
  const ROWS = 'virtual:solid2-rows'
  const SELF = fileURLToPath(import.meta.url)
  return {
    name: 'solid2-rc',
    // Runs before Vite's resolver, which would otherwise hand @solidjs/web the
    // stable solid-js 1.9 first.
    enforce: 'pre',
    async resolveId(id, importer) {
      if (id === ROWS) return `\0${ROWS}`
      const fromRc =
        importer !== undefined && (importer.includes('/@solidjs/web/') || importer === `\0${ROWS}` || importer.endsWith('/impl/solid2.ts'))
      if (fromRc && (id === 'solid-js' || id.startsWith('solid-js/'))) {
        // Resolve from THIS package, which declares the `solid-js-rc` alias;
        // @solidjs/web's own folder only sees the stable copy.
        return this.resolve(id.replace(/^solid-js/, 'solid-js-rc'), SELF, { skipSelf: true })
      }
      return null
    },
    async load(id) {
      if (id !== `\0${ROWS}`) return null
      const { transformAsync } = await import('@babel/core')
      const preset = (await import('babel-preset-solid-rc')).default
      const out = await transformAsync(SOLID2_ROWS_JSX, {
        filename: 'solid2-rows.jsx',
        presets: [[preset, { generate: 'dom' }]],
        babelrc: false,
        configFile: false,
      })
      return out?.code ?? null
    },
  }
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
    vueVaporPlugin(),
    solid2Plugin(),
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
