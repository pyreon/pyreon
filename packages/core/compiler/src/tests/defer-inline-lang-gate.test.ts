import { vi } from 'vitest'

const parseCalls: string[] = []
vi.mock('oxc-parser', async (importOriginal) => {
  const real = await importOriginal<typeof import('oxc-parser')>()
  return {
    ...real,
    parseSync: (filename: string, ...rest: Parameters<typeof real.parseSync> extends [unknown, ...infer R] ? R : never) => {
      parseCalls.push(filename)
      return real.parseSync(filename, ...rest)
    },
  }
})

const { transformDeferInline } = await import('../defer-inline')

const SRC = `import { Defer } from '@pyreon/core'\nimport { Modal } from './m'\nexport const App = () => <Defer when={open}><Modal /></Defer>`

describe('transformDeferInline — language gate', () => {
  beforeEach(() => {
    parseCalls.length = 0
  })

  // A `ts` / `js` parse cannot produce a JSX element, so the rewrite has
  // nothing to match there. Large non-JSX modules that merely mention `Defer`
  // (the compiler's own sources are 150-340KB) must not pay for a full parse.
  for (const file of ['a.ts', 'a.js', 'a.mjs', 'a.mts']) {
    it(`does not parse a ${file} module that mentions Defer`, () => {
      const r = transformDeferInline(SRC, file)
      expect(r).toEqual({ code: SRC, changed: false, warnings: [] })
      expect(parseCalls).toEqual([])
    })
  }

  for (const file of ['a.tsx', 'a.jsx']) {
    it(`still parses and rewrites a ${file} module`, () => {
      expect(transformDeferInline(SRC, file).changed).toBe(true)
      expect(parseCalls).toEqual([file])
    })
  }
})
