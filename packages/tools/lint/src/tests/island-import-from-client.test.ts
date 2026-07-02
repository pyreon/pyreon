/**
 * Tier-3 islands DX — tests for `pyreon/island-import-from-client`.
 *
 * The barrel import (`import { island } from '@pyreon/server'`) drags
 * node:* + the server singleton into client bundles; the /client subentry
 * (or '@pyreon/zero') is always the safe form. FIRES/does-NOT-fire pairs
 * keep bisect-verification fast.
 */
import { getPreset } from '../config/presets'
import { allRules } from '../rules/index'
import { lintFile } from '../runner'

function lint(source: string, filePath = 'src/islands.ts') {
  return lintFile(filePath, source, allRules, getPreset('recommended'))
}

function diagIds(result: ReturnType<typeof lintFile>): string[] {
  return result.diagnostics.map((d) => d.ruleId)
}

describe('pyreon/island-import-from-client', () => {
  it('FIRES on `import { island } from "@pyreon/server"`', () => {
    const result = lint(`import { island } from '@pyreon/server'
export const Counter = island(() => import('./Counter'), { name: 'Counter' })`)
    expect(diagIds(result)).toContain('pyreon/island-import-from-client')
  })

  it('FIRES on an aliased import (`island as makeIsland`)', () => {
    const result = lint(`import { island as makeIsland } from '@pyreon/server'`)
    expect(diagIds(result)).toContain('pyreon/island-import-from-client')
  })

  it('does NOT fire on the /client subentry', () => {
    const result = lint(`import { island } from '@pyreon/server/client'`)
    expect(diagIds(result)).not.toContain('pyreon/island-import-from-client')
  })

  it('does NOT fire on the @pyreon/zero re-export', () => {
    const result = lint(`import { island } from '@pyreon/zero'`)
    expect(diagIds(result)).not.toContain('pyreon/island-import-from-client')
  })

  it('does NOT fire on OTHER barrel imports (createHandler is server-side API)', () => {
    const result = lint(`import { createHandler } from '@pyreon/server'`)
    expect(diagIds(result)).not.toContain('pyreon/island-import-from-client')
  })

  it('does NOT fire in server-only files by naming convention', () => {
    const src = `import { island, createHandler } from '@pyreon/server'`
    expect(diagIds(lint(src, 'src/entry-server.ts'))).not.toContain(
      'pyreon/island-import-from-client',
    )
    expect(diagIds(lint(src, 'src/routes/posts.server.ts'))).not.toContain(
      'pyreon/island-import-from-client',
    )
  })
})
