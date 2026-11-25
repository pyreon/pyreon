/**
 * `internal-exports-subpath`: rewrites import / re-export specifiers that name
 * an export the 1.0 API freeze moved off a public entry (to `./internal`,
 * `./internal-server` or `@pyreon/core/compat`), keeping every local binding.
 *
 * Bisect-verified: with the moved-name partition removed from the transform
 * (every element kept on the old specifier), the rewrite specs return `null`.
 */
import { describe, expect, it } from 'vitest'
import { CODEMODS, selectCodemods } from '../codemods'
import { EXPORT_MOVES, createExportMoveCodemod, internalExportsSubpath } from '../codemods/internal-exports-subpath'

const run = (src: string, path = 'a.ts') => internalExportsSubpath.transform(src, path)

describe('internal-exports-subpath', () => {
  it('splits a mixed import, keeping the public names and the quote/semicolon style', () => {
    const src = `import { _resetIdCounter, createUniqueId, isNativeCompat } from "@pyreon/core";\n`
    const out = run(src)
    expect(out).toBe(
      `import { createUniqueId } from "@pyreon/core";\n` +
        `import { _resetIdCounter } from "@pyreon/core/internal";\n` +
        `import { isNativeCompat } from "@pyreon/core/compat";\n`,
    )
    expect(run(out as string)).toBeNull()
  })

  it('replaces a declaration that only imported moved names, and keeps aliases and `type`', () => {
    const src = `import { _reset as resetToasts } from '@pyreon/toast'\nimport type { _currentScope } from '@pyreon/reactivity'\n`
    expect(run(src)).toBe(
      `import { _reset as resetToasts } from '@pyreon/toast/internal'\n` +
        `import type { _currentScope } from '@pyreon/reactivity/internal'\n`,
    )
  })

  it('keeps a multi-line list multi-line', () => {
    const src = `import {\n  _runHooked,\n  h,\n  onMount,\n} from '@pyreon/core'\n`
    expect(run(src)).toBe(`import {\n  h,\n  onMount,\n} from '@pyreon/core'\nimport {\n  _runHooked,\n} from '@pyreon/core/internal'\n`)
  })

  it('moves re-exports, and maps the server-only internals to ./internal-server', () => {
    expect(run(`export { _resetVercelRevalidateHandlerCache, vercelAdapter } from '@pyreon/zero/server'\n`)).toBe(
      `export { vercelAdapter } from '@pyreon/zero/server'\nexport { _resetVercelRevalidateHandlerCache } from '@pyreon/zero/internal-server'\n`,
    )
  })

  it('moves the @pyreon/ambient/testing internals and leaves the renamed hooks for the type checker', () => {
    const src = `import { _resetClockState, _fireAll, installFakeClock } from '@pyreon/ambient/testing'\n`
    expect(run(src, 'a.test.ts')).toBe(
      `import { _resetClockState, installFakeClock } from '@pyreon/ambient/testing'\n` +
        `import { _fireAll } from '@pyreon/ambient/internal'\n`,
    )
  })

  it('leaves a default import alone when only it remains', () => {
    const t = createExportMoveCodemod([{ from: 'pkg-x', to: 'pkg-x/internal', names: ['_a'] }])
    // The table is keyed by specifier, so a non-@pyreon module is a no-op...
    expect(t(`import def, { _a } from 'pkg-x'\n`, 'a.ts')).toBeNull()
    const u = createExportMoveCodemod([{ from: '@pyreon/x', to: '@pyreon/x/internal', names: ['_a'] }])
    expect(u(`import def, { _a } from '@pyreon/x'\n`, 'a.ts')).toBe(
      `import def from '@pyreon/x'\nimport { _a } from '@pyreon/x/internal'\n`,
    )
  })

  it('leaves compiler ABI, namespace imports, other modules and migrated code alone', () => {
    // App code reading `_toasts` should move to the public `toast.list()`, not to internal.
    expect(run(`import { _toasts } from '@pyreon/toast'\n`)).toBeNull()
    expect(run(`import { _rp, _tpl } from '@pyreon/core'\n`)).toBeNull()
    expect(run(`import * as core from '@pyreon/core'\ncore._resetIdCounter()\n`)).toBeNull()
    expect(run(`import { _resetIdCounter } from './unique-id'\n`)).toBeNull()
    expect(run(`import { _resetIdCounter } from '@pyreon/core/internal'\n`)).toBeNull()
    expect(run(`import { nativeCompat } from '@pyreon/core'\n`)).toBeNull()
  })

  it('handles TSX sources', () => {
    const src = `import { _resetHotkeys } from '@pyreon/hotkeys'\nexport const C = () => <div />\n`
    expect(run(src, 'a.tsx')).toContain(`from '@pyreon/hotkeys/internal'`)
  })

  it('every move targets a subpath of the same package', () => {
    for (const m of EXPORT_MOVES) {
      expect(m.to.split('/').slice(0, 2).join('/')).toBe(m.from.split('/').slice(0, 2).join('/'))
    }
  })

  it('is registered, migrates every moved package, and is selected for an upgrade across 0.55.0', () => {
    expect(CODEMODS).toContain(internalExportsSubpath)
    const all = [internalExportsSubpath.package, ...(internalExportsSubpath.alsoMigrates ?? [])]
    expect(all).toContain('@pyreon/zero')
    expect(all).toContain('@pyreon/toast')
    expect(selectCodemods('0.54.0', '0.55.0').map((c) => c.id)).toContain('internal-exports-subpath')
    expect(selectCodemods('0.55.0', '0.56.0').map((c) => c.id)).not.toContain('internal-exports-subpath')
  })
})
