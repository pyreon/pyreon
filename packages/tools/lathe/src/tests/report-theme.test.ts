/**
 * The themed terminal output, snapshotted at every colour level (plain, 16
 * colours, 256 colours, truecolor), on a dark and a light background, and with the ASCII
 * symbol fallback. ESC is shown as `␛` so the escape codes read in review.
 *
 * The plain snapshot is the contract a person reads in a CI log; the coloured
 * ones lock that every state is painted in its palette role and that colour
 * never carries a meaning the words do not (rule 3: NO_COLOR is complete).
 */
import { describe, expect, it } from 'vitest'
import { renderDiffText, renderRun, type ProjectRun, type TermChoice } from '../cli/report'
import { resolveConfig } from '../core/config'
import { contractDiff, readContractSide } from '../core/contract'
import { generate } from '../core/generate'
import type { VerifyReport } from '../verify/lower'

const ESC = String.fromCharCode(27)
const show = (s: string): string => s.split(ESC).join('␛')

const SPEC = (title: string, extra = '') => `openapi: 3.1.0
info: { title: ${title}, version: '2.1.0' }
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
${extra}components:
  schemas:
    Book: { type: object, required: [id], properties: { id: { type: string } } }
`

const webCfg = resolveConfig({ input: 'api.yaml', output: 'src/gen', plugins: ['schemas', 'client'] } as never)
const nativeCfg = resolveConfig({
  input: 'billing.yaml',
  output: 'packages/billing/src/gen',
  target: 'multiplatform',
  plugins: ['client'],
} as never)
const api = generate(SPEC('Catalog'), webCfg)
const billing = generate(
  SPEC('Billing', '  /legacy:\n    get: { tags: [books], responses: { \'200\': { description: ok } } }\n'),
  nativeCfg,
)

const VERIFY: VerifyReport = {
  ran: true,
  files: [
    {
      path: 'books.native.tsx',
      target: 'swift',
      verdict: 'lowers',
      warnings: [],
      markers: ['PyreonQuery<', 'PyreonZodSchema_'],
      leaked: [],
      declarations: [],
      compiled: { ok: true, errors: [] },
    },
    {
      path: 'books.native.tsx',
      target: 'kotlin',
      verdict: 'broken',
      warnings: [
        'Declaration useBooks: useQuery without a response type cannot be lowered to Compose. Give it the shape you expect: useQuery<Book[]>(…) so the decoder has a type to target.',
      ],
      markers: [],
      leaked: ['useQuery('],
      declarations: [],
      compiled: { ok: false, errors: ["unresolved reference 'Book'"] },
    },
  ],
  modules: [{ target: 'kotlin', compiled: { skipped: 'kotlinc not found' } }],
}

const RUNS: ProjectRun[] = [
  {
    result: api,
    verify: { ran: false, reason: 'no native modules were generated (target is `web`)', files: [] },
    stale: [],
    options: {
      name: 'catalog',
      input: 'api.yaml',
      target: 'web',
      output: 'src/gen',
      wrote: 0,
      changed: new Set(),
      created: new Set(),
      changes: [],
      removed: [],
      orphaned: [],
      plugins: webCfg.plugins,
      requestedPlugins: webCfg.requestedPlugins,
    },
  },
  {
    result: billing,
    verify: VERIFY,
    stale: ['client.ts', 'api-surface.json', 'legacy.ts (orphaned: no longer generated)'],
    options: {
      name: 'billing',
      input: 'billing.yaml',
      target: 'multiplatform',
      output: 'packages/billing/src/gen',
      wrote: 0,
      changed: new Set(['client.ts', 'api-surface.json']),
      created: new Set(['api-surface.json']),
      changes: [
        { severity: 'breaking', code: 'operation-removed', subject: 'deleteInvoice', detail: '`DELETE /invoices/:id` no longer exists' },
        { severity: 'additive', code: 'field-added', subject: 'Invoice.dueAt', detail: 'string (optional)' },
        { severity: 'additive', code: 'response-changed', subject: 'getInvoice', detail: 'response gained field dueAt' },
      ],
      removed: [],
      orphaned: ['legacy.ts'],
      plugins: nativeCfg.plugins,
      requestedPlugins: ['client'],
    },
  },
]

const VARIANTS: Array<[string, TermChoice]> = [
  ['plain', { color: 0, unicode: true }],
  ['16 colours', { color: 1, theme: 'dark', unicode: true }],
  ['256 dark', { color: 2, theme: 'dark', unicode: true }],
  ['256 light', { color: 2, theme: 'light', unicode: true }],
  ['truecolor dark', { color: 3, theme: 'dark', unicode: true }],
  ['truecolor light', { color: 3, theme: 'light', unicode: true }],
  ['ascii', { color: 0, unicode: false }],
]

describe('lathe check, themed', () => {
  for (const [name, term] of VARIANTS) {
    it(name, () => {
      const out = renderRun(RUNS, {
        command: 'check',
        dryRun: false,
        code: 1,
        failOnBreaking: false,
        strictNative: () => false,
        elapsedMs: 1840,
        ...term,
      })
      expect(show(out)).toMatchSnapshot()
    })
  }
})

describe('lathe generate, themed', () => {
  it('plain', () => {
    const runs: ProjectRun[] = RUNS.map((r) => ({
      ...r,
      stale: [],
      options: { ...r.options, wrote: r.options.changed?.size ?? 0, removed: r.options.orphaned ?? [], orphaned: [] },
    }))
    const out = renderRun(runs, {
      command: 'generate',
      dryRun: false,
      code: 0,
      failOnBreaking: false,
      strictNative: () => false,
      elapsedMs: 412,
      color: 0,
      unicode: true,
    })
    expect(out).toMatchSnapshot()
  })

  it('dry run, plain', () => {
    const out = renderRun(RUNS, {
      command: 'generate',
      dryRun: true,
      code: 0,
      failOnBreaking: false,
      strictNative: () => false,
      elapsedMs: 380,
      color: 0,
      unicode: true,
    })
    expect(out).toMatchSnapshot()
  })

  it('a --fail-on-breaking failure leads the verdict', () => {
    const out = renderRun(RUNS.slice(1).map((r) => ({ ...r, stale: [] })), {
      command: 'generate',
      dryRun: false,
      code: 1,
      failOnBreaking: true,
      strictNative: () => false,
      color: 0,
      unicode: true,
    })
    expect(out.trimEnd().split('\n').at(-1)).toBe(
      '✗ 1 breaking change (--fail-on-breaking) · everything already current · 1 native file not lowering',
    )
  })
})

describe('lathe diff, themed', () => {
  const before = readContractSide(SPEC('Shop'), 'a.yaml').surface
  const after = readContractSide(
    SPEC('Shop').replace(/ {4}post:[\s\S]*?(?=components:)/, '').replace("properties: { id: { type: string } }", "properties: { id: { type: string }, dueAt: { type: string } }"),
    'b.yaml',
  ).surface
  const diff = contractDiff(before, after)

  for (const [name, term] of VARIANTS) {
    it(name, () => {
      const out = renderDiffText(diff, { before: 'main:openapi.yaml', after: 'openapi.yaml', failOnBreaking: true, elapsedMs: 23, ...term })
      expect(show(out)).toMatchSnapshot()
    })
  }

  it('no change', () => {
    expect(renderDiffText(contractDiff(before, before), { before: 'a', after: 'b', failOnBreaking: false, color: 0, unicode: true })).toBe(
      'lathe diff · a → b\n\n✓ no contract changes\n',
    )
  })
})
