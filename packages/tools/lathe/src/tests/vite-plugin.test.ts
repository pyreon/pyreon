/**
 * The Vite plugin, tested through its pure pass rather than by booting Vite.
 *
 * `runPass` takes its root explicitly and RETURNS what it did, so the plugin's
 * behaviour is assertable without a dev server -- the real server is exercised
 * by the bookshelf e2e, which is the layer that can actually prove it.
 */
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lathe, runPass } from '../vite/plugin'

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
    expect(readFileSync(join(root, 'src/gen/schemas.ts'), 'utf8')).toContain('export const Book')
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
    expect(readFileSync(join(root, 'src/a/schemas.ts'), 'utf8')).toContain('export const Book')
    expect(readFileSync(join(root, 'src/b/schemas.ts'), 'utf8')).toContain('export const Book')
  })

  it('THROWS on a stale build when checkOnBuild is set', () => {
    // A build error, not a warning: generated output that disagrees with its
    // spec compiles and then fails against the real server.
    const { root } = project()
    runPass({ ...opts }, root, 'write')
    writeFileSync(join(root, 'src/gen/schemas.ts'), '// hand-edited')
    const plugin = lathe({ ...opts, checkOnBuild: true })
    plugin.configResolved?.({ root, command: 'build' })
    expect(() => plugin.buildStart?.()).toThrow(/stale against the spec/)
  })

  it('WRITES on a build when checkOnBuild is not set', () => {
    const { root } = project()
    const plugin = lathe({ ...opts })
    plugin.configResolved?.({ root, command: 'build' })
    expect(() => plugin.buildStart?.()).not.toThrow()
    expect(readFileSync(join(root, 'src/gen/schemas.ts'), 'utf8')).toContain('export const Book')
  })
})
