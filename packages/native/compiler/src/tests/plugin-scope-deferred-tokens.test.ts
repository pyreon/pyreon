import { replaceDeferredTokens } from '../plugin-scope'

// `ctx.deferred(key)` embeds `__PYREON_DEFERRED(key)__` in emitted text and the
// finalizer swaps it for the resolved value. The swap runs over whole emitted
// files, so it must read the text in linear time (CodeQL js/polynomial-redos:
// the original regex's key class rescanned to end-of-line from every opener).

const swap = (text: string) => replaceDeferredTokens(text, (key) => `<${key}>`)

describe('replaceDeferredTokens — what counts as a token', () => {
  it('replaces one token and leaves the surrounding text alone', () => {
    expect(swap('a __PYREON_DEFERRED(x)__ b')).toBe('a <x> b')
  })

  it('replaces several tokens, adjacent and repeated', () => {
    expect(swap('__PYREON_DEFERRED(a)____PYREON_DEFERRED(b)__ __PYREON_DEFERRED(a)__')).toBe('<a><b> <a>')
  })

  it('returns the same string when there is nothing to replace', () => {
    expect(swap('no tokens here')).toBe('no tokens here')
    expect(swap('')).toBe('')
  })

  it.each([
    ['an empty key', '__PYREON_DEFERRED()__'],
    ['a key broken by a newline', '__PYREON_DEFERRED(a\nb)__'],
    ['an unclosed token', '__PYREON_DEFERRED(a'],
    ['a missing trailing underscore pair', '__PYREON_DEFERRED(a)'],
    ['only one trailing underscore', '__PYREON_DEFERRED(a)_'],
  ])('leaves %s untouched', (_name, text) => {
    expect(swap(text)).toBe(text)
  })

  it('on one line the FIRST opener claims everything up to the closing ")__" as its key (regex-compatible)', () => {
    expect(swap('__PYREON_DEFERRED(oops __PYREON_DEFERRED(ok)__')).toBe('<oops __PYREON_DEFERRED(ok>')
  })

  it('a broken opener on an earlier line does not affect a real token on the next one', () => {
    expect(swap('__PYREON_DEFERRED(oops\n__PYREON_DEFERRED(ok)__')).toBe('__PYREON_DEFERRED(oops\n<ok>')
  })

  it('keys may contain spaces, dots and other punctuation but never ")"', () => {
    expect(swap('__PYREON_DEFERRED(a.b c-d)__')).toBe('<a.b c-d>')
    expect(swap('__PYREON_DEFERRED(a)b)__')).toBe('__PYREON_DEFERRED(a)b)__')
  })

  it('passes each key through exactly once, in order', () => {
    const seen: string[] = []
    replaceDeferredTokens('__PYREON_DEFERRED(a)__ x __PYREON_DEFERRED(b)__', (key) => {
      seen.push(key)
      return ''
    })
    expect(seen).toEqual(['a', 'b'])
  })
})

describe('replaceDeferredTokens — stays linear on hostile input', () => {
  // Tens of seconds for the quadratic form at this size; milliseconds here.
  // The bound is loose (a loaded runner is ~10x slower than a laptop).
  const N = 20_000
  const BUDGET_MS = 3000

  it.each([
    ['one long line of unclosed openers', '__PYREON_DEFERRED('.repeat(N)],
    ['openers with no terminator before the real token', `${'__PYREON_DEFERRED(a'.repeat(N)}`],
    ['a very long key that never closes', `__PYREON_DEFERRED(${'k'.repeat(N * 4)}`],
  ])('%s, then a real token', (_name, hostile) => {
    const started = performance.now()
    const out = swap(`${hostile}\n__PYREON_DEFERRED(real)__`)
    const elapsed = performance.now() - started
    expect(out.endsWith('\n<real>')).toBe(true)
    expect(elapsed).toBeLessThan(BUDGET_MS)
  })
})
