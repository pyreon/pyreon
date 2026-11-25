/**
 * `loadTs`: every codemod parses with TypeScript, a peer dependency of
 * `@pyreon/cli` that a project may not have installed. The failure has to
 * name the codemod and say how to fix it, not surface a bare
 * "Cannot find module 'typescript'" from deep inside `pyreon upgrade`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

const missing = vi.hoisted(() => ({ on: false }))

vi.mock('node:module', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:module')>()
  return {
    ...real,
    createRequire: (url: string | URL) => {
      const req = real.createRequire(url)
      return (id: string): unknown => {
        if (missing.on && id === 'typescript') throw new Error("Cannot find module 'typescript'")
        return req(id)
      }
    },
  }
})

const { loadTs } = await import('../codemods/load-ts')
const { routerTabsFunction } = await import('../codemods/router-tabs-function')

afterEach(() => {
  missing.on = false
})

describe('codemod loadTs', () => {
  it('returns the TypeScript compiler API when it is installed', () => {
    const ts = loadTs('any')
    expect(typeof ts.createSourceFile).toBe('function')
  })

  it('names the codemod and the fix when typescript is missing', () => {
    missing.on = true
    expect(() => loadTs('zero-placeholder-color')).toThrow(
      '[Pyreon] codemod zero-placeholder-color needs the `typescript` package. Install it (it is a peer dependency of @pyreon/cli) and re-run `pyreon upgrade`.',
    )
  })

  it('is only reached for a candidate file: a codemod with nothing to parse never needs typescript', () => {
    missing.on = true
    // No `@pyreon/router` import → rejected by the text pre-filter before parsing.
    expect(routerTabsFunction.transform(`createRouter({ tabs: [] })\n`, 'a.ts')).toBeNull()
    // A candidate file does need it, and reports which codemod asked.
    expect(() =>
      routerTabsFunction.transform(`import { createRouter } from '@pyreon/router'\ncreateRouter({ tabs: [] })\n`, 'a.ts'),
    ).toThrow('[Pyreon] codemod router-tabs-function needs the `typescript` package')
  })
})
