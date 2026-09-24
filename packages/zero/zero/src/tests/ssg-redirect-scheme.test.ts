import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { assertSafeRedirectTarget } from '../ssg-plugin'

describe('SSG redirect targets are scheme-checked', () => {
  it.each(['/login', '/a?b=c#d', 'https://example.com/x', 'HTTP://example.com', '//cdn.example.com/x', 'relative/path'])(
    'allows %s',
    (to) => {
      expect(() => assertSafeRedirectTarget(to, '/from')).not.toThrow()
    },
  )

  it.each([
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    '  javascript:alert(1)',
    'java\tscript:alert(1)',
    '\u0001javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
  ])('rejects %j with a [Pyreon] error naming the route', (to) => {
    expect(() => assertSafeRedirectTarget(to, '/posts/1')).toThrow(/\[Pyreon\].*"\/posts\/1"/)
  })

  it('the SSG render loop checks the target BEFORE recording it', () => {
    const src = readFileSync(join(__dirname, '..', 'ssg-plugin.ts'), 'utf-8')
    const check = src.indexOf('assertSafeRedirectTarget(result.to, result.from)')
    const push = src.indexOf('redirects.push({ from: result.from')
    expect(check).toBeGreaterThan(-1)
    expect(check).toBeLessThan(push)
  })
})
