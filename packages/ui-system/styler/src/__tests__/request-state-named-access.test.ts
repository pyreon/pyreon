// @vitest-environment happy-dom
/**
 * Window named access (#4765). runtime-server publishes the per-request styler
 * scope on `globalThis.__PYREON_STYLER_REQUEST_STATE__`; nothing assigns it in
 * a browser, so markup with that `id` makes it the element there. `reset()`
 * reads it on the client too, and used to call it: "is not a function".
 * happy-dom has no named access, so the global gets what a browser's would
 * return.
 */
import { createSheet } from '../sheet'

const KEY = '__PYREON_STYLER_REQUEST_STATE__'
const g = globalThis as Record<string, unknown>

afterEach(() => {
  delete g[KEY]
  document.body.innerHTML = ''
})

it('a request-state slot shadowed by page markup is not called on the client', () => {
  document.body.innerHTML = `<div id="${KEY}"></div>`
  g[KEY] = document.getElementById(KEY)
  const s = createSheet()
  const cls = s.insert('color: olive;')
  expect(() => s.reset()).not.toThrow()
  expect(s.insert('color: olive;')).toBe(cls)
})
