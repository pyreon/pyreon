// @vitest-environment node
/**
 * Phase 2 — route-level render modes. Locks the resolution contract shared
 * by the build (SSG entry's `__resolveRenderMode`) and the runtime
 * (`wirePerRouteModes`): leaf-first matched-chain walk, layout cascade,
 * app-mode default, and the static-deploy validation.
 */
import type { ComponentFn } from '@pyreon/core'
import { h } from '@pyreon/core'
import type { RouteRecord } from '@pyreon/router'
import { describe, expect, it } from 'vitest'
import { formatRouteModeTable,
  assertModesSupported,
  collectRouteModes,
  resolveRenderModeForPath,
} from '../route-modes'

const C: ComponentFn = () => h('div', null, 'x')

function routes(): RouteRecord[] {
  return [
    {
      path: '/',
      component: C,
      children: [
        { path: '/', component: C },
        { path: '/about', component: C, meta: { renderMode: 'ssg' } },
        { path: '/dash', component: C, meta: { renderMode: 'spa' } },
        { path: '/pricing', component: C, meta: { renderMode: 'isr' } },
        {
          // Layout-level declaration cascades to descendants…
          path: '/blog',
          component: C,
          meta: { renderMode: 'ssg' },
          children: [
            { path: '/blog', component: C },
            { path: '/blog/:slug', component: C },
            // …unless a descendant declares its own.
            { path: '/blog/live', component: C, meta: { renderMode: 'ssr' } },
          ],
        },
        { path: '/plain', component: C },
      ],
    } as RouteRecord,
  ]
}

describe('resolveRenderModeForPath', () => {
  it('leaf declaration wins', () => {
    expect(resolveRenderModeForPath(routes(), '/about', 'ssr')).toBe('ssg')
    expect(resolveRenderModeForPath(routes(), '/dash', 'ssr')).toBe('spa')
    expect(resolveRenderModeForPath(routes(), '/pricing', 'ssr')).toBe('isr')
  })

  it('layout declaration cascades to undeclared descendants', () => {
    expect(resolveRenderModeForPath(routes(), '/blog', 'ssr')).toBe('ssg')
    expect(resolveRenderModeForPath(routes(), '/blog/hello-world', 'ssr')).toBe('ssg')
  })

  it('a descendant declaration beats the layout cascade', () => {
    expect(resolveRenderModeForPath(routes(), '/blog/live', 'ssr')).toBe('ssr')
  })

  it('undeclared routes resolve to the app mode (the zero-change default)', () => {
    expect(resolveRenderModeForPath(routes(), '/plain', 'ssr')).toBe('ssr')
    expect(resolveRenderModeForPath(routes(), '/plain', 'isr')).toBe('isr')
  })

  it('unmatched paths resolve to the app mode (404 handling is mode-agnostic)', () => {
    expect(resolveRenderModeForPath(routes(), '/no-such-route', 'ssr')).toBe('ssr')
  })

  it('a malformed meta.renderMode value is ignored, not honored', () => {
    const r: RouteRecord[] = [
      { path: '/x', component: C, meta: { renderMode: 'static' } } as never,
    ]
    expect(resolveRenderModeForPath(r, '/x', 'ssr')).toBe('ssr')
  })
})

describe('collectRouteModes', () => {
  it('classifies every page route with cascade + default applied', () => {
    const entries = collectRouteModes(routes(), 'ssr')
    const byPattern = Object.fromEntries(entries.map((e) => [e.pattern, e]))
    expect(byPattern['/about']).toEqual({ pattern: '/about', mode: 'ssg', declared: true })
    expect(byPattern['/dash']).toEqual({ pattern: '/dash', mode: 'spa', declared: true })
    expect(byPattern['/blog/:slug']).toEqual({
      pattern: '/blog/:slug',
      mode: 'ssg',
      declared: true, // inherited from the /blog layout — still a declaration
    })
    expect(byPattern['/blog/live']).toEqual({
      pattern: '/blog/live',
      mode: 'ssr',
      declared: true,
    })
    expect(byPattern['/plain']).toEqual({ pattern: '/plain', mode: 'ssr', declared: false })
  })
})

describe('assertModesSupported', () => {
  it("PASSES a static deploy whose declared modes are all 'ssg'/'spa'", () => {
    const entries = collectRouteModes(
      [
        { path: '/a', component: C, meta: { renderMode: 'ssg' } },
        { path: '/b', component: C, meta: { renderMode: 'spa' } },
        { path: '/c', component: C },
      ] as RouteRecord[],
      'ssg',
    )
    expect(() => assertModesSupported(entries, 'ssg')).not.toThrow()
  })

  it("FAILS LOUDLY when a static deploy declares an 'ssr' or 'isr' route", () => {
    const entries = collectRouteModes(
      [
        { path: '/a', component: C, meta: { renderMode: 'ssr' } },
        { path: '/b', component: C, meta: { renderMode: 'isr' } },
      ] as RouteRecord[],
      'ssg',
    )
    expect(() => assertModesSupported(entries, 'ssg')).toThrow(
      /\[Pyreon\].*2 route\(s\) declare a server render mode/s,
    )
    expect(() => assertModesSupported(entries, 'ssg')).toThrow(/\/a \(renderMode: 'ssr'\)/)
    expect(() => assertModesSupported(entries, 'ssg')).toThrow(/zero\(\{ mode: 'ssr' \}\)/)
  })

  it('never throws for server-capable app modes', () => {
    const entries = collectRouteModes(
      [{ path: '/a', component: C, meta: { renderMode: 'ssr' } }] as RouteRecord[],
      'ssr',
    )
    expect(() => assertModesSupported(entries, 'ssr')).not.toThrow()
    expect(() => assertModesSupported(entries, 'isr')).not.toThrow()
  })
})

describe('formatRouteModeTable', () => {
  const entries = [
    { pattern: '/', mode: 'ssg' as const, declared: false },
    { pattern: '/dash', mode: 'ssr' as const, declared: true },
    { pattern: '/posts/:id', mode: 'isr' as const, declared: true },
  ]

  it('renders counts header + one glyph line per route', () => {
    const lines = formatRouteModeTable(entries, 'ssg')
    expect(lines[0]).toContain('Route modes (app: ssg)')
    expect(lines[0]).toContain('1 ssg ○')
    expect(lines[0]).toContain('1 ssr λ')
    expect(lines[0]).toContain('1 isr ⟳')
    expect(lines).toHaveLength(4)
    expect(lines.find((l) => l.includes('/dash'))).toContain('λ')
    expect(lines.find((l) => l.includes('/dash'))).toContain('(declared)')
    // matching the app mode → no declared marker even when declared
    expect(lines.find((l) => l.includes('/posts/:id'))).toContain('⟳')
  })

  it('collapses to the counts line above maxRows', () => {
    const many = Array.from({ length: 50 }, (_, i) => ({
      pattern: `/p${i}`,
      mode: 'ssg' as const,
      declared: false,
    }))
    const lines = formatRouteModeTable(many, 'ssg', 40)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('50 ssg')
  })

  it('returns [] for no entries', () => {
    expect(formatRouteModeTable([], 'ssr')).toEqual([])
  })
})
