/**
 * The Atlas catalog MCP surface.
 *
 * The assertions that matter here are about what the server REFUSES to claim.
 * An agent consuming this cannot check the answer — it has no other view of the
 * component — so "verified" has to mean verified, and a missing catalog has to
 * produce instructions rather than a plausible guess.
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  type AtlasCatalog,
  CATALOG_FILENAME,
  componentStats,
  findCatalogPath,
  formatControl,
  isVerified,
  loadCatalog,
  MISSING_CATALOG_MESSAGE,
  renderCatalogIndex,
  renderComponent,
} from '../atlas'

const dirs: string[] = []
function tmp(): string {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-mcp-'))
  dirs.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const verifiedVerdict = { ok: true, checked: 1, a11y: { status: 'pass' as const } }
const unverifiedVerdict = { ok: false, checked: 0, a11y: { status: 'skip' as const } }
const failedVerdict = {
  ok: false,
  checked: 1,
  a11y: { status: 'fail' as const, findings: ['missing accessible name'] },
}

const catalog = (over: Partial<AtlasCatalog> = {}): AtlasCatalog => ({
  version: 1,
  components: [
    {
      name: 'Button',
      summary: 'a button',
      tags: ['form'],
      controls: [
        { name: 'label', kind: 'text', required: true },
        { name: 'state', kind: 'select', options: ['primary', 'secondary'] },
        { name: 'onClick', kind: 'reactive', reactive: true },
      ],
      scenarios: [
        { id: 'b1', name: 'checked', args: { label: 'Save' }, verify: verifiedVerdict },
        { id: 'b2', name: 'unchecked', args: { label: 'X' }, verify: unverifiedVerdict },
      ],
    },
  ],
  ...over,
})

describe('finding + loading', () => {
  it('walks upward to find the catalog', () => {
    const root = tmp()
    const nested = join(root, 'a', 'b')
    mkdirSync(nested, { recursive: true })
    writeFileSync(join(root, CATALOG_FILENAME), JSON.stringify(catalog()))
    expect(findCatalogPath(nested)).toBe(join(root, CATALOG_FILENAME))
  })

  it('reports MISSING rather than inventing a catalog', () => {
    const result = loadCatalog(tmp())
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('missing')
  })

  it('reports UNREADABLE for malformed JSON instead of throwing', () => {
    const root = tmp()
    writeFileSync(join(root, CATALOG_FILENAME), '{ not json')
    const result = loadCatalog(root)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('unreadable')
  })

  it('rejects a JSON file that is not a catalog', () => {
    const root = tmp()
    writeFileSync(join(root, CATALOG_FILENAME), JSON.stringify({ version: 1 }))
    const result = loadCatalog(root)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.detail).toContain('components')
  })

  it('tells the agent how to produce one, and why it is not guessing', () => {
    expect(MISSING_CATALOG_MESSAGE).toContain('atlas scan')
    expect(MISSING_CATALOG_MESSAGE).toContain('guess')
  })
})

describe('verification honesty', () => {
  it('counts a scenario as verified ONLY when a check actually ran', () => {
    expect(isVerified({ id: '1', name: 'a', args: {}, verify: verifiedVerdict })).toBe(true)
    expect(isVerified({ id: '2', name: 'b', args: {}, verify: unverifiedVerdict })).toBe(false)
    expect(isVerified({ id: '3', name: 'c', args: {} })).toBe(false)
    // The trap: `ok: true` with nothing checked. A catalog produced before the
    // verify-honesty fix carries exactly this shape, and it must not read as a
    // pass just because an old field says so.
    expect(isVerified({ id: '4', name: 'd', args: {}, verify: { ok: true, checked: 0 } })).toBe(false)
  })

  it('splits scenario counts three ways, so "catalogued" never implies "checked"', () => {
    const stats = componentStats(catalog().components[0]!)
    expect(stats).toEqual({ scenarios: 2, verified: 1, failed: 0, unverified: 1 })
  })

  it('says "correct" only for a verified scenario', () => {
    const text = renderComponent(catalog(), 'Button')
    expect(text).toContain('correct (verified): {"label":"Save"}')
    expect(text).not.toContain('UNVERIFIED')
  })

  it('labels an unverified example as unverified rather than dropping or promoting it', () => {
    const only = catalog({
      components: [
        {
          name: 'Card',
          scenarios: [{ id: 'c1', name: 'plain', args: { title: 'Hi' }, verify: unverifiedVerdict }],
        },
      ],
    })
    const text = renderComponent(only, 'Card')
    // Useful as a starting point…
    expect(text).toContain('{"title":"Hi"}')
    // …but never sold as correct.
    expect(text).toContain('UNVERIFIED')
    expect(text).not.toContain('correct (verified)')
  })

  it('surfaces a real failure as an avoid line', () => {
    const failing = catalog({
      components: [
        {
          name: 'Bad',
          scenarios: [{ id: 'x', name: 'empty label', args: { label: '' }, verify: failedVerdict }],
        },
      ],
    })
    expect(renderComponent(failing, 'Bad')).toContain('avoid: "empty label" — missing accessible name')
  })

  it('does NOT smear an unverified scenario as something to avoid', () => {
    const text = renderComponent(catalog(), 'Button')
    expect(text).not.toContain('avoid:')
  })
})

describe('rendering', () => {
  it('formats allowed values inline, so an agent cannot invent one', () => {
    expect(formatControl({ name: 'state', kind: 'select', options: ['a', 'b'] })).toBe('state(a|b)')
    expect(formatControl({ name: 'label', kind: 'text' })).toBe('label(text)')
    expect(formatControl({ name: 'on', kind: 'boolean' })).toBe('on(bool)')
  })

  it('marks reactive props as needing an accessor, not a value', () => {
    const text = renderComponent(catalog(), 'Button')
    expect(text).toContain('reactive (pass a signal accessor, not a value): onClick')
  })

  it('separates required from optional props', () => {
    const text = renderComponent(catalog(), 'Button')
    expect(text).toContain('required: label(text)')
    expect(text).toContain('optional: state(primary|secondary)')
  })

  it('states verification counts on every index line', () => {
    const text = renderCatalogIndex(catalog())
    expect(text).toContain('scenarios: 2 (1 verified, 0 failing, 1 unverified)')
  })

  it('filters by tag and names the available tags when a tag matches nothing', () => {
    expect(renderCatalogIndex(catalog(), 'form')).toContain('## Button')
    const miss = renderCatalogIndex(catalog(), 'nope')
    expect(miss).toContain('No components tagged "nope"')
    expect(miss).toContain('form')
  })

  it('suggests near matches for an unknown component instead of a bare miss', () => {
    const text = renderComponent(catalog(), 'butt')
    expect(text).toContain('Did you mean')
    expect(text).toContain('Button')
  })
})
