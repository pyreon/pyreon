import { countStringOps } from '../string-ops'

describe('countStringOps', () => {
  it('records every regex execution, whichever method ran it', () => {
    const t = countStringOps(() => {
      'a?b'.replace(/[?#].*$/, '')
      ;/\.md$/i.test('x.md')
      'a,b'.split(/,/)
      'abc'.search(/b/)

      return [...'aa'.matchAll(/a/g)].length
    })
    expect(t.result).toBe(2)
    expect(t.regexSources).toContain('/[?#].*$/')
    expect(t.regexSources).toContain('/\\.md$/i')
    // `split` runs a sticky copy of the regex (the spec's species splitter).
    expect(t.regexSources.some((s) => s.startsWith('/,/'))).toBe(true)
    expect(t.regexSources).toContain('/b/')
    expect(t.regexSources.filter((s) => s === '/a/g').length).toBeGreaterThanOrEqual(2)
  })

  it('counts string-method calls, so a per-character loop shows up as growth', () => {
    const scan = (s: string) => {
      let n = 0
      for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 35) n++
      return n
    }
    const small = countStringOps(() => scan('#'.repeat(10)))
    const large = countStringOps(() => scan('#'.repeat(1000)))
    expect(small).toMatchObject({ result: 10, stringCalls: 10, regexSources: [] })
    expect(large.stringCalls).toBe(1000)
  })

  it('counts a fixed sequence of builtins as the same number at any size', () => {
    const fixed = (s: string) => s.slice(0, s.indexOf('?')).toLowerCase()
    expect(countStringOps(() => fixed(`${'a'.repeat(10)}?`)).stringCalls).toBe(3)
    expect(countStringOps(() => fixed(`${'a'.repeat(100_000)}?`)).stringCalls).toBe(3)
  })

  it('restores the real methods, also when the function throws', () => {
    const indexOf = String.prototype.indexOf
    const exec = RegExp.prototype.exec
    expect(() =>
      countStringOps(() => {
        throw new Error('boom')
      }),
    ).toThrow('boom')
    expect(String.prototype.indexOf).toBe(indexOf)
    expect(RegExp.prototype.exec).toBe(exec)
    expect(Object.keys(String.prototype)).toEqual([])
  })
})
