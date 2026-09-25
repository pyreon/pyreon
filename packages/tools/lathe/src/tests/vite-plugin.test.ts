/**
 * The Vite plugin, tested through its pure pass rather than by booting Vite.
 *
 * `runPass` takes its root explicitly and RETURNS what it did, so the plugin's
 * behaviour is assertable without a dev server -- the real server is exercised
 * by the bookshelf e2e, which is the layer that can actually prove it.
 */
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as gen from '../core/generate'
import { lathe, missingSpecMessage, passSummary, runPass } from '../vite/plugin'
import { vi } from 'vitest'

const SPEC = `
openapi: 3.0.3
info: { title: T, version: '1' }
servers: [{ url: 'https://t.test' }]
paths:
  /books:
    get:
      operationId: listBooks
      tags: [books]
      responses:
        '200':
          content:
            application/json:
              schema: { type: array, items: { $ref: '#/components/schemas/Book' } }
components:
  schemas:
    Book:
      type: object
      required: [id]
      properties: { id: { type: string } }
`

function project(): { root: string; spec: string } {
  const root = mkdtempSync(join(tmpdir(), 'lathe-vite-'))
  mkdirSync(join(root, 'src'), { recursive: true })
  const spec = join(root, 'openapi.yaml')
  writeFileSync(spec, SPEC)
  return { root, spec }
}

const opts = { input: './openapi.yaml', output: './src/gen', plugins: ['schemas'] as const }

describe('lathe vite plugin', () => {
  it('writes the client on the first pass and nothing on the second', () => {
    // Idempotence is what makes the plugin safe to run on every server start:
    // a pass that rewrote unchanged files would touch mtimes and retrigger
    // Vite's own watcher, which is a loop.
    const { root } = project()
    const first = runPass({ ...opts }, root, 'write')
    expect(first.written.length).toBeGreaterThan(0)
    expect(readFileSync(join(root, 'src/gen/schemas/Book.ts'), 'utf8')).toContain('export const Book')
    expect(runPass({ ...opts }, root, 'write').written).toEqual([])
  })

  it('check mode REPORTS staleness and writes nothing', () => {
    const { root } = project()
    runPass({ ...opts }, root, 'write')
    writeFileSync(join(root, 'src/gen/schemas.ts'), '// hand-edited')
    const res = runPass({ ...opts }, root, 'check')
    expect(res.stale.length).toBeGreaterThan(0)
    expect(res.written).toEqual([])
    expect(readFileSync(join(root, 'src/gen/schemas.ts'), 'utf8')).toBe('// hand-edited')
  })

  it('reports the spec paths so the dev server can watch them', () => {
    const { root, spec } = project()
    expect(runPass({ ...opts }, root, 'check').specs).toEqual([spec])
  })

  it('a missing spec is skipped, not a crash', () => {
    // A config can legitimately point at a spec that is not there yet.
    const { root } = project()
    const res = runPass({ ...opts, input: './absent.yaml' }, root, 'check')
    expect(res.written).toEqual([])
    expect(res.stale).toEqual([])
  })

  it('covers every project', () => {
    const { root } = project()
    writeFileSync(join(root, 'second.yaml'), SPEC)
    const res = runPass(
      {
        plugins: ['schemas'],
        projects: [
          { name: 'a', input: './openapi.yaml', output: './src/a' },
          { name: 'b', input: './second.yaml', output: './src/b' },
        ],
      },
      root,
      'write',
    )
    expect(res.specs).toHaveLength(2)
    expect(readFileSync(join(root, 'src/a/schemas/Book.ts'), 'utf8')).toContain('export const Book')
    expect(readFileSync(join(root, 'src/b/schemas/Book.ts'), 'utf8')).toContain('export const Book')
  })

  it('removes a file the previous pass generated and this one does not', () => {
    // The dev server regenerates on every spec save; an orphan left by a
    // dropped tag would keep compiling against endpoints that no longer exist.
    const { root, spec } = project()
    const withClient = { ...opts, plugins: ['schemas', 'client'] as const }
    runPass({ ...withClient, plugins: [...withClient.plugins] }, root, 'write')
    expect(existsSync(join(root, 'src/gen/endpoints/books.ts'))).toBe(true)
    writeFileSync(spec, SPEC.replace('tags: [books]', 'tags: [library]'))
    const res = runPass({ ...withClient, plugins: [...withClient.plugins] }, root, 'write')
    expect(existsSync(join(root, 'src/gen/endpoints/books.ts'))).toBe(false)
    expect(existsSync(join(root, 'src/gen/endpoints/library.ts'))).toBe(true)
    expect(res.removed).toEqual([join(root, 'src/gen/endpoints/books.ts')])
  })

  it('THROWS on a stale build when checkOnBuild is set', async () => {
    // A build error, not a warning: generated output that disagrees with its
    // spec compiles and then fails against the real server.
    const { root } = project()
    runPass({ ...opts }, root, 'write')
    writeFileSync(join(root, 'src/gen/schemas.ts'), '// hand-edited')
    const plugin = lathe({ ...opts, checkOnBuild: true })
    await plugin.configResolved?.({ root, command: 'build' })
    expect(() => plugin.buildStart?.()).toThrow(/stale against the spec/)
  })

  it('WRITES on a build when checkOnBuild is not set', async () => {
    const { root } = project()
    const plugin = lathe({ ...opts })
    await plugin.configResolved?.({ root, command: 'build' })
    expect(() => plugin.buildStart?.()).not.toThrow()
    expect(readFileSync(join(root, 'src/gen/schemas/Book.ts'), 'utf8')).toContain('export const Book')
  })

  it('the dev server generates nothing on start, and one project per spec change', () => {
    // `buildStart` has already generated. A second full pass in
    // `configureServer` only to learn the spec paths doubled every dev start,
    // and a change to one spec used to regenerate every project.
    const { root } = project()
    writeFileSync(join(root, 'second.yaml'), SPEC)
    const plugin = lathe({
      plugins: ['schemas'],
      projects: [
        { name: 'a', input: './openapi.yaml', output: './src/a' },
        { name: 'b', input: './second.yaml', output: './src/b' },
      ],
    })
    plugin.configResolved?.({ root, command: 'serve' })
    const spy = vi.spyOn(gen, 'generate')
    const watched: string[] = []
    let onChange: (path: string) => void = () => {}
    plugin.configureServer?.({
      watcher: { add: (p) => watched.push(p), on: (_e, cb) => (onChange = cb) },
    })
    expect(spy).not.toHaveBeenCalled()
    expect(watched).toEqual([join(root, 'openapi.yaml'), join(root, 'second.yaml')])
    onChange(join(root, 'second.yaml'))
    expect(spy).toHaveBeenCalledTimes(1)
    expect(readFileSync(join(root, 'src/b/schemas/Book.ts'), 'utf8')).toContain('export const Book')
    expect(() => readFileSync(join(root, 'src/a/schemas.ts'), 'utf8')).toThrow()
    spy.mockRestore()
  })
})

describe('a split spec in dev', () => {
  it('watches every file the spec references, and an edit to one regenerates its project', async () => {
    const root = mkdtempSync(join(tmpdir(), 'lathe-vite-split-'))
    mkdirSync(join(root, 'models'))
    writeFileSync(
      join(root, 'openapi.yaml'),
      SPEC.replace("properties: { id: { type: string } }", "properties: { id: { type: string } }\n    Shelf: { $ref: 'models/shelf.yaml' }"),
    )
    const part = join(root, 'models', 'shelf.yaml')
    writeFileSync(part, 'type: object\nproperties: { name: { type: string } }\n')
    const plugin = lathe({ ...opts })
    await plugin.configResolved?.({ root, command: 'serve' })
    const watched: string[] = []
    let onChange: (path: string) => void = () => {}
    plugin.configureServer?.({ watcher: { add: (p) => watched.push(p), on: (_e, cb) => (onChange = cb) } })
    plugin.buildStart?.()
    expect(watched).toContain(part)
    expect(readFileSync(join(root, 'src/gen/schemas/Shelf.ts'), 'utf8')).toContain('name')
    writeFileSync(part, 'type: object\nproperties: { title: { type: string } }\n')
    onChange(part)
    // The regeneration is async-scheduled by the handler; give it a tick.
    await new Promise((r) => setTimeout(r, 50))
    expect(readFileSync(join(root, 'src/gen/schemas/Shelf.ts'), 'utf8')).toContain('title')
  })
})

describe('the plugin reads pyreon.config and says what it did', () => {
  const withConfig = (): string => {
    const { root } = project()
    mkdirSync(join(root, '.git'))
    writeFileSync(
      join(root, 'pyreon.config.ts'),
      "export default { lathe: { input: './openapi.yaml', output: './src/from-config', plugins: ['schemas'] } }\n",
    )
    return root
  }

  it('`lathe()` with NO options generates from the pyreon.config section', async () => {
    // It used to read nothing but its own options, so a project configured
    // for the CLI generated no client at all in `vite dev`.
    const root = withConfig()
    const plugin = lathe()
    await plugin.configResolved?.({ root, command: 'serve' })
    plugin.buildStart?.()
    expect(readFileSync(join(root, 'src/from-config/schemas/Book.ts'), 'utf8')).toContain('export const Book')
  })

  it('options passed to the plugin win over the config, per key', async () => {
    const root = withConfig()
    const plugin = lathe({ output: './src/from-options' })
    await plugin.configResolved?.({ root, command: 'serve' })
    plugin.buildStart?.()
    expect(existsSync(join(root, 'src/from-options/schemas.ts'))).toBe(true)
    expect(existsSync(join(root, 'src/from-config'))).toBe(false)
  })

  it('WARNS on a missing spec and suggests the file that exists', async () => {
    // A typo'd `input` used to boot the dev server with no client and no word.
    const { root } = project()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const plugin = lathe({ ...opts, input: './openapi.yml' })
    await plugin.configResolved?.({ root, command: 'serve' })
    plugin.buildStart?.()
    const said = warn.mock.calls.map((c) => String(c[0])).join('\n')
    warn.mockRestore()
    expect(said).toContain('spec not found')
    expect(said).toContain('Did you mean')
    expect(said).toContain('openapi.yaml')
    expect(missingSpecMessage(join(root, 'nothing-like-it.txt'))).not.toContain('Did you mean')
  })

  it('summarises contract changes and losses rather than a bare file count', () => {
    const { root, spec } = project()
    runPass({ ...opts, plugins: ['schemas', 'client'] }, root, 'write')
    // Removing the operation is a BREAKING change for a client that calls it.
    writeFileSync(spec, SPEC.replace(/paths:[\s\S]*components:/, 'paths: {}\ncomponents:'))
    const lines = passSummary(runPass({ ...opts, plugins: ['schemas', 'client'] }, root, 'write'))
    expect(lines.join('\n')).toMatch(/BREAKING contract change/)
  })

  it('does NOT generate from configureServer -- once at boot, in buildStart', async () => {
    // configureServer runs before buildStart in dev; it used to run a whole
    // generation just to learn the spec paths.
    const { root } = project()
    const plugin = lathe({ ...opts })
    await plugin.configResolved?.({ root, command: 'serve' })
    const added: string[] = []
    plugin.configureServer?.({ watcher: { add: (p) => added.push(p), on: () => undefined } })
    expect(existsSync(join(root, 'src/gen'))).toBe(false)
    expect(added).toEqual([join(root, 'openapi.yaml')])
  })
})
