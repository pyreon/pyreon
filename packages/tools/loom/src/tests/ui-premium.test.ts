/**
 * The observatory's interaction-performance contracts, the browser
 * preferences, and the global stylesheet — all pure, all DOM-free.
 *
 * The load-bearing idea under test: the matrix and graph render their DOM
 * ONCE per shown set, and selection/hover reach them as ONE stylesheet string
 * (`selection-css.ts`). So what must hold is (a) the ordering and id set do
 * not depend on selection/hover/cycles at all, and (b) the stylesheet names
 * exactly the lit row/column/nodes/edges. The DOM-level identity half (no
 * cell is recreated on selection) is asserted in real Chromium by
 * `e2e/loom-dev.spec.ts`.
 */
import { readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildReport } from '../core'
import type { LoomReport } from '../core'
import { FONTS_HREF, THEME_BOOT } from '../dev/server'
import { sheet } from '@pyreon/styler'
import { ensureGlobalStyles, GLOBAL_CSS } from '../ui/global-css'
import { blastRadius, buildNodes, createModel, truncateMiddle } from '../ui/model'
import {
  hashForSel,
  prefsFrom,
  readPrefs,
  resolveDark,
  selFromHash,
  storedTheme,
  THEME_KEY,
  writeThemePref,
} from '../ui/prefs'
import {
  findingsLabel,
  graphSelectionCss,
  matrixIds,
  matrixSelectionCss,
} from '../ui/selection-css'
import { cssVars, tokens } from '../ui/theme'
import { makeFixtureWorkspace } from './fixture'

let root: string
let report: LoomReport

beforeAll(() => {
  root = makeFixtureWorkspace()
  report = buildReport(root)
})
afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('matrixIds', () => {
  it('internal only, deepest first then by name', () => {
    const m = createModel(report)
    const ids = matrixIds(m)
    expect(ids.every((id) => m.byId.get(id)!.kind === 'internal')).toBe(true)
    const depths = ids.map((id) => m.byId.get(id)!.depth)
    expect([...depths].sort((a, b) => b - a)).toEqual(depths)
  })

  it('selection, hover and cycle-highlighting do not change the id set (no rebuild)', () => {
    const m = createModel(report)
    const before = matrixIds(m)
    m.select(before[before.length - 1]!)
    m.hoverId.set(before[0]!)
    m.showCycles.set(!m.showCycles())
    expect(matrixIds(m)).toEqual(before)
  })

  it('the package-list filter does not narrow it', () => {
    const m = createModel(report)
    const before = matrixIds(m)
    m.query.set('left-pad')
    expect(matrixIds(m)).toEqual(before)
  })
})

describe('matrixSelectionCss', () => {
  it('lights the selected row + column and places both crosshair bands', () => {
    const css = matrixSelectionCss(['a', 'b', 'c'], 'b')
    expect(css).toContain('.lm-r1::before')
    expect(css).toContain('.lm-c1::before')
    expect(css).toContain('.lm-rl1')
    expect(css).toContain('grid-row:3')
    expect(css).toContain('grid-column:3')
  })

  it('is empty when the selection is not in the matrix (an external)', () => {
    expect(matrixSelectionCss(['a', 'b'], 'left-pad')).toBe('')
  })
})

describe('graphSelectionCss', () => {
  const index = (m: ReturnType<typeof createModel>) => new Map(m.nodes.map((n, i) => [n.id, i]))

  it('selection alone: the box is filled, no dimming', () => {
    const m = createModel(report)
    const idx = index(m)
    const css = graphSelectionCss(m, idx, '@fix/app', null, [])
    const i = idx.get('@fix/app')!
    expect(css).toContain(`.lm-g .lm-n${i} .lm-gbox{fill:var(--lm-selFill)`)
    expect(css).not.toContain('opacity:.35')
  })

  it('lights the blast radius and exactly the edges inside it', () => {
    const m = createModel(report)
    const idx = index(m)
    // util's blast radius: app imports it (plugin only PEERS it — a peer is a
    // runtime field, so plugin counts too).
    const blast = blastRadius(m.byId, '@fix/util')
    const css = graphSelectionCss(m, idx, '@fix/util', null, blast)
    for (const id of blast) expect(css).toContain(`.lm-g .lm-n${idx.get(id)} .lm-gbox`)
    const u = idx.get('@fix/util')!
    const a = idx.get('@fix/app')!
    expect(css).toContain(`.lm-g .lm-ef${a}.lm-et${u}`)
    // app → auth leaves the lit set (auth is not in util's blast radius).
    expect(css).not.toContain(`.lm-ef${a}.lm-et${idx.get('@fix/auth')}`)
  })

  it('hover dims everything, then relights the hovered node and its neighbours', () => {
    const m = createModel(report)
    const idx = index(m)
    const util = m.byId.get('@fix/util')!
    const css = graphSelectionCss(m, idx, '@fix/app', '@fix/util')
    expect(css).toContain('.lm-g .lm-gnode{opacity:.35}')
    for (const id of ['@fix/util', ...util.dependents]) {
      expect(css).toContain(`.lm-g .lm-n${idx.get(id)}`)
    }
    const h = idx.get('@fix/util')!
    expect(css).toContain(`.lm-ef${h},.lm-g .lm-et${h}{`)
  })

  it('an unknown selection/hover produces an empty sheet rather than a broken one', () => {
    const m = createModel(report)
    expect(graphSelectionCss(m, new Map(), 'nope', 'also-nope', ['x'])).toBe('')
  })
})

describe('findings counts', () => {
  it('buildNodes counts info-severity findings per node (as pkg or dep)', () => {
    const nodes = buildNodes(report)
    for (const n of nodes) {
      const expected = report.issues.filter(
        (i) => i.severity === 'info' && (i.pkg === n.id || i.dep === n.id),
      ).length
      expect(n.infos, n.id).toBe(expected)
    }
    expect(report.issues.some((i) => i.severity === 'info')).toBe(true)
  })

  it('findingsLabel drops zero terms and shows info', () => {
    expect(findingsLabel({ errors: 0, warnings: 0, infos: 0 })).toBe('—')
    expect(findingsLabel({ errors: 2, warnings: 0, infos: 4 })).toBe('2 err · 4 info')
    expect(findingsLabel({ errors: 0, warnings: 1, infos: 0 })).toBe('1 warn')
  })
})

describe('truncateMiddle', () => {
  it('keeps both ends so prefix-sharing siblings stay distinct', () => {
    const a = truncateMiddle('@atlaskit/pragmatic-drag-and-drop-hitbox', 20)
    const b = truncateMiddle('@atlaskit/pragmatic-drag-and-drop-auto-scroll', 20)
    expect(a).toHaveLength(20)
    expect(a).not.toBe(b)
    expect(a.startsWith('@atlaskit')).toBe(true)
    expect(truncateMiddle('short', 20)).toBe('short')
  })
})

describe('createModel init', () => {
  it('seeds theme, drawers and a known selection', () => {
    const m = createModel(report, 'graph', {
      dark: false,
      navOpen: false,
      panelOpen: false,
      selId: '@fix/util',
    })
    expect(m.dark()).toBe(false)
    expect(m.navOpen()).toBe(false)
    expect(m.panelOpen()).toBe(false)
    expect(m.selId()).toBe('@fix/util')
  })

  it('ignores a selection that names no node (a stale shared link) and opens on the widest blast radius', () => {
    const m = createModel(report, 'graph', { selId: '@gone/pkg' })
    const widest = Math.max(...Object.values(report.graph.reach))
    expect(m.byId.get(m.selId())!.kind).toBe('internal')
    expect(report.graph.reach[m.selId()]).toBe(widest)
  })
})

describe('prefs', () => {
  it('resolveDark: a remembered choice wins over the OS; dark unless the OS asks for light', () => {
    // second argument: does the OS prefer LIGHT
    expect(resolveDark('light', false)).toBe(false)
    expect(resolveDark('dark', true)).toBe(true)
    expect(resolveDark(null, true)).toBe(false)
    expect(resolveDark(null, false)).toBe(true)
    expect(resolveDark('garbage', false)).toBe(true)
  })

  it('reads the SHARED pyreon-theme key, falling back to the legacy loom:theme', () => {
    const env = (store: Record<string, string>) => ({
      hash: '',
      matches: () => false,
      storage: { getItem: (k: string) => store[k] ?? null, setItem: () => {} },
    })
    expect(THEME_KEY).toBe('pyreon-theme')
    expect(prefsFrom(env({ 'pyreon-theme': 'light' })).dark).toBe(false)
    expect(prefsFrom(env({ 'loom:theme': 'light' })).dark).toBe(false)
    // The shared key wins over the legacy one.
    expect(prefsFrom(env({ 'pyreon-theme': 'dark', 'loom:theme': 'light' })).dark).toBe(true)
    expect(storedTheme(env({}).storage)).toBeNull()
  })

  it('selection hash round-trips, readable for scoped names', () => {
    for (const id of ['@pyreon/core', 'left-pad', '@types/node', 'a b']) {
      expect(selFromHash(hashForSel(id))).toBe(id)
    }
    expect(hashForSel('@pyreon/core')).toBe('#pkg=@pyreon/core')
    expect(selFromHash('#other')).toBeUndefined()
    expect(selFromHash('')).toBeUndefined()
    expect(selFromHash('#pkg=%E0%A4%A')).toBeUndefined()
  })

  it('writeThemePref stores the choice and survives a throwing storage', () => {
    const store = new Map<string, string>()
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    }
    writeThemePref(false, storage)
    expect(store.get(THEME_KEY)).toBe('light')
    const blocked = {
      getItem: () => null,
      setItem: () => {
        throw new Error('SecurityError')
      },
    }
    expect(() => writeThemePref(true, blocked)).not.toThrow()
  })

  it('readPrefs is empty on the server (the model then uses its SSR defaults)', () => {
    expect(readPrefs()).toEqual({})
  })

  it('prefsFrom: remembered theme, drawers closed on mobile, selection from the hash', () => {
    // `osLight`: does the OS prefer LIGHT (the shared rule asks that).
    const env = (mobile: boolean, osLight: boolean, hash: string, stored: string | null) => ({
      hash,
      matches: (q: string) => (q.includes('max-width') ? mobile : osLight),
      storage: { getItem: () => stored, setItem: () => {} },
    })
    expect(prefsFrom(env(true, true, '#pkg=@fix/util', 'light'))).toEqual({
      dark: false,
      navOpen: false,
      panelOpen: false,
      selId: '@fix/util',
    })
    expect(prefsFrom(env(false, false, '', null))).toEqual({
      dark: true,
      navOpen: true,
      panelOpen: true,
    })
    // Storage that throws on access (blocked site data) falls back to the OS.
    const blocked = {
      hash: '',
      matches: () => false,
      storage: {
        getItem: (): string | null => {
          throw new Error('SecurityError')
        },
        setItem: () => {},
      },
    }
    // …which here does not ask for light, so the shared default: dark.
    expect(prefsFrom(blocked)).toEqual({ dark: true, navOpen: true, panelOpen: true })
  })
})

describe('global stylesheet', () => {
  it('ensureGlobalStyles puts the sheet into the SSR style tag — every host, not just mountObservatory', () => {
    ensureGlobalStyles()
    expect(sheet.getStyleTag()).toContain('--lm-bg:')
  })

  it('defines every token as a custom property for both modes', () => {
    for (const dark of [true, false]) {
      for (const key of Object.keys(tokens(dark))) expect(GLOBAL_CSS).toContain(`--lm-${key}:`)
      expect(GLOBAL_CSS).toContain(cssVars(tokens(dark)))
    }
    // Dark by default, light only when the OS asks and nothing chose dark —
    // the shared rule.
    expect(GLOBAL_CSS).toContain(`:root,[data-lm-theme=dark]{${cssVars(tokens(true))}`)
    expect(GLOBAL_CSS).toContain('@media (prefers-color-scheme: light){:root:not([data-lm-theme=dark])')
  })

  it('never re-declares a property rocketstyle owns on anchors (unlayered beats layered)', () => {
    // `a{color:inherit}` here would override every ViewBtn state colour.
    expect(GLOBAL_CSS).not.toMatch(/\ba\{[^}]*color/)
  })

  it('does not animate graph node/edge opacity (1,000 main-thread transitions per hover)', () => {
    const rule = (sel: string) => GLOBAL_CSS.split('\n').find((l) => l.startsWith(`${sel}{`)) ?? ''
    expect(rule('.lm-gedge')).not.toContain('transition')
    expect(rule('.lm-gnode')).not.toContain('transition')
  })
})

describe('static app template', () => {
  it('carries the same fonts link + theme boot script as the dev page', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const html = readFileSync(join(here, '..', '..', 'app', 'index.html'), 'utf8')
    expect(html).toContain(FONTS_HREF)
    expect(html).toContain(THEME_BOOT)
  })
})
