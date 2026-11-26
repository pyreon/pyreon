// #4825 (rich-text arm) — `@pyreon/rich-text/styles.css` is the file an app
// under a strict CSP imports instead of the injected <style> elements. It must
// carry the placeholder rule the editor injects (TipTap's own base CSS is
// locked against the live injected element in `csp.browser.test.tsx`).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { placeholderStyles } from '../styles'

const read = (file: string) => readFileSync(join(import.meta.dirname, '..', '..', file), 'utf8')

describe('@pyreon/rich-text/styles.css', () => {
  it('carries the injected placeholder rule', () => {
    expect(read('styles.css')).toContain(placeholderStyles)
  })

  it('is exported, published, and marked as a side effect', () => {
    const pkg = JSON.parse(read('package.json')) as {
      exports: Record<string, unknown>
      files: string[]
      sideEffects: unknown
    }
    expect(pkg.exports['./styles.css']).toBe('./styles.css')
    expect(pkg.files).toContain('styles.css')
    expect(pkg.sideEffects).toEqual(['**/*.css'])
  })
})
