/**
 * Asynchronous plugin hooks.
 *
 * A hook may return a promise. `generateAsync()` (what the CLI and the Vite
 * plugin run) awaits it; `generate()` refuses it by name. Every guarantee the
 * synchronous API makes still holds: attribution, immutability, and the
 * determinism double-run -- which must not start the second call before the
 * first has settled.
 */
import { resolveConfig, type LatheSection } from '../core/config'
import { generate, generateAsync } from '../core/generate'
import type { IrDocument } from '../core/ir'
import { definePlugin } from '../core/plugin'
import { SourceFile } from '../emit/writer'
import { parseArgv, run, type Fs } from '../cli/run'
import { CUSTOMIZE_SPEC } from './helpers/customize-spec'

const config = (section: Omit<LatheSection, 'input'> = {}) => resolveConfig({ input: 'spec.json', ...section })
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 1))

/** The same plugin, sync and async: output must not depend on which. */
function pathTable(async: boolean) {
  const files = (doc: IrDocument): SourceFile[] => {
    const f = new SourceFile('extras/paths.ts')
    for (const op of doc.operations) f.line(`export const ${op.id}Path = ${JSON.stringify(op.path)}`)
    return [f]
  }
  const rename = (doc: IrDocument): IrDocument => ({ ...doc, title: `${doc.title} (renamed)` })
  return definePlugin({
    name: async ? 'paths-async' : 'paths-sync',
    ...(async
      ? {
          async setup() {
            await tick()
          },
          async transformDocument(doc: IrDocument) {
            await tick()
            return rename(doc)
          },
          async emit({ doc }: { doc: IrDocument }) {
            await tick()
            return files(doc)
          },
        }
      : { transformDocument: rename, emit: ({ doc }: { doc: IrDocument }) => files(doc) }),
  })
}

describe('async hooks', () => {
  it('generateAsync awaits every hook, and its output is byte-identical to the synchronous run', async () => {
    const sync = generate(CUSTOMIZE_SPEC, config({ plugins: ['schemas', pathTable(false)] }))
    const async = await generateAsync(CUSTOMIZE_SPEC, config({ plugins: ['schemas', pathTable(true)] }))
    // The plugins differ only in name, which appears in nothing generated.
    expect(async.files.map((f) => [f.path, f.contents])).toEqual(sync.files.map((f) => [f.path, f.contents]))
    expect(async.doc.title).toContain('(renamed)')
    expect(async.files.find((f) => f.path === 'extras/paths.ts')?.contents).toContain('getPetByIdPath')
  })

  it('generate() refuses a promise, naming the plugin and the hook, and leaves no unhandled rejection', () => {
    const rejecting = definePlugin({
      name: 'rejects',
      emit: () => Promise.reject(new Error('never observed')),
    })
    expect(() => generate(CUSTOMIZE_SPEC, config({ plugins: ['schemas', pathTable(true)] }))).toThrow(
      'plugin `paths-async` returned a promise from `setup`, and `generate()` is synchronous. Call `generateAsync()`',
    )
    expect(() => generate(CUSTOMIZE_SPEC, config({ plugins: ['schemas', rejecting] }))).toThrow(/plugin `rejects` returned a promise from `emit`/)
  })

  it('a rejection is attributed exactly like a throw', async () => {
    const failing = (hook: 'setup' | 'transformDocument' | 'emit') =>
      definePlugin({
        name: `fails-${hook}`,
        [hook]: async () => {
          await tick()
          throw new Error('boom')
        },
      })
    for (const hook of ['setup', 'transformDocument', 'emit'] as const) {
      await expect(generateAsync(CUSTOMIZE_SPEC, config({ plugins: ['schemas', failing(hook)] }))).rejects.toThrow(
        `plugin \`fails-${hook}\` failed in \`${hook}\`: boom`,
      )
    }
  })

  it('the determinism double-run holds for async hooks, and never overlaps the two calls', async () => {
    let n = 0
    let inFlight = 0
    let overlapped = false
    const counting = definePlugin({
      name: 'counting',
      async emit() {
        inFlight++
        if (inFlight > 1) overlapped = true
        await tick()
        inFlight--
        return [{ path: 'extras/n.ts', contents: `export const n = ${n++}\n` }]
      },
    })
    await expect(generateAsync(CUSTOMIZE_SPEC, config({ plugins: ['schemas', counting] }))).rejects.toThrow(
      /plugin `counting`: `emit` produced different files for the same input/,
    )
    expect(overlapped).toBe(false)

    let t = 0
    const drifting = definePlugin({
      name: 'drifting',
      async transformDocument(doc) {
        await tick()
        return { ...doc, title: `${doc.title} ${t++}` }
      },
    })
    await expect(generateAsync(CUSTOMIZE_SPEC, config({ plugins: ['schemas', drifting] }))).rejects.toThrow(
      /plugin `drifting`: `transformDocument` returned different documents/,
    )
  })

  it('an async transform still receives a frozen document', async () => {
    const mutating = definePlugin({
      name: 'mutates',
      async transformDocument(doc) {
        await tick()
        ;(doc as { title: string }).title = 'x'
        return doc
      },
    })
    await expect(generateAsync(CUSTOMIZE_SPEC, config({ plugins: ['schemas', mutating] }))).rejects.toThrow(
      /plugin `mutates` failed in `transformDocument`.*immutable/,
    )
  })

  it('the CLI runs async plugins (it generates through generateAsync)', async () => {
    const files: Record<string, string> = { 'spec.json': CUSTOMIZE_SPEC }
    const fs: Fs = {
      read: (p) => {
        const v = files[p]
        if (v === undefined) throw new Error(`ENOENT ${p}`)
        return v
      },
      write: (p, c) => {
        files[p] = c
      },
      exists: (p) => p in files,
      mkdirp: () => undefined,
      remove: (p) => {
        delete files[p]
      },
      join: (...parts) => parts.join('/').replace(/\/+/g, '/'),
    }
    const section: LatheSection = { input: 'spec.json', output: 'gen', plugins: ['schemas', pathTable(true)] }
    expect((await run(parseArgv(['generate']), section, fs)).code).toBe(0)
    expect(files['gen/extras/paths.ts']).toContain('getPetByIdPath')
    expect((await run(parseArgv(['check']), section, fs)).code).toBe(0)
  })
})
