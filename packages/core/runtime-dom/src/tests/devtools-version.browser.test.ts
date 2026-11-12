/**
 * Real-Chromium lock for #4445: the page hook the devtools extension reads
 * (`window.__PYREON_DEVTOOLS__`) reports the real `@pyreon/runtime-dom`
 * version, which the extension shows next to the brand.
 */
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { describe, expect, it } from 'vitest'
import pkg from '../../package.json' with { type: 'json' }

describe('devtools hook version (real Chromium)', () => {
  it('mount() installs a hook whose version is the package version', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const dispose = mount(h('p', null, 'x'), host)
    const hook = (window as unknown as { __PYREON_DEVTOOLS__: { version: string } })
      .__PYREON_DEVTOOLS__
    expect(hook.version).toBe(pkg.version)
    expect(hook.version).not.toBe('0.1.0')
    dispose()
    host.remove()
  })
})
