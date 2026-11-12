import { describe, expect, it } from 'vitest'
import * as compat from '../compat'
import * as hooks from '../hooks'
import * as main from '../index'

// `preact/compat` is aliased to `@pyreon/preact-compat/compat`: Preact's
// React-shaped API in one module — the main entry plus the hooks.
describe('@pyreon/preact-compat/compat', () => {
  it('re-exports every name of the main entry and of ./hooks', () => {
    const names = new Set(Object.keys(compat))
    for (const n of Object.keys(main)) expect(names, n).toContain(n)
    for (const n of Object.keys(hooks)) expect(names, n).toContain(n)
  })

  it('the hooks are the same functions (one render context)', () => {
    expect(compat.useState).toBe(hooks.useState)
    expect(compat.memo).toBe(hooks.memo)
    expect(compat.h).toBe(main.h)
  })
})
