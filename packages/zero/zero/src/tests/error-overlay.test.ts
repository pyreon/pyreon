import { describe, expect, it } from 'vitest'
import { renderErrorOverlay } from '../error-overlay'

describe('renderErrorOverlay', () => {
  it('produces valid HTML document', () => {
    const html = renderErrorOverlay(new Error('test'))
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('<html')
    expect(html).toContain('</html>')
    expect(html).toContain('<head>')
    expect(html).toContain('</head>')
    expect(html).toContain('<body>')
    expect(html).toContain('</body>')
  })

  it('includes the error message', () => {
    const html = renderErrorOverlay(new Error('Something broke'))
    expect(html).toContain('Something broke')
  })

  it('includes the stack trace', () => {
    const error = new Error('Test error')
    error.stack = 'Error: Test error\n    at test (file.ts:10:5)'
    const html = renderErrorOverlay(error)
    expect(html).toContain('Test error')
    expect(html).toContain('file.ts:10:5')
  })

  it('escapes HTML in error message', () => {
    const html = renderErrorOverlay(new Error('<script>alert("xss")</script>'))
    expect(html).not.toContain('<script>alert("xss")</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('escapes HTML in stack trace', () => {
    const error = new Error('test')
    error.stack = '<img src=x onerror=alert(1)>'
    const html = renderErrorOverlay(error)
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img')
  })

  it('handles error with no message', () => {
    const error = new Error()
    const html = renderErrorOverlay(error)
    expect(html).toContain('Unknown error')
  })

  it('handles error with no stack', () => {
    const error = new Error('no stack')
    error.stack = undefined
    const html = renderErrorOverlay(error)
    expect(html).toContain('no stack')
    expect(html).toContain('<pre class="stack">')
  })

  it('includes Pyreon Zero branding', () => {
    const html = renderErrorOverlay(new Error('test'))
    expect(html).toContain('Pyreon Zero')
    expect(html).toContain('SSR Error')
  })

  it('includes CSS styles', () => {
    const html = renderErrorOverlay(new Error('test'))
    expect(html).toContain('<style>')
    expect(html).toContain('</style>')
  })

  it('highlights file paths in stack trace', () => {
    const error = new Error('test')
    error.stack = 'Error: test\n    at fn (src/app.ts:42:10)'
    const html = renderErrorOverlay(error)
    expect(html).toContain('<span class="file">src/app.ts:42:10</span>')
  })

  it('includes dev mode hint', () => {
    const html = renderErrorOverlay(new Error('test'))
    expect(html).toContain('only shown in development')
  })
})
