/**
 * Every real `.tsx` file in the repository compiles byte-identically through
 * both backends, in every mode the toolchain uses.
 *
 * The other equivalence gates compile hand-written corpora and seeded fuzz
 * programs, so a divergence that only real code reaches stayed invisible: on
 * main, 7 repo files emitted differently, among them
 * `client={new QueryClient(…)}`, which the native backend wrapped in `_rp` so
 * every props read built a new client. This compiles the whole tracked
 * `.tsx` corpus (docs, examples, packages, tests) the way
 * `@pyreon/vite-plugin` does: the Plain Mode pre-pass first, then the JSX
 * transform, client (with and without `templatizeComponentChildren`), SSR and
 * the `ssrTemplate` fast path. A failure names every differing file and mode
 * with its first differing line.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { transformJSX_JS } from '../jsx'
import { transformPlain } from '../plain'

type NativeTransform = (
  ...args: [string, string, boolean, string[] | null, boolean, undefined, boolean, boolean]
) => { code: string }

const here = dirname(fileURLToPath(import.meta.url))
let nativeTransform: NativeTransform | null = null

try {
  nativeTransform = (
    createRequire(import.meta.url)(join(here, '..', '..', 'native', 'pyreon-compiler.node')) as {
      transformJsx: NativeTransform
    }
  ).transformJsx
} catch {
  // Native addon not built: the gate runs where it is (CI's native lane, any
  // machine after `bun install`).
}

const REPO = join(here, '..', '..', '..', '..', '..')

function trackedTsx(): string[] {
  return execFileSync('git', ['-C', REPO, 'ls-files', '*.tsx'], { encoding: 'utf8' })
    .split('\n')
    .filter((f) => f.length > 0)
}

const MODES = [
  { name: 'client', ssr: false, ssrTemplate: false, tcc: false },
  { name: 'client + templatizeComponentChildren', ssr: false, ssrTemplate: false, tcc: true },
  { name: 'ssr', ssr: true, ssrTemplate: false, tcc: false },
  { name: 'ssrTemplate', ssr: true, ssrTemplate: true, tcc: false },
] as const

describe.runIf(nativeTransform !== null)('every real .tsx file: JS ≡ Rust', () => {
  const files = trackedTsx()
  // The Plain Mode pre-pass runs before either backend (see `transformJSX`).
  const sources = files.map((f) => {
    const raw = readFileSync(join(REPO, f), 'utf8')
    const plained = transformPlain(raw, f, {})

    return { file: f, code: plained ? plained.code : raw }
  })

  it('finds the corpus', () => {
    expect(files.length).toBeGreaterThan(1000)
  })

  for (const mode of MODES) {
    it(mode.name, { timeout: 300_000 }, () => {
      const diffs: string[] = []
      for (const { file, code } of sources) {
        let js: string
        let rs: string
        try {
          js = transformJSX_JS(code, file, {
            ssr: mode.ssr,
            ssrTemplate: mode.ssrTemplate,
            templatizeComponentChildren: mode.tcc,
          }).code
        } catch (err) {
          js = `THROW ${String(err)}`
        }
        try {
          rs = nativeTransform!(code, file, mode.ssr, null, false, undefined, mode.ssrTemplate, mode.tcc).code
        } catch (err) {
          rs = `THROW ${String(err)}`
        }
        if (js === rs) continue
        const jl = js.split('\n')
        const rl = rs.split('\n')
        let i = 0
        while (i < jl.length && jl[i] === rl[i]) i++
        diffs.push(`${file} (line ${i + 1})\n  JS: ${jl[i]?.slice(0, 240)}\n  RS: ${rl[i]?.slice(0, 240)}`)
      }
      expect(diffs, `${diffs.length} file(s) differ:\n${diffs.join('\n')}`).toEqual([])
    })
  }
})
