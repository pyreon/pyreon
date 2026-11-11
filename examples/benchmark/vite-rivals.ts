/**
 * Build-time compilation for the rival arms of the `flow`, `table` and
 * `virtual` scenarios (Vue and Solid adapters of the libraries those scenarios
 * compare against).
 *
 *  - `virtual:rival-vue/<name>`   — a Vue template from `RIVAL_VUE_TEMPLATES`,
 *    compiled in Node with the same SFC option set as every other Vue arm
 *    (`VUE_SFC_COMPILE_OPTIONS`), so the browser bundle carries patch flags and
 *    no runtime compiler. Exports `render`.
 *  - `virtual:rival-solid/<name>` — Solid 1.9 JSX from `RIVAL_SOLID_SOURCES`,
 *    compiled by the real `babel-preset-solid@1.9` (`generate: 'dom'`), i.e. the
 *    `_tmpl$()` clones, getter props and `insert` calls a Solid app ships. The
 *    `.tsx` files in this package belong to the Pyreon compiler, which is why
 *    the Solid source lives in strings (the `solid2Plugin` precedent).
 */
import { compile as compileVueTemplate } from '@vue/compiler-dom'
import type { Plugin } from 'vite'
import { RIVAL_SOLID_SOURCES, RIVAL_VUE_TEMPLATES } from './src/impl/rival-sources'
import { VUE_SFC_COMPILE_OPTIONS } from './src/impl/vue-templates'

const VUE = 'virtual:rival-vue/'
const SOLID = 'virtual:rival-solid/'

export function rivalsPlugin(): Plugin {
  return {
    name: 'bench-rivals',
    resolveId(id) {
      return id.startsWith(VUE) || id.startsWith(SOLID) ? `\0${id}` : undefined
    },
    async load(id) {
      if (!id.startsWith('\0')) return undefined
      const bare = id.slice(1)
      if (bare.startsWith(VUE)) {
        const template = RIVAL_VUE_TEMPLATES[bare.slice(VUE.length)]
        if (template === undefined) throw new Error(`[bench-rivals] no Vue template "${bare}"`)
        return compileVueTemplate(template, { mode: 'module', ...VUE_SFC_COMPILE_OPTIONS }).code
      }
      if (bare.startsWith(SOLID)) {
        const source = RIVAL_SOLID_SOURCES[bare.slice(SOLID.length)]
        if (source === undefined) throw new Error(`[bench-rivals] no Solid source "${bare}"`)
        const { transformAsync } = await import('@babel/core')
        const preset = (await import('babel-preset-solid')).default
        const out = await transformAsync(source, {
          filename: `${bare.slice(SOLID.length)}.jsx`,
          presets: [[preset, { generate: 'dom' }]],
          babelrc: false,
          configFile: false,
        })
        return out?.code ?? null
      }
      return undefined
    },
  }
}
