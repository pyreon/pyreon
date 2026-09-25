// @vitest-environment happy-dom
/**
 * Atlas previews v2, mounted for real against the generated mocks.
 *
 * v1 previewed 3 of Petstore's 8 GETs -- including `loginUser` (it sends a
 * password on open) and `logoutUser` (no body, ends the session) -- skipped
 * the canonical detail view `getPetById` because it takes a path parameter,
 * and rendered every response as a `<pre>` JSON dump. v2 previews every safe
 * read with arguments taken from the spec's examples, and renders a list of
 * records as a table and one record as a description list.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import ts from 'typescript'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { h, type VNodeChild } from '@pyreon/core'
import { QueryClient, QueryClientProvider } from '@pyreon/query'
import { mount } from '@pyreon/runtime-dom'
import { isCredentialOperation, previewOperations } from '../emit/components'
import { loadOpenApi } from '../input/openapi'
import { cleanEmitted, emitToDisk } from './helpers/emit-to-disk'
import { cleanTypecheck, typecheckSpec } from './helpers/typecheck'

const HERE = dirname(fileURLToPath(import.meta.url))
const PETSTORE3 = readFileSync(join(HERE, 'fixtures', 'petstore3.json'), 'utf8')
const PLUGINS = ['schemas', 'client', 'queries', 'mocks', 'faker', 'components', 'atlas'] as const

type Preview = (props: Record<string, unknown>) => VNodeChild

afterAll(() => {
  cleanEmitted('previews-v2')
  cleanTypecheck('previews-v2')
})

const settle = async (): Promise<void> => {
  for (let i = 0; i < 30; i++) await new Promise((r) => setTimeout(r, 0))
}

describe('which operations get a preview', () => {
  const { doc } = loadOpenApi(PETSTORE3)

  it('every safe GET with a JSON body — detail views included, credentials excluded', () => {
    expect(previewOperations(doc).map((o) => o.id)).toEqual([
      'findPetsByStatus',
      'findPetsByTags',
      'getPetById',
      'getInventory',
      'getOrderById',
      'getUserByName',
    ])
  })

  it('recognises credential and session operations by word, not by substring', () => {
    const op = (id: string, path = '/x', params: string[] = []) => ({
      id,
      method: 'GET' as const,
      path,
      tag: 't',
      pathParams: [],
      queryParams: params.map((name) => ({ name, type: { kind: 'string' as const }, required: false })),
      headerParams: [],
      cookieParams: [],
    })
    for (const hit of [op('loginUser'), op('x', '/user/logout'), op('signIn'), op('x', '/x', ['api_key']), op('refreshToken'), op('x', '/x', ['password'])]) {
      expect(isCredentialOperation(hit), hit.id + hit.path).toBe(true)
    }
    for (const miss of [op('listAuthors'), op('getTokenizer'), op('x', '/sessionsummary'), op('x', '/x', ['username'])]) {
      expect(isCredentialOperation(miss), miss.id + miss.path).toBe(false)
    }
  })
})

describe('previews render the data, not a JSON dump', () => {
  it('typecheck against the generated hooks and endpoints', () => {
    const { errors } = typecheckSpec('previews-v2', PETSTORE3, { plugins: [...PLUGINS] })
    expect(errors, errors.join('\n')).toEqual([])
  })

  it('a list is a table, a record a description list, with no password shown', async () => {
    const e = emitToDisk('previews-v2', PETSTORE3, { plugins: [...PLUGINS] })
    expect(e.file('components.tsx')).not.toContain('<pre')
    const mocks = await e.load<{ installMocks: () => void }>('mocks.ts')
    mocks.installMocks()
    // The package's own vitest config has no JSX transform, so compile the
    // generated TSX the way a consumer's build would: the automatic runtime
    // with `@pyreon/core` as the import source.
    const js = ts.transpileModule(e.file('components.tsx'), {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        jsxImportSource: '@pyreon/core',
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        verbatimModuleSyntax: false,
      },
    }).outputText
    writeFileSync(join(e.root, 'components.compiled.js'), js)
    const c = await e.load<Record<string, Preview>>('components.compiled.js')

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const host = document.createElement('div')
    document.body.appendChild(host)
    const render = (preview: Preview, props: Record<string, unknown> = {}): (() => void) =>
      mount(h(QueryClientProvider, { client }, () => h(preview, props)), host)

    // A list of pets → a table whose header is the model's declared fields.
    let dispose = render(c.FindPetsByStatusPreview as Preview)
    await settle()
    const heads = [...host.querySelectorAll('th')].map((th) => th.textContent)
    expect(heads).toEqual(['id', 'name', 'category', 'photoUrls', 'tags', 'status'])
    expect(host.querySelectorAll('tbody tr').length).toBe(2)
    expect(host.querySelector('tbody td:nth-child(2)')?.textContent).toBe('doggie')
    dispose()

    // The detail view needs a path parameter; it requests with a sample id and
    // the mocks answer it.
    dispose = render(c.GetPetByIdPreview as Preview)
    await settle()
    const terms = [...host.querySelectorAll('dt')].map((dt) => dt.textContent)
    expect(terms).toContain('name')
    const nameDd = [...host.querySelectorAll('dt')].find((dt) => dt.textContent === 'name')?.nextElementSibling
    expect(nameDd?.textContent).toBe('doggie')
    dispose()

    // A user record, minus the field a screenshot must never carry.
    dispose = render(c.GetUserByNamePreview as Preview)
    await settle()
    const userTerms = [...host.querySelectorAll('dt')].map((dt) => dt.textContent)
    expect(userTerms).toContain('username')
    expect(userTerms).not.toContain('password')
    dispose()

    // `data` renders a supplied value without requesting it.
    dispose = render(c.GetPetByIdPreview as Preview, { data: { id: 7, name: 'Supplied', photoUrls: [] } })
    await settle()
    expect(host.textContent).toContain('Supplied')
    dispose()

    // The forced states.
    for (const [force, text] of [['loading', 'Loading…'], ['error', 'Request failed.'], ['empty', 'No results.']]) {
      dispose = render(c.FindPetsByStatusPreview as Preview, { force })
      await settle()
      expect(host.textContent).toBe(text)
      dispose()
    }
    host.remove()
  })
})

describe('scenarios', () => {
  it('add a seeded "Data" scenario built from the faker factories', async () => {
    const e = emitToDisk('previews-v2', PETSTORE3, { plugins: [...PLUGINS] })
    const src = e.file('atlas.scenarios.ts')
    expect(src).toContain('seedFaker(1)')
    expect(src).toContain("{ name: 'Data', args: { data: createPet() } }")
    const { scenarios } = await e.load<{ scenarios: Record<string, Array<{ name: string; args: Record<string, unknown> }>> }>(
      'atlas.scenarios.ts',
    )
    expect(Object.keys(scenarios)).toContain('GetPetByIdPreview')
    const data = scenarios.GetPetByIdPreview?.find((s) => s.name === 'Data')?.args.data as { name?: unknown }
    expect(typeof data.name).toBe('string')
  })

  it('fall back to the deterministic sample when faker is not generated', () => {
    const e = emitToDisk('previews-v2', PETSTORE3, { plugins: ['atlas'] })
    const src = e.file('atlas.scenarios.ts')
    expect(src).not.toContain('seedFaker')
    expect(src).toContain("name: 'doggie'")
  })
})
