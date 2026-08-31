/**
 * An explicit `false` under a wildcard grant makes native GRANT what the web
 * DENIES — the wrong direction for an authorization primitive, and it was
 * silent.
 *
 * `<PermissionsProvider permissions={{ 'billing.**': true, 'billing.refunds.**': false }}>`
 * bakes `PyreonPermissions(["billing.**"])` on both targets, because the native
 * container is grant-only and a `false` has nowhere to live. With no wildcard
 * that is exact — an unlisted key is denied either way — but under a wildcard
 * the `false` is the ONLY thing denying the key, so dropping it inverts the
 * decision: `can("billing.refunds.export")` is false on web and true on device.
 *
 * `permissionsProviderSeed` already computed `deniedUnderWildcard`, and its own
 * docstring said the caller reports it. No caller did — the value was computed
 * and dropped, so the divergence shipped with zero warnings.
 *
 * Lowering the denies needs a runtime change in both native containers; what is
 * closed here is the SILENCE. A wrong-direction authz divergence must be loud.
 *
 * Bisect-verified: removing the `deniedUnderWildcard` warning from either
 * emitter fails that target's spec with `warnings were: []`.
 */
import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const src = (perms: string) => `import { PermissionsProvider, usePermissions } from '@pyreon/permissions'
import { Text } from '@pyreon/primitives'
function Inner() { const can = usePermissions(); return <Text>{can('billing.refunds.export') ? 'y' : 'n'}</Text> }
export function App() {
  return (
    <PermissionsProvider permissions={${perms}}>
      <Inner />
    </PermissionsProvider>
  )
}`

const WILDCARD_DENY = `{ 'billing.**': true, 'billing.refunds.**': false }`
const EXACT_DENY = `{ 'billing.read': true, 'billing.refunds.export': false }`
const GRANTS_ONLY = `{ 'billing.read': true }`

const warningsOf = (code: string, target: 'swift' | 'kotlin'): string =>
  transform(code, { target })
    .warnings.map((w) => (typeof w === 'string' ? w : (w as { message: string }).message))
    .join('\n')

describe('a false under a wildcard grant is announced, not dropped', () => {
  for (const target of ['swift', 'kotlin'] as const) {
    it(`${target}: warns, names the key, and says which way it diverges`, () => {
      const w = warningsOf(src(WILDCARD_DENY), target)
      expect(w).toContain('billing.refunds.**')
      expect(w).toContain('GRANT-ONLY')
      // The direction is the whole point — "differs" would not tell an author
      // whether the risk is a locked-out user or an unlocked one.
      expect(w).toContain('DENIED on the web and GRANTED on device')
    })

    it(`${target}: an exact-key false is NOT warned — it is exact`, () => {
      // Without a wildcard an unlisted key is denied on both sides, so the
      // grant-only seed loses nothing. Warning here would be noise, and noise
      // is how a real warning gets ignored.
      expect(warningsOf(src(EXACT_DENY), target)).not.toContain('GRANT-ONLY')
    })

    it(`${target}: a grants-only map is silent`, () => {
      expect(warningsOf(src(GRANTS_ONLY), target)).not.toContain('GRANT-ONLY')
    })
  }

  it('the emit itself is unchanged — this adds a diagnostic, not a behaviour change', () => {
    expect(transform(src(WILDCARD_DENY), { target: 'swift' }).code).toContain(
      'PyreonPermissions(["billing.**"])',
    )
    expect(transform(src(WILDCARD_DENY), { target: 'kotlin' }).code).toContain(
      'PyreonPermissions(setOf("billing.**"))',
    )
  })
})
