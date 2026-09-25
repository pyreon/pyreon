/**
 * Docs import from where the client actually is (audit H1), snippets show
 * exactly what the types require, and previews exist only for operations a
 * preview can call without inventing input (audit H2).
 */
import { docsImportBase } from '../emit/docs'
import { typecheckSpec } from './helpers/typecheck'
import { cleanEmitted, emitToDisk } from './helpers/emit-to-disk'

const ok = { '200': { description: 'x', content: { 'application/json': { schema: { type: 'object', properties: { a: { type: 'string' } } } } } } }
const SPEC = JSON.stringify({
  openapi: '3.0.3',
  info: { title: 'T', version: '1' },
  servers: [{ url: 'https://api.test' }],
  paths: {
    '/accounts': {
      // Stripe's shape: a GET declaring an (empty) form body.
      get: { operationId: 'listAccounts', tags: ['a'], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: ok },
      // An OPTIONS with a required body cannot be previewed.
      options: { operationId: 'probeAccounts', tags: ['a'], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: ok },
      post: { operationId: 'touchAccounts', tags: ['a'], responses: { '204': { description: 'x' } } },
    },
  },
})

afterAll(() => cleanEmitted('h1'))

describe('docs import base', () => {
  it('is relative to src/ when the output lives under it, else to the root', () => {
    expect(docsImportBase('./src/gen')).toBe('./gen')
    expect(docsImportBase('src/api/client/')).toBe('./api/client')
    expect(docsImportBase('./generated')).toBe('./generated')
    expect(docsImportBase('/abs/out')).toBe('/abs/out')
  })

  it('trims a long run of trailing slashes in linear time', () => {
    expect(docsImportBase(`src/gen${'/'.repeat(100_000)}`)).toBe('./gen')
    expect(docsImportBase('/')).toBe('./')
  })

  it('pages import from the configured output, and a no-input mutation takes no variables', () => {
    const e = emitToDisk('h1', SPEC, { output: './src/api', plugins: ['schemas', 'client', 'queries', 'docs'] })
    const page = e.result.files.find((f) => f.path.startsWith('docs/') && f.path !== 'docs/index.md')?.contents ?? ''
    expect(page).toContain("from './api/queries/a'")
    expect(page).not.toContain("'./gen/")
    expect(page).toContain('touchAccounts.mutate()')
  })
})

describe('previews', () => {
  it('skip a required body, and the components module typechecks', () => {
    const { errors, result } = typecheckSpec('h2', SPEC, { plugins: ['schemas', 'client', 'queries', 'components'] })
    const components = result.files.find((f) => f.path === 'components.tsx')?.contents ?? ''
    // The GET's body is dropped (it cannot be sent), so it IS previewable.
    expect(components).toContain('ListAccountsPreview')
    expect(components).not.toContain('ProbeAccountsPreview')
    expect(errors, errors.join('\n')).toEqual([])
  })
})
