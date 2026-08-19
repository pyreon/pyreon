import { compile as compileVueTemplate } from '@vue/compiler-dom'
import { octane } from '@octanejs/vite-plugin'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import pyreon from '@pyreon/vite-plugin'
import { defineConfig, type Plugin } from 'vite'
import { DBMON_VUE_TEMPLATE } from './src/impl/dbmon-vue-template'

/**
 * Precompiles the dbmon Vue template exactly the way an SFC is compiled:
 * at BUILD time, in Node, with `prefixIdentifiers` on.
 *
 * This exists because the two easier routes both measure something other than
 * Vue. Handing a `template:` string to `vue/dist/vue.esm-bundler.js` invokes
 * the RUNTIME compiler, which emits `with (_ctx) { … }` — a V8 deoptimization
 * barrier no SFC ever produces, and measurably slower than the hand-written
 * `h()` arm it is supposed to represent. Calling `compile()` in the browser
 * with `prefixIdentifiers: true` instead throws Vue compiler error 48, because
 * identifier prefixing needs `@babel/parser`, which the browser build omits.
 *
 * Compiling here sidesteps both: `mode: 'module'` emits the same
 * `import { … } from "vue"` + `export function render(…)` pair an SFC does,
 * the browser bundle carries no compiler at all, and no compilation happens
 * inside a timed region.
 */
function dbmonVueTemplatePlugin(): Plugin {
  const VIRTUAL = 'virtual:dbmon-vue-render'
  const RESOLVED = `\0${VIRTUAL}`
  return {
    name: 'dbmon-vue-template',
    resolveId(id) {
      return id === VIRTUAL ? RESOLVED : undefined
    },
    load(id) {
      if (id !== RESOLVED) return undefined
      const { code } = compileVueTemplate(DBMON_VUE_TEMPLATE, {
        mode: 'module',
        prefixIdentifiers: true,
        hoistStatic: true,
      })
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
    dbmonVueTemplatePlugin(),
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
