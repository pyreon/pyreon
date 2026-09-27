import { actionId, transformServerActions } from '../actions-transform'
import { _resetActions, defineAction } from '../actions'

const SRC = `import { defineAction as da } from '@pyreon/zero/actions'
import * as A from '@pyreon/zero/actions'
import { db } from './db'
import { keep } from './keep'

export const createPost = da<{ id: number }>(async (ctx) => {
  return db.save(ctx.json)
})
const deletePost = A.defineAction(async () => db.remove())
export default da(async () => 'd')
export const list = [da(async () => 1), da(async () => 2)]
keep(deletePost)
`

describe('transformServerActions', () => {
  it('returns null for modules without actions', () => {
    expect(transformServerActions('export const x = 1', 'a.ts', 'a.ts', false)).toBeNull()
  })

  it('SERVER: keeps handlers and injects the deterministic id', () => {
    const out = transformServerActions(SRC, 'a.ts', 'src/a.ts', true)!
    expect(out).toContain(`__zeroDefineActionWithId<{ id: number }>("${actionId('src/a.ts', 'createPost')}", async (ctx)`)
    expect(out).toContain(`__zeroDefineActionWithId("${actionId('src/a.ts', 'deletePost')}", async () => db.remove())`)
    expect(out).toContain(`"${actionId('src/a.ts', 'default')}"`)
    expect(out).toContain(`"${actionId('src/a.ts', '$3')}"`)
    expect(out).toContain(`"${actionId('src/a.ts', '$4')}"`)
    expect(out).toContain("import { db } from './db'")
  })

  it('CLIENT: replaces handlers with stubs and prunes handler-only imports', () => {
    const out = transformServerActions(SRC, 'a.ts', 'src/a.ts', false)!
    expect(out).toContain(`__zeroActionStub<{ id: number }>("${actionId('src/a.ts', 'createPost')}")`)
    expect(out).not.toContain('db.save')
    expect(out).not.toContain('db.remove')
    expect(out).not.toContain("from './db'")
    // A binding still referenced outside a handler keeps its import.
    expect(out).toContain("import { keep } from './keep'")
  })

  it('client and server derive identical ids', () => {
    const idsOf = (s: string) => s.match(/action_[0-9a-f]{24}/g)
    expect(idsOf(transformServerActions(SRC, 'a.ts', 'src/a.ts', false)!)).toEqual(
      idsOf(transformServerActions(SRC, 'a.ts', 'src/a.ts', true)!),
    )
  })

  it('preserves every line break (stack traces / sourcemaps stay aligned)', () => {
    const lines = SRC.split('\n').length
    expect(transformServerActions(SRC, 'a.ts', 'src/a.ts', false)!.split('\n').length).toBe(lines)
    expect(transformServerActions(SRC, 'a.ts', 'src/a.ts', true)!.split('\n').length).toBe(lines)
  })

  it('ids differ by module path and by binding', () => {
    expect(actionId('src/a.ts', 'x')).not.toBe(actionId('src/b.ts', 'x'))
    expect(actionId('src/a.ts', 'x')).not.toBe(actionId('src/a.ts', 'y'))
  })
})

describe('defineAction without the plugin', () => {
  const g = globalThis as { window?: unknown }
  afterEach(() => {
    delete g.window
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    _resetActions()
  })

  it('throws in a production browser (its id could never match the server)', () => {
    g.window = {}
    vi.stubEnv('NODE_ENV', 'production')
    expect(() => defineAction(async () => 1)).toThrow(/\[Pyreon\] defineAction\(\) ran in the browser without zero's Vite plugin/)
  })

  it('warns once in a development browser', () => {
    g.window = {}
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    defineAction(async () => 1)
    defineAction(async () => 2)
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('works silently on the server (tests, scripts)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(defineAction(async () => 1).actionId).toMatch(/^action_/)
    expect(warn).not.toHaveBeenCalled()
  })
})
