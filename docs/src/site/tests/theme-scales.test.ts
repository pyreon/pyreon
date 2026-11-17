import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SITE_CSS } from '../kit/site-css'
import { breakpoints, media, radius, space, text, z } from '../theme'
import { renderScaleVars, SCALE_VARS_CSS, scaleVars } from '../theme-vars'

describe('the scale tokens', () => {
  it('space keys count eighths of 8px ×100, so a key names its value', () => {
    for (const [key, px] of Object.entries(space)) expect(px, `space[${key}]`).toBe((Number(key) / 100) * 8)
  })

  it('space steps are even and ascending: odd literals stay off the scale on purpose', () => {
    const values = Object.values(space)
    for (const v of values) expect(v % 2).toBe(0)
    expect([...values].sort((a, b) => a - b)).toEqual(values)
  })

  it('media.up and media.down never overlap at a breakpoint', () => {
    expect(media.up.md).toBe(`@media (min-width: ${breakpoints.md}px)`)
    expect(media.down.md).toBe(`@media (max-width: ${breakpoints.md - 0.02}px)`)
  })
})

describe('the scale custom properties', () => {
  it('emit one --s-* per token, with units', () => {
    const vars = scaleVars()
    expect(vars['space-150']).toBe('12px')
    expect(vars['radius-card']).toBe(`${radius.card}px`)
    expect(vars['fs-body']).toBe(`${text.body.size}px`)
    expect(vars['lh-body']).toBe(String(text.body.lineHeight))
    expect(vars['z-nav']).toBe(String(z.nav))
    expect(vars['dur-reveal']).toBe('700ms')
    expect(renderScaleVars({ a: '1px' })).toBe(':root{--s-a:1px}')
  })

  it('reach every page through SITE_CSS, which every layout (marketing, docs, 404) injects', () => {
    expect(SITE_CSS).toContain(SCALE_VARS_CSS)
    for (const file of ['../../routes/docs/_layout.tsx', '../../routes/(site)/_layout.tsx']) {
      expect(readFileSync(join(import.meta.dirname, file), 'utf8'), file).toContain('<SiteShell>')
    }
    expect(readFileSync(join(import.meta.dirname, '../pages/NotFound.tsx'), 'utf8')).toContain('injectRules([SITE_CSS]')
  })

  it('every var(--s-…) the stylesheets read is defined', () => {
    const defined = new Set(Object.keys(scaleVars()).map((n) => `--s-${n}`))
    const sheets = [readFileSync(join(import.meta.dirname, '../../styles/docs-v3.css'), 'utf8'), SITE_CSS]
    const used = sheets.flatMap((s) => [...s.matchAll(/var\((--s-[A-Za-z0-9-]+)/g)].map((m) => m[1] as string))
    expect(used.length).toBeGreaterThan(0)
    for (const name of used) expect(defined.has(name), name).toBe(true)
  })
})
