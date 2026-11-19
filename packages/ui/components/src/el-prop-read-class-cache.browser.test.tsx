import { h } from '@pyreon/core'
import { query } from '@pyreon/test-utils'
import { Element } from '@pyreon/elements'
import { PyreonUI } from '@pyreon/ui-core'
import { theme } from '@pyreon/ui-theme'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { afterEach, describe, expect, it } from 'vitest'
import { rs } from './bases/rs'
import { Box, Button } from './index'

/**
 * The styler caches a rocketstyle component's class per resolved theme
 * (`$rocketstyle`, `$rocketstate`) AND per value of every other prop its
 * `.styles()` read. Keyed on the theme alone, the `el` base's
 * `cursor: pointer` gate (it reads `onClick` / `href`) gave every Box the class
 * of whichever rendered first (#4434). Real Chromium, computed style.
 */
// Computed style needs real CSS; the resolve counts also run under the node runner.
const IS_BROWSER_RUNNER = (globalThis as Record<string, unknown>).__vitest_browser__ === true
const sink = globalThis as { __pyreon_count__?: ((name: string, n?: number) => void) | undefined }

const countResolves = (fn: () => void): number => {
  let n = 0
  const prev = sink.__pyreon_count__
  sink.__pyreon_count__ = (name) => {
    if (name === 'styler.resolve') n++
  }
  try {
    fn()
  } finally {
    sink.__pyreon_count__ = prev
  }

  return n
}

let cleanups: (() => void)[] = []

afterEach(() => {
  for (const c of cleanups) c()
  cleanups = []
})

const mount = (...children: unknown[]): HTMLElement => {
  const r = mountInBrowser(h(PyreonUI, { theme }, ...(children as never[])))
  cleanups.push(r.unmount)
  return r.container
}

const styleOf = (root: HTMLElement, id: string) => getComputedStyle(query<HTMLElement>(root, `#${id}`))

describe.skipIf(!IS_BROWSER_RUNNER)('el base: onClick / href read by .styles() reach the rendered class', () => {
  for (const clickableFirst of [false, true]) {
    it(clickableFirst ? 'clickable Box first, plain second' : 'plain Box first, clickable second', () => {
      const suffix = clickableFirst ? '1' : '2'
      const plain = h(Box as never, { id: `p${suffix}` }, 'plain')
      const clickable = h(Box as never, { id: `c${suffix}`, onClick: () => {} }, 'click')
      const link = h(Box as never, { id: `l${suffix}`, tag: 'a', href: '#x' }, 'link')
      const root = mount(...(clickableFirst ? [clickable, link, plain] : [plain, clickable, link]))
      expect(styleOf(root, `c${suffix}`).cursor).toBe('pointer')
      expect(styleOf(root, `l${suffix}`).cursor).toBe('pointer')
      expect(styleOf(root, `p${suffix}`).cursor).not.toBe('pointer')
    })
  }
})

describe.skipIf(!IS_BROWSER_RUNNER)('.styles() reading a caller-chosen prop', () => {
  const Grid = rs({ name: 'CacheGrid', component: Element })
    .theme({ display: 'grid' })
    .styles(
      (css) => css`
        ${(props) => {
          const { columns } = props as { columns?: number }
          return columns ? css`grid-template-columns: repeat(${columns}, 10px);` : ''
        }};
      `,
    )

  it('two instances with the same dimensions and different values each get their own CSS', () => {
    const root = mount(h(Grid as never, { id: 'g2', columns: 2 }), h(Grid as never, { id: 'g3', columns: 3 }))
    // A non-grid box reports the specified value; a grid box the used tracks.
    expect(styleOf(root, 'g2').gridTemplateColumns).toMatch(/^(repeat\(2, 10px\)|10px 10px)$/)
    expect(styleOf(root, 'g3').gridTemplateColumns).toMatch(/^(repeat\(3, 10px\)|10px 10px 10px)$/)
  })
})

describe('warm mounts still hit the cache', () => {
  it('a .styles() reading only $rocketstyle: 0 resolves for 10 warm mounts', () => {
    const Pure = rs({ name: 'CachePure', component: Element })
      .theme({ color: 'red' })
      .styles(
        (css) => css`
          ${({ $rocketstyle }: { $rocketstyle: { color: string } }) => css`color: ${$rocketstyle.color};`};
        `,
      )
    mount(h(Pure as never, { id: 'w' }))
    expect(countResolves(() => {
      for (let i = 0; i < 10; i++) mount(h(Pure as never, { id: `w${i}`, onClick: () => {} }))
    })).toBe(0)
  })

  it('ui-components Box and Button: 0 resolves for 10 warm mounts', () => {
    mount(h(Box as never, { id: 'bw' }, 'x'), h(Button as never, { id: 'btw', onClick: () => {} }, 'x'))
    expect(countResolves(() => {
      for (let i = 0; i < 10; i++)
        {mount(h(Box as never, { id: `b${i}` }, 'x'), h(Button as never, { id: `bt${i}`, onClick: () => {} }, 'x'))}
    })).toBe(0)
  })
})
