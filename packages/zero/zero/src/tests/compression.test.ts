import { describe, expect, it } from 'vitest'
import { compressResponse, isCompressible } from '../compression'

describe('compressResponse', () => {
  it('compresses text/html above threshold', async () => {
    const body = '<html>'.repeat(500) // Well above 1KB
    const response = new Response(body, {
      headers: { 'Content-Type': 'text/html' },
    })
    const compressed = await compressResponse(response, 'gzip', 1024)
    expect(compressed.headers.get('Content-Encoding')).toBe('gzip')
    expect(compressed.headers.get('Vary')).toContain('Accept-Encoding')
  })

  it('skips responses below threshold', async () => {
    const response = new Response('small', {
      headers: { 'Content-Type': 'text/html' },
    })
    const result = await compressResponse(response, 'gzip', 1024)
    expect(result.headers.get('Content-Encoding')).toBeNull()
  })

  it('skips non-compressible content types', async () => {
    const body = 'x'.repeat(2000)
    const response = new Response(body, {
      headers: { 'Content-Type': 'image/png' },
    })
    const result = await compressResponse(response, 'gzip', 1024)
    expect(result.headers.get('Content-Encoding')).toBeNull()
  })

  it('skips already encoded responses', async () => {
    const body = 'x'.repeat(2000)
    const response = new Response(body, {
      headers: {
        'Content-Type': 'text/html',
        'Content-Encoding': 'br',
      },
    })
    const result = await compressResponse(response, 'gzip', 1024)
    expect(result.headers.get('Content-Encoding')).toBe('br')
  })

  it('compresses application/json', async () => {
    const body = JSON.stringify({ data: 'x'.repeat(2000) })
    const response = new Response(body, {
      headers: { 'Content-Type': 'application/json' },
    })
    const compressed = await compressResponse(response, 'gzip', 1024)
    expect(compressed.headers.get('Content-Encoding')).toBe('gzip')
  })

  it('supports deflate encoding', async () => {
    const body = '<html>'.repeat(500)
    const response = new Response(body, {
      headers: { 'Content-Type': 'text/html' },
    })
    const compressed = await compressResponse(response, 'deflate', 1024)
    expect(compressed.headers.get('Content-Encoding')).toBe('deflate')
  })

  it('preserves status code and statusText', async () => {
    const body = 'x'.repeat(2000)
    const response = new Response(body, {
      status: 201,
      statusText: 'Created',
      headers: { 'Content-Type': 'text/html' },
    })
    const compressed = await compressResponse(response, 'gzip', 1024)
    expect(compressed.status).toBe(201)
    expect(compressed.statusText).toBe('Created')
  })
})

describe('isCompressible', () => {
  it('returns true for text types', () => {
    expect(isCompressible('text/html')).toBe(true)
    expect(isCompressible('text/css')).toBe(true)
    expect(isCompressible('text/plain')).toBe(true)
  })

  it('returns true for application types', () => {
    expect(isCompressible('application/json')).toBe(true)
    expect(isCompressible('application/javascript')).toBe(true)
    expect(isCompressible('application/xml')).toBe(true)
  })

  it('returns true for SVG', () => {
    expect(isCompressible('image/svg+xml')).toBe(true)
  })

  it('returns false for binary types', () => {
    expect(isCompressible('image/png')).toBe(false)
    expect(isCompressible('image/jpeg')).toBe(false)
    expect(isCompressible('application/octet-stream')).toBe(false)
  })
})
