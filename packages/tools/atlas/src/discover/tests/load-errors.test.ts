import {
  classifyLoadErrors,
  formatBrokenImports,
  formatPluginVirtuals,
  isPluginVirtual,
  specifierFrom,
} from '../load-errors'

// The two real shapes, copied from actual scans.
const VITE = `Failed to load url virtual:zero/routes (resolved id: virtual:zero/routes). Does the file exist?`
const NODE = `Cannot find module 'virtual:zero/routes'`
const REAL_BREAK = `Cannot find module './does-not-exist'`

describe('specifierFrom', () => {
  it('reads the quoted form', () => {
    expect(specifierFrom(NODE)).toBe('virtual:zero/routes')
  })

  it('reads the Vite url form', () => {
    // Different wording for the same failure — and the specifier is the only
    // part that lets one rule classify both.
    expect(specifierFrom(VITE)).toBe('virtual:zero/routes')
  })

  it('reads a "Failed to resolve import" message', () => {
    expect(specifierFrom(`Failed to resolve import "./x" from "y.tsx"`)).toBe('./x')
  })

  it('is undefined for a message that names no specifier', () => {
    expect(specifierFrom('Unexpected token')).toBeUndefined()
  })
})

describe('isPluginVirtual', () => {
  it('recognises the Vite convention', () => {
    expect(isPluginVirtual('virtual:zero/routes')).toBe(true)
  })

  it('recognises the Rollup convention', () => {
    expect(isPluginVirtual('\0some-plugin:id')).toBe(true)
  })

  it('does NOT claim an ordinary relative import', () => {
    // The whole point is separating "correct import Atlas can't run" from
    // "genuinely broken"; over-claiming here would silence real breakage.
    expect(isPluginVirtual('./does-not-exist')).toBe(false)
    expect(isPluginVirtual('@pyreon/core')).toBe(false)
  })

  it('does not treat a package merely CONTAINING the word as virtual', () => {
    expect(isPluginVirtual('my-virtual-list')).toBe(false)
  })

  it('is false when no specifier could be read', () => {
    expect(isPluginVirtual(undefined)).toBe(false)
  })
})

describe('classifyLoadErrors', () => {
  it('splits plugin-provided modules from broken imports', () => {
    const groups = classifyLoadErrors([
      { file: 'src/entry-client.ts', message: VITE },
      { file: 'src/Broken.tsx', message: REAL_BREAK },
    ])
    expect(groups.map((g) => g.kind)).toEqual(['broken-import', 'plugin-virtual'])
  })

  it('puts the ACTIONABLE kind first', () => {
    // A reader scanning the output should hit the fixable thing first.
    const groups = classifyLoadErrors([
      { file: 'a.ts', message: VITE },
      { file: 'b.ts', message: VITE },
      { file: 'c.tsx', message: REAL_BREAK },
    ])
    expect(groups[0]?.kind).toBe('broken-import')
  })

  it('groups identical messages and counts the files', () => {
    // One broken import upstream throws the same error in every file that
    // reaches it: the cause is the finding, the count is how bad it is.
    const groups = classifyLoadErrors([
      { file: 'src/entry-client.ts', message: NODE },
      { file: 'src/entry-server.ts', message: NODE },
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0]?.files).toEqual(['src/entry-client.ts', 'src/entry-server.ts'])
  })

  it('orders by file count within a kind, so the widest cause leads', () => {
    const groups = classifyLoadErrors([
      { file: 'a.tsx', message: `Cannot find module './rare'` },
      { file: 'b.tsx', message: `Cannot find module './common'` },
      { file: 'c.tsx', message: `Cannot find module './common'` },
    ])
    expect(groups[0]?.files).toHaveLength(2)
  })
})

describe('formatBrokenImports', () => {
  it('keeps the actionable advice for a real breakage', () => {
    const lines = formatBrokenImports(classifyLoadErrors([{ file: 'a.tsx', message: REAL_BREAK }]))
    expect(lines.join('\n')).toContain('fix the import')
  })

  it('says nothing when every failure was plugin-provided', () => {
    // The regression: "fix the import" printed for a correct import is a search
    // that ends in confusion, on every scan.
    expect(formatBrokenImports(classifyLoadErrors([{ file: 'a.ts', message: VITE }]))).toEqual([])
  })
})

describe('formatPluginVirtuals', () => {
  it('names the module and says there is nothing to fix', () => {
    const lines = formatPluginVirtuals(
      classifyLoadErrors([{ file: 'src/entry-client.ts', message: VITE }]),
    ).join('\n')
    expect(lines).toContain('virtual:zero/routes')
    expect(lines).toContain('Nothing to fix')
  })

  it('still states that a component in such a file WOULD be missing', () => {
    // The easier sentence — "nothing is missing" — is not true: a file can
    // both import a virtual module and export a component.
    const lines = formatPluginVirtuals(classifyLoadErrors([{ file: 'a.ts', message: VITE }])).join(
      '\n',
    )
    expect(lines).toContain('would be absent')
  })

  it('says nothing when there were none', () => {
    expect(formatPluginVirtuals(classifyLoadErrors([{ file: 'a.tsx', message: REAL_BREAK }]))).toEqual(
      [],
    )
  })
})
