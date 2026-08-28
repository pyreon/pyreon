/**
 * The run report — the surface a person actually reads.
 *
 * Worth testing directly rather than through the CLI, because every branch
 * here is a claim ABOUT the run, and a wrong one is worse than none: a display
 * that marks fourteen files as created above a line saying one was written
 * teaches the reader to stop believing the report.
 *
 * ANSI is stripped before asserting. The colour is real output and worth
 * having, but a test that matches on escape codes breaks when a colour changes
 * and says nothing about whether the sentence is right.
 */
import { describe, expect, it } from 'vitest'
import { renderReport } from '../cli/report'
import { resolveConfig } from '../core/config'
import { generate } from '../core/generate'
import type { SurfaceChange } from '../core/surface'

const SPEC = `openapi: 3.1.0
info: { title: Shelf, version: '2.1.0' }
servers: [{ url: 'https://api.test' }]
paths:
  /books:
    get:
      operationId: listBooks
      tags: [books]
      responses:
        '200': { description: ok, content: { application/json: { schema: { $ref: '#/components/schemas/Book' } } } }
components:
  schemas:
    Book: { type: object, required: [id], properties: { id: { type: string } } }
`

const CONFIG = resolveConfig({ input: 'x.yaml', output: 'gen', plugins: ['schemas', 'client'] } as never)
const RESULT = generate(SPEC, CONFIG)
const NO_VERIFY = { ran: false, files: [] as never[] }

// Built, not written literally — a raw ESC byte in source is invisible in
// review, the same reason `report.ts` builds its own.
const ESC = String.fromCharCode(27)
const SGR = new RegExp(`${ESC}\\[[0-9;]*m`, 'g')
const strip = (s: string): string => s.replace(SGR, '')

const render = (extra: Partial<Parameters<typeof renderReport>[2]> = {}): string =>
  strip(
    renderReport(RESULT, NO_VERIFY as never, {
      target: 'web',
      output: './gen',
      wrote: 0,
      plugins: CONFIG.plugins,
      requestedPlugins: CONFIG.requestedPlugins,
      ...extra,
    }),
  )

describe('the file list says what happened to each file', () => {
  it('marks created, updated and unchanged distinctly', () => {
    const first = RESULT.files[0]?.path as string
    const second = RESULT.files[1]?.path as string
    const out = render({
      wrote: 2,
      changed: new Set([first, second]),
      created: new Set([first]),
    })
    expect(out).toContain(`+ ./gen/${first}`)
    expect(out).toContain(`~ ./gen/${second}`)
    const third = RESULT.files[2]?.path as string
    expect(out).toContain(`· ./gen/${third}`)
  })

  it('names the denominator, so a count cannot contradict the list', () => {
    const out = render({ wrote: 2, changed: new Set([RESULT.files[0]?.path as string]) })
    expect(out).toContain(`2 of ${RESULT.files.length} file(s) written`)
  })

  it('says so when nothing moved', () => {
    expect(render({ wrote: 0, changed: new Set() })).toContain('everything already current')
  })

  it('falls back to the plain count when the caller tracked nothing', () => {
    // `changed` is optional; without it the report cannot claim per-file
    // status, so it does not — rather than guessing "created" for everything.
    const out = render({ wrote: 3 })
    expect(out).toContain('3 file(s) written')
    expect(out).not.toContain(' of ')
  })
})

describe('the contract section', () => {
  const breaking: SurfaceChange = {
    severity: 'breaking',
    code: 'field-removed',
    subject: 'Book.pages',
    detail: 'was integer',
  }
  const additive: SurfaceChange = {
    severity: 'additive',
    code: 'field-added',
    subject: 'Book.isbn',
    detail: 'string',
  }

  it('leads with the breaking count and carries the greppable code', () => {
    const out = render({ changes: [breaking, additive] })
    expect(out).toContain('1 breaking')
    expect(out).toContain('1 additive')
    expect(out).toContain('[field-removed] Book.pages')
    expect(out).toContain('[field-added] Book.isbn')
  })

  it('says explicitly when nothing breaking is present', () => {
    // "0 breaking" as an absence is easy to miss; the words are not.
    expect(render({ changes: [additive] })).toContain('no breaking changes')
  })

  it('is absent entirely when there are no changes', () => {
    expect(render({ changes: [] })).not.toContain('contract')
  })

  it('says it was capped rather than truncating in silence', () => {
    // A capped list that does not announce the cap reads as a complete one,
    // which is how someone concludes their spec change was smaller than it was.
    const many = Array.from({ length: 25 }, (_, i) => ({ ...additive, subject: `Book.f${i}` }))
    const out = render({ changes: many })
    expect(out).toMatch(/and \d+ more/)
    expect(out).toContain('--json')
  })
})

describe('the header', () => {
  it('carries the title, version and counts', () => {
    const out = render()
    expect(out).toContain('Shelf')
    expect(out).toContain('2.1.0')
    expect(out).toContain(`${RESULT.doc.operations.length} operations`)
  })

  it('names a project when one is configured, so a multi-project run reads as a list', () => {
    expect(render({ name: 'storefront' })).toContain('storefront')
  })

  it('explains a plugin the selection did not ask for', () => {
    // A file set larger than the one you selected is confusing exactly once,
    // and only if nobody says why.
    const out = strip(
      renderReport(RESULT, NO_VERIFY as never, {
        target: 'web',
        output: './gen',
        wrote: 0,
        plugins: ['schemas', 'client'],
        requestedPlugins: ['client'],
      }),
    )
    expect(out).toContain('required by them')
  })
})

describe('the multiplatform section', () => {
  // A spec whose operations split: one reaches native, one cannot. That split
  // is the whole point of the section — a report that showed only the total
  // would leave the reader to guess WHICH call stays web.
  const MIXED = `openapi: 3.1.0
info: { title: Shelf, version: '1' }
servers: [{ url: 'https://api.test' }]
paths:
  /books:
    get:
      operationId: listBooks
      tags: [books]
      responses:
        '200': { description: ok, content: { application/json: { schema: { $ref: '#/components/schemas/Book' } } } }
    post:
      operationId: createBook
      tags: [books]
      responses:
        '200': { description: ok, content: { application/json: { schema: { $ref: '#/components/schemas/Book' } } } }
components:
  schemas:
    Book: { type: object, required: [id], properties: { id: { type: string } } }
`
  const nativeCfg = resolveConfig({
    input: 'x.yaml',
    output: 'gen',
    target: 'multiplatform',
    plugins: ['schemas', 'client', 'queries'],
  } as never)
  const nativeResult = generate(MIXED, nativeCfg)

  const renderNative = (verify: unknown): string =>
    strip(
      renderReport(nativeResult, verify as never, {
        target: 'multiplatform',
        output: './gen',
        wrote: 0,
        plugins: nativeCfg.plugins,
        requestedPlugins: nativeCfg.requestedPlugins,
      }),
    )

  it('reports the reach as a fraction and NAMES what stays web', () => {
    const out = renderNative({ ran: false, files: [] })
    expect(out).toMatch(/native reach\s+\d+\/\d+ operations/)
    expect(out).toContain('createBook')
    // ...with the reason, so the reader can act rather than just be informed.
    expect(out).toContain('mutations')
  })

  it('renders a per-file verdict with its positive markers', () => {
    const out = renderNative({
      ran: true,
      files: [
        {
          path: 'books.native.tsx',
          target: 'swift',
          verdict: 'lowers',
          warnings: [],
          markers: ['PyreonQuery<'],
          leaked: [],
        },
      ],
    })
    expect(out).toContain('lowers')
    expect(out).toContain('books.native.tsx')
    expect(out).toContain('PyreonQuery<')
  })

  it('surfaces a warning on a file that did NOT lower', () => {
    const out = renderNative({
      ran: true,
      files: [
        {
          path: 'books.native.tsx',
          target: 'kotlin',
          verdict: 'web-only',
          warnings: ['endpoint getBook: something specific and actionable'],
          markers: [],
          leaked: ['useQuery('],
        },
      ],
    })
    expect(out).toContain('web-only')
    expect(out).toContain('something specific and actionable')
  })

  it('says verification was SKIPPED rather than implying it passed', () => {
    // "we could not check" and "it is fine" are different answers, and a
    // report that renders the first as the second is the dead-gate shape.
    const out = strip(
      renderReport(RESULT, { ran: false, files: [] } as never, {
        target: 'multiplatform',
        output: './gen',
        wrote: 0,
        plugins: CONFIG.plugins,
        requestedPlugins: CONFIG.requestedPlugins,
      }),
    )
    expect(out.toLowerCase()).toContain('skipped')
  })
})

describe('spec notes', () => {
  // A spec that forces the parser to make decisions FOR the author — here a
  // missing `operationId`, which the converter synthesises. Those decisions
  // are the report's job to surface: silently inventing a name is how a
  // generated client ends up with symbols nobody can find in the spec.
  const NOTED = `openapi: 3.1.0
info: { title: Noted, version: '1' }
servers: [{ url: 'https://api.test' }]
paths:
  /a: { get: { tags: [t], responses: { '200': { description: ok } } } }
  /b: { get: { tags: [t], responses: { '200': { description: ok } } } }
  /c: { get: { tags: [t], responses: { '200': { description: ok } } } }
  /d: { get: { tags: [t], responses: { '200': { description: ok } } } }
components: { schemas: {} }
`
  it('lists them with their code, deduped', () => {
    const cfg = resolveConfig({ input: 'x', output: 'gen', plugins: ['client'] } as never)
    const res = generate(NOTED, cfg)
    expect(res.doc.notes.length).toBeGreaterThan(0)
    const out = strip(
      renderReport(res, { ran: false, files: [] } as never, {
        target: 'web',
        output: './gen',
        wrote: 0,
        plugins: cfg.plugins,
        requestedPlugins: cfg.requestedPlugins,
      }),
    )
    expect(out).toContain('spec notes')
    expect(out).toContain('missing-operation-id')
  })
})
