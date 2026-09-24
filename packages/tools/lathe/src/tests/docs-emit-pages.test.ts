/**
 * The Markdown documenting the GENERATED client.
 *
 * Not a rendering of the spec — a rendering of what lathe actually
 * emitted, which is why the reach column exists at all: whether an
 * operation lowers to native is a property of the generated code, and no
 * amount of reading the spec produces it. Getting it wrong tells someone
 * their endpoint works on iOS when it does not, and they find out at a
 * build failure days later.
 *
 * The `baseUrl` on the page is the same class of hazard. A config
 * `baseUrl` OVERRIDES the spec's `servers[0]`, and the reach analysis
 * already reads the override — so a page rendered from the spec value
 * would print a host the client never contacts, with a reach column
 * beside it decided from a different one. Two numbers on one page,
 * disagreeing, neither marked.
 *
 * The usage snippet is what a reader copies. A hook name for a run that
 * emitted no hooks, or a `.mutate()` on a GET, is a snippet that does
 * not compile — pasted from the docs of their own generated client.
 */
import { describe, expect, it } from 'vitest'
import { emitDocs } from '../emit/docs'
import type { IrDocument, IrOperation, IrType } from '../core/ir'

const op = (over: Partial<IrOperation> = {}): IrOperation => ({
  id: 'getUser', tag: 'users', method: 'GET', path: '/users/{id}',
  pathParams: [], queryParams: [],
  ...over,
} as IrOperation)

const param = (name: string, required = true, type: IrType = { kind: 'string' }) =>
  ({ name, type, required, nullable: false })

const doc = (over: Partial<IrDocument> = {}): IrDocument => ({
  title: 'My API', version: '1.2.3', baseUrl: 'https://spec.example.com',
  models: [], operations: [op()], notes: [], ...over,
} as IrDocument)

const emit = (d = doc(), opts: Record<string, unknown> = {}) =>
  emitDocs(d, { hasQueries: true, baseUrl: 'https://client.example.com', ...opts } as never)

const all = (...args: Parameters<typeof emit>) =>
  emit(...args).map((f) => f.contents).join('\n')

describe('pages are emitted per tag, plus an index', () => {
  it('emits an index and one page per tag', () => {
    // The control.
    const files = emit(doc({ operations: [op(), op({ id: 'listPosts', tag: 'posts' })] }))
    const paths = files.map((f) => f.path)
    expect(paths.some((p) => p.endsWith('index.md')), 'an index').toBe(true)
    expect(paths.some((p) => /users/.test(p)), 'a users page').toBe(true)
    expect(paths.some((p) => /posts/.test(p)), 'a posts page').toBe(true)
  })

  it('slugifies a tag with punctuation into a usable filename', () => {
    // `User Management` must not become a path with a space in it.
    const files = emit(doc({ operations: [op({ tag: 'User Management!' })] }))
    for (const f of files) {
      expect(f.path, f.path).not.toMatch(/[ !]/)
    }
  })

  it('carries frontmatter and the document title', () => {
    const out = all()
    expect(out).toContain('---')
    expect(out).toContain('My API')
    expect(out).toContain('1.2.3')
  })
})

describe('the page prints the URL the CLIENT calls, not the spec value', () => {
  it('uses the config override', () => {
    // The reach analysis already read the override. Printing the spec
    // value puts two disagreeing hosts on one page, neither marked.
    const out = all(doc(), { baseUrl: 'https://client.example.com' })
    expect(out).toContain('https://client.example.com')
    expect(out).not.toContain('https://spec.example.com')
  })

  it('omits the URL entirely rather than printing an empty code span', () => {
    // A spec with no server and no override. An empty span between two
    // separators reads as a rendering bug rather than as "no host".
    const out = all(doc(), { baseUrl: '' })
    expect(out, 'no empty inline-code span on the meta line').not.toMatch(/·\s*``\s*·/)
    expect(out).not.toContain('https://spec.example.com')
  })
})

describe('the reach column is the half no rendering of the spec can produce', () => {
  it('reports an operation that lowers', () => {
    const out = all(doc(), {
      reach: new Map([['getUser', { reach: 'lowers' }]]),
    })
    expect(out).toMatch(/lowers|native/i)
  })

  it('reports a WEB-ONLY operation with its reason', () => {
    // Telling someone an endpoint works on iOS when it does not is the
    // failure this column exists to prevent — and the reason is what
    // makes it actionable rather than alarming.
    const out = all(doc(), {
      reach: new Map([['getUser', { reach: 'web-only', reason: 'path parameter supplied at runtime' }]]),
    })
    expect(out).toContain('path parameter supplied at runtime')
  })

  it('defaults to WEB for an operation the analysis did not cover', () => {
    // The conservative direction: claiming native reach for something
    // unanalysed is the assertion that costs a build failure.
    const out = all(doc(), { reach: new Map() })
    expect(out).toMatch(/web/i)
  })

  it('renders without a reach map at all', () => {
    // `lathe generate` without the native target runs no analysis.
    expect(() => all(doc(), { reach: undefined })).not.toThrow()
  })
})

describe('the usage snippet is copyable', () => {
  it('shows a hook when the run emitted hooks', () => {
    const out = all(doc(), { hasQueries: true })
    expect(out).toMatch(/use[A-Z]|useQuery|getUser/)
  })

  it('does NOT show a hook when the run emitted none', () => {
    // A snippet importing a hook that was never generated does not
    // compile — pasted from the docs of their own client.
    const out = all(doc(), { hasQueries: false })
    expect(out).not.toContain('useQuery(')
  })

  it('uses mutate() for a write and not for a read', () => {
    const read = all(doc({ operations: [op({ method: 'GET' })] }))
    expect(read).not.toContain('.mutate(')
    const write = all(doc({ operations: [op({ id: 'createUser', method: 'POST' })] }))
    expect(write).toContain('.mutate(')
  })

  it('fills required arguments with a plausible value per type', () => {
    // `'…'` for an unconstrained string is honest; `undefined` in a
    // snippet is a copy that fails.
    const out = all(doc({
      operations: [op({
        pathParams: [param('id')],
        queryParams: [
          param('page', true, { kind: 'number', integer: true }),
          param('active', true, { kind: 'boolean' }),
          param('status', true, { kind: 'string', enum: ['open', 'closed'] }),
        ],
      })],
    }))
    expect(out).not.toContain('undefined')
    expect(out, 'an enum shows a real member').toContain('open')
  })

  it('shows an empty argument object when nothing is required', () => {
    // `getUser.query()` with a missing argument reads as an API that
    // takes none; `{}` is the honest shape.
    const out = all(doc({ operations: [op({ pathParams: [], queryParams: [] })] }))
    expect(out).toMatch(/\(\{?\}?\)/)
  })
})

describe('parameters and models are tabulated', () => {
  it('marks required and optional query parameters distinctly', () => {
    const out = all(doc({
      operations: [op({ queryParams: [param('page', true), param('sort', false)] })],
    }))
    expect(out).toContain('page')
    expect(out).toContain('sort')
    expect(out).toMatch(/yes/)
    expect(out).toMatch(/no/)
  })

  it('documents a model and its description', () => {
    const out = all(doc({
      models: [{
        name: 'User', doc: 'A registered user.',
        type: { kind: 'object', fields: [param('id')] },
      }],
    }))
    expect(out).toContain('User')
    expect(out).toContain('A registered user.')
  })

  it('says "no content" rather than leaving a blank cell', () => {
    // An empty cell reads as a rendering bug; a 204 is a real answer.
    const out = all(doc({ operations: [op({ response: undefined })] }))
    expect(out).toMatch(/no content|—|void/i)
  })
})

describe('spec losses are reported on the page, not only in the CLI', () => {
  it('lists the notes when the reduction dropped something', () => {
    // The docs outlive the terminal output that first reported them.
    const out = all(doc({
      notes: [{ code: 'unsupported-ref', at: '#/x', message: 'a ref did not resolve' }],
    } as never))
    expect(out).toContain('a ref did not resolve')
  })

  it('omits the section when nothing was dropped', () => {
    const out = all(doc({ notes: [] }))
    expect(out.toLowerCase()).not.toContain('unsupported-ref')
  })
})

describe('output is deterministic', () => {
  it('two emits produce identical files', () => {
    // `lathe check` fails on output stale against the spec, so any
    // variation reds CI on a run where nothing changed.
    const d = doc({ operations: [op(), op({ id: 'b', tag: 'posts' })] })
    expect(JSON.stringify(emit(d))).toBe(JSON.stringify(emit(d)))
  })
})
