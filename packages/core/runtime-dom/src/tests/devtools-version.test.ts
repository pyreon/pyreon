/**
 * #4445: `__PYREON_DEVTOOLS__.version` is the real `@pyreon/runtime-dom`
 * version, not a hard-coded `'0.1.0'`. The shipped build is checked in
 * `devtools-version-lib.test.ts`; the Chromium twin is
 * `devtools-version.browser.test.ts`.
 */
import pkg from '../../package.json' with { type: 'json' }
import { installDevTools } from '../devtools'

describe('devtools hook version', () => {
  it('is the @pyreon/runtime-dom package version', () => {
    installDevTools()
    const hook = (window as unknown as { __PYREON_DEVTOOLS__: { version: string } })
      .__PYREON_DEVTOOLS__
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+/)
    expect(hook.version).toBe(pkg.version)
  })
})
