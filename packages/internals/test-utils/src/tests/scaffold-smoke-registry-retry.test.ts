import { describe, expect, it } from 'vitest'
import { isTransientRegistryFailure } from '../../../../../scripts/scaffold-smoke'

/**
 * A scaffold cell's `bun install` resolves fresh ranges against the live
 * registry, so a just-published version whose tarball has not replicated yet
 * fails the whole cell with a 404 that is gone an hour later (2026-09-15,
 * `@types/node@26.6.0`). The classifier decides what earns a retry: a
 * registry-side transport failure yes, a resolution error or a build error
 * no — retrying those would only delay a real finding.
 */
describe('scaffold-smoke isTransientRegistryFailure', () => {
  it('a tarball 404 is transient (the 2026-09-15 shape)', () => {
    expect(
      isTransientRegistryFailure(
        'error: GET https://registry.npmjs.org/@types/node/-/node-26.6.0.tgz - 404\n',
      ),
    ).toBe(true)
  })

  it('a registry 5xx and a dropped connection are transient', () => {
    expect(isTransientRegistryFailure('error: GET https://registry.npmjs.org/foo/-/foo-1.0.0.tgz - 503')).toBe(true)
    expect(isTransientRegistryFailure('error: ECONNRESET while fetching')).toBe(true)
    expect(isTransientRegistryFailure('Error: socket hang up')).toBe(true)
  })

  it('a resolution error is NOT transient — it is the release-in-flight or a wrong range', () => {
    expect(
      isTransientRegistryFailure(
        'error: No version matching "^0.53.0" found for specifier "@pyreon/zero" (but package exists)',
      ),
    ).toBe(false)
  })

  it('a build or lockfile error is NOT transient', () => {
    expect(isTransientRegistryFailure('error: lockfile had changes, but lockfile is frozen')).toBe(false)
    expect(isTransientRegistryFailure('src/index.ts(3,5): error TS2322')).toBe(false)
    expect(isTransientRegistryFailure('')).toBe(false)
  })

  it('a 404 from somewhere other than the registry is NOT transient', () => {
    expect(isTransientRegistryFailure('GET https://example.com/x - 404')).toBe(false)
  })
})
