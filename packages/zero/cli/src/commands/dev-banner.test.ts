import { describe, expect, it } from 'vitest'
import {
  countRoutes,
  formatReadyLine,
  formatRouteSummary,
  formatRouteTable,
  type RouteSummaryInput,
} from './dev-banner'

// Strip ANSI so assertions read the plain text — the color codes are cosmetic
// and asserting on them would make the specs brittle. Build the ESC byte via
// fromCharCode so no control character sits in a static regex (no-control-regex).
const ESC = String.fromCharCode(27)
const ANSI = new RegExp(`${ESC}\\[[0-9;]*m`, 'g')
const strip = (s: string) => s.replace(ANSI, '')

const pages: RouteSummaryInput[] = [
  { urlPath: '/', renderMode: 'ssr' },
  { urlPath: '/about', renderMode: 'ssg' },
  { urlPath: '/blog/:slug', renderMode: 'ssr' },
  { urlPath: '/dashboard', renderMode: 'spa' },
  { urlPath: '/feed', renderMode: 'ssr' },
]

describe('countRoutes', () => {
  it('tallies page routes by uppercased render mode + carries the API count', () => {
    const c = countRoutes(pages, 2)
    expect(c.modes).toEqual({ SSR: 3, SSG: 1, SPA: 1 })
    expect(c.pages).toBe(5)
    expect(c.api).toBe(2)
  })

  it('returns empty modes for an empty page list', () => {
    expect(countRoutes([], 0)).toEqual({ modes: {}, pages: 0, api: 0 })
  })
})

describe('formatRouteSummary', () => {
  it('renders one line ordered by count (desc), includes API, and the --routes hint', () => {
    const line = strip(formatRouteSummary(countRoutes(pages, 1)))
    // SSR (3) leads, then SSG/SPA (1 each, alpha tie-break: SPA before SSG? no —
    // localeCompare puts SPA before SSG), then API.
    expect(line).toContain('Routes')
    expect(line).toContain('SSR 3')
    expect(line).toContain('SSG 1')
    expect(line).toContain('SPA 1')
    expect(line).toContain('API 1')
    expect(line).toContain('zero dev --routes to list')
    // SSR (highest count) must appear before the tied single-count modes.
    expect(line.indexOf('SSR 3')).toBeLessThan(line.indexOf('SSG 1'))
    // Ties broken alphabetically: SPA before SSG.
    expect(line.indexOf('SPA 1')).toBeLessThan(line.indexOf('SSG 1'))
  })

  it('omits the API segment when there are no API routes', () => {
    const line = strip(formatRouteSummary(countRoutes(pages, 0)))
    expect(line).not.toContain('API')
    expect(line).toContain('SSR 3')
  })

  it('renders "none" when there are neither page nor API routes', () => {
    const line = strip(formatRouteSummary(countRoutes([], 0)))
    expect(line).toContain('Routes')
    expect(line).toContain('none')
  })
})

describe('formatRouteTable', () => {
  it('lists every page route (mode + path) and an API section', () => {
    const lines = formatRouteTable(pages, ['/api/health', '/api/users/:id']).map(strip)
    const joined = lines.join('\n')
    expect(joined).toContain('Routes')
    expect(joined).toContain('SSR  /blog/:slug')
    expect(joined).toContain('SPA  /dashboard')
    expect(joined).toContain('API Routes')
    expect(joined).toContain('API  /api/health')
    expect(joined).toContain('API  /api/users/:id')
  })

  it('omits the API section entirely when there are no API routes', () => {
    const joined = formatRouteTable(pages, []).map(strip).join('\n')
    expect(joined).not.toContain('API Routes')
    expect(joined).toContain('SSR  /')
  })
})

describe('formatReadyLine', () => {
  it('shows the elapsed startup time', () => {
    expect(strip(formatReadyLine(234))).toContain('ready in 234ms')
  })
})
