import { describe, expect, it } from 'vitest'
import { createMediaQueries, makeItResponsive } from '../responsive'
import styles from '../styles/styles/index'

// Regression (#4324): `backgroundImage` used to emit `url(${value})` for EVERY
// value, so a value that was already a CSS <image> became
// `url(linear-gradient(…))` — invalid, dropped by the browser, computed as
// `none`. Only a bare path / URL may be wrapped; everything else passes through.

const mockCss = (strings: TemplateStringsArray, ...vals: unknown[]) => {
  let r = ''
  for (let i = 0; i < strings.length; i++) {
    r += strings[i]
    if (i < vals.length) r += String(vals[i])
  }
  return r
}

const emit = (backgroundImage: string): string =>
  String(styles({ theme: { backgroundImage }, css: mockCss, rootSize: 16 }))

const decl = (v: string) => `background-image: ${v};`

describe('backgroundImage values', () => {
  describe('already a CSS <image> → passes through verbatim', () => {
    it.each([
      ['linear-gradient', 'linear-gradient(95deg, #FF1F8C, #FF5E1A)'],
      [
        'radial-gradient',
        'radial-gradient(circle at 50% 50%, rgba(0, 0, 0, 0.4), transparent 70%)',
      ],
      ['conic-gradient', 'conic-gradient(from 90deg, red, blue)'],
      [
        'repeating-linear-gradient',
        'repeating-linear-gradient(45deg, #000 0 10px, #fff 10px 20px)',
      ],
      ['repeating-radial-gradient', 'repeating-radial-gradient(circle, red 0 5px, blue 5px 10px)'],
      ['repeating-conic-gradient', 'repeating-conic-gradient(red 0 10%, blue 10% 20%)'],
      ['-webkit- prefixed gradient', '-webkit-linear-gradient(top, red, blue)'],
      ['explicit url()', 'url(/img/a.png)'],
      ['quoted url()', 'url("/img/a b.png")'],
      ['image-set()', 'image-set("/a.png" 1x, "/a@2x.png" 2x)'],
      ['-webkit-image-set()', '-webkit-image-set(url(/a.png) 1x, url(/a@2x.png) 2x)'],
      ['cross-fade()', 'cross-fade(url(/a.png) 50%, url(/b.png))'],
      ['element()', 'element(#hero)'],
      ['var() — cssVariables / mode(a, b) output', 'var(--px-m-abc123)'],
      ['env()', 'env(--brand-image)'],
      ['none', 'none'],
      ['inherit', 'inherit'],
      ['initial', 'initial'],
      ['unset', 'unset'],
      ['revert', 'revert'],
      ['revert-layer', 'revert-layer'],
    ])('%s', (_label, value) => {
      const out = emit(value)
      expect(out).toContain(decl(value))
      expect(out).not.toContain('url(url(')
      expect(out).not.toContain(`url(${value}`)
    })
  })

  describe('bare path / URL → wrapped in url() (unchanged behaviour)', () => {
    it.each([
      ['root-relative path', '/img/a.png'],
      ['relative path', 'img/a.png'],
      ['absolute URL', 'https://example.com/img.png'],
      ['path whose name contains parentheses', '/img/photo(1).png'],
      ['file named like a keyword', '/none.png'],
      ['data URI containing a comma', 'data:image/png;base64,iVBORw0KGgo='],
    ])('%s', (_label, value) => {
      expect(emit(value)).toContain(decl(`url(${value})`))
    })
  })

  describe('comma-separated layer lists', () => {
    it('a list of <image>s passes through', () => {
      const v = 'linear-gradient(rgba(0, 0, 0, 0.5), transparent), url(/img/hero.jpg)'
      expect(emit(v)).toContain(decl(v))
    })

    it('wraps only the bare-path layers of a mixed list', () => {
      expect(emit('linear-gradient(red, blue), /img/hero.jpg')).toContain(
        decl('linear-gradient(red, blue), url(/img/hero.jpg)'),
      )
      expect(emit('/a.png, var(--px-overlay)')).toContain(decl('url(/a.png), var(--px-overlay)'))
    })

    it('several bare paths each get their own url()', () => {
      expect(emit('/a.png, /b.png')).toContain(decl('url(/a.png), url(/b.png)'))
    })

    it('a trailing data URI keeps its own commas', () => {
      expect(emit('linear-gradient(red, blue), data:image/png;base64,AAA=')).toContain(
        decl('linear-gradient(red, blue), url(data:image/png;base64,AAA=)'),
      )
    })
  })

  describe('responsive values through makeItResponsive', () => {
    const breakpoints = { xs: 0, md: 768 }
    const media = createMediaQueries({ breakpoints, css: mockCss as never, rootSize: 16 })
    const outerTheme = {
      rootSize: 16,
      breakpoints,
      __PYREON__: { sortedBreakpoints: ['xs', 'md'], media },
    }
    const run = (backgroundImage: unknown) =>
      String(
        makeItResponsive({
          theme: { backgroundImage },
          css: mockCss as never,
          styles: styles as never,
        })({ theme: outerTheme }),
      )

    it('array form: each breakpoint value is classified on its own', () => {
      const out = run(['/img/mobile.png', 'linear-gradient(red, blue)'])
      expect(out).toContain(decl('url(/img/mobile.png)'))
      expect(out).toContain(decl('linear-gradient(red, blue)'))
      expect(out).not.toContain('url(linear-gradient(')
    })

    it('breakpoint-object form: each breakpoint value is classified on its own', () => {
      const out = run({ xs: 'var(--px-hero-sm)', md: '/img/desktop.png' })
      expect(out).toContain(decl('var(--px-hero-sm)'))
      expect(out).toContain(decl('url(/img/desktop.png)'))
      expect(out).not.toContain('url(var(')
    })
  })
})
