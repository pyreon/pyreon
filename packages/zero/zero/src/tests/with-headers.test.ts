import { describe, expect, it } from 'vitest'
import { withHeaders } from '../utils/with-headers'

describe('withHeaders', () => {
  it('adds new headers without mutating original', () => {
    const original = new Response('body', {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    })

    const modified = withHeaders(original, (h) => {
      h.set('X-Custom', 'value')
    })

    expect(modified.headers.get('X-Custom')).toBe('value')
    expect(modified.headers.get('Content-Type')).toBe('text/html')
    expect(original.headers.has('X-Custom')).toBe(false)
  })

  it('preserves status code and statusText', () => {
    const original = new Response('not found', {
      status: 404,
      statusText: 'Not Found',
    })

    const modified = withHeaders(original, (h) => {
      h.set('X-Error', 'true')
    })

    expect(modified.status).toBe(404)
    expect(modified.statusText).toBe('Not Found')
  })

  it('overwrites existing headers', () => {
    const original = new Response('body', {
      headers: { 'Cache-Control': 'no-cache' },
    })

    const modified = withHeaders(original, (h) => {
      h.set('Cache-Control', 'public, max-age=3600')
    })

    expect(modified.headers.get('Cache-Control')).toBe('public, max-age=3600')
  })

  it('deletes headers', () => {
    const original = new Response('body', {
      headers: { 'X-Remove': 'yes', 'X-Keep': 'yes' },
    })

    const modified = withHeaders(original, (h) => {
      h.delete('X-Remove')
    })

    expect(modified.headers.has('X-Remove')).toBe(false)
    expect(modified.headers.get('X-Keep')).toBe('yes')
  })

  it('sets multiple headers at once', () => {
    const original = new Response('body')

    const modified = withHeaders(original, (h) => {
      h.set('X-Content-Type-Options', 'nosniff')
      h.set('X-Frame-Options', 'DENY')
      h.set('X-XSS-Protection', '1; mode=block')
    })

    expect(modified.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(modified.headers.get('X-Frame-Options')).toBe('DENY')
    expect(modified.headers.get('X-XSS-Protection')).toBe('1; mode=block')
  })
})
