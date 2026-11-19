import { metadataHeader } from '../tus-metadata'

describe('metadataHeader (tus Upload-Metadata)', () => {
  it('writes key and base64 value pairs, skips empty values, keeps non-ASCII values intact through UTF-8', () => {
    expect(metadataHeader({ filename: 'a.bin', filetype: 'application/octet-stream' })).toBe(`filename ${btoa('a.bin')},filetype ${btoa('application/octet-stream')}`)
    expect(metadataHeader({ filename: 'x', empty: '' })).toBe(`filename ${btoa('x')}`)
    expect(metadataHeader({})).toBe('')
    const bytes = new TextEncoder().encode('žluťoučký.txt')
    const decoded = new TextDecoder().decode(Uint8Array.from(atob(metadataHeader({ filename: 'žluťoučký.txt' }).split(' ')[1] as string), (c) => c.charCodeAt(0)))

    expect(decoded).toBe('žluťoučký.txt')
    expect(bytes.length).toBeGreaterThan('žluťoučký.txt'.length)
  })

  it('a key that would add a header field (a space or a comma) is rejected, not escaped', () => {
    for (const key of ['a b', 'a,b', 'x y,evil', 'k\r\nupload-offset', 'tab\t', 'é', '']) {
      expect(() => metadataHeader({ [key]: 'v' }), JSON.stringify(key)).toThrow(/\[Pyreon\] tusTransport: the metadata key/)
    }
  })

  it('a value cannot carry a separator: it is base64', () => {
    const header = metadataHeader({ filename: 'a b,c d\r\nupload-offset: 0' })

    expect(header).toMatch(/^filename [A-Za-z0-9+/=]+$/)
    expect(header.includes(',')).toBe(false)
  })

  it('a long hostile key is rejected in linear time', () => {
    const t0 = performance.now()

    expect(() => metadataHeader({ ['a'.repeat(100_000) + ' ']: 'v' })).toThrow()
    expect(performance.now() - t0).toBeLessThan(1500)
  })
})
