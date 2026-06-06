// PR-K — extended built-in components (audit H2 + H14)
//
// Six new built-ins shipped:
//
//  - <Playground> — minimal sandboxed code editor + iframe preview
//  - <PackageBadge> — npm package install card
//  - <Tabs> — generic tab strip
//  - <APICard> — API signature card
//  - <PropTable> — props reference table
//  - <CompatMatrix> — feature/platform compatibility matrix
//
// All shipped as named exports from `@pyreon/zero-content` AND added
// to BUILT_IN_COMPONENTS so the markdown pipeline auto-imports them
// without per-file `import` statements.

import { describe, expect, it } from 'vitest'
import { mountReactive } from '@pyreon/test-utils'
import { BUILT_IN_COMPONENTS } from '../_shared/built-ins'
import {
  APICard,
  buildSrcdoc,
  CompatMatrix,
  deriveApiId,
  PackageBadge,
  Playground,
  PropTable,
  renderCompatCell,
  renderInstallRows,
  Tabs,
} from '../index'

describe('PR-K — built-in component catalogue', () => {
  it('exposes all six new built-ins in BUILT_IN_COMPONENTS', () => {
    for (const name of [
      'APICard',
      'CompatMatrix',
      'PackageBadge',
      'Playground',
      'PropTable',
      'Tabs',
    ]) {
      expect(BUILT_IN_COMPONENTS).toContain(name)
    }
  })

  it('BUILT_IN_COMPONENTS stays alphabetically sorted', () => {
    const sorted = [...BUILT_IN_COMPONENTS].sort()
    expect(Array.from(BUILT_IN_COMPONENTS)).toEqual(sorted)
  })
})

describe('PR-K — <Tabs>', () => {
  it('renders a tab list + panels from labels + children', () => {
    const { container, cleanup } = mountReactive(
      <Tabs
        labels={['One', 'Two']}
        children={[<div>One body</div>, <div>Two body</div>]}
      />,
    )
    const tabs = container.querySelectorAll('.pyreon-tabs__tab')
    expect(tabs).toHaveLength(2)
    expect(tabs[0]!.textContent).toBe('One')
    cleanup()
  })

  it('renders from the items prop when supplied', () => {
    const { container, cleanup } = mountReactive(
      <Tabs
        items={[
          { label: 'A', content: <span>aaa</span> },
          { label: 'B', content: <span>bbb</span> },
        ]}
      />,
    )
    expect(container.textContent).toContain('A')
    expect(container.textContent).toContain('B')
    cleanup()
  })

  it('respects the initial prop for which tab starts active', () => {
    const { container, cleanup } = mountReactive(
      <Tabs
        initial={1}
        items={[
          { label: 'A', content: 'aaa' },
          { label: 'B', content: 'bbb' },
        ]}
      />,
    )
    const tabs = container.querySelectorAll('.pyreon-tabs__tab')
    expect(tabs[1]!.className).toContain('pyreon-tabs__tab--active')
    cleanup()
  })

  it('clicking a tab updates the active panel', () => {
    const { container, cleanup } = mountReactive(
      <Tabs
        items={[
          { label: 'A', content: <span class="a-content">a</span> },
          { label: 'B', content: <span class="b-content">b</span> },
        ]}
      />,
    )
    const tabs = container.querySelectorAll('.pyreon-tabs__tab') as NodeListOf<HTMLButtonElement>
    tabs[1]!.click()
    expect(tabs[1]!.className).toContain('pyreon-tabs__tab--active')
    cleanup()
  })
})

describe('PR-K — <PackageBadge>', () => {
  it('renders the name + version', () => {
    const { container, cleanup } = mountReactive(
      <PackageBadge name="@pyreon/zero-content" version="0.2.0" />,
    )
    const name = container.querySelector('.pyreon-pkgbadge__name')
    const version = container.querySelector('.pyreon-pkgbadge__version')
    expect(name!.textContent).toBe('@pyreon/zero-content')
    expect(version!.textContent).toBe('v0.2.0')
    cleanup()
  })

  it('renderInstallRows builds one row per manager with the default verbs', () => {
    const rows = renderInstallRows('@foo/bar', undefined)
    expect(rows.map((r) => r.manager)).toEqual([
      'bun',
      'npm',
      'pnpm',
      'yarn',
      'deno',
    ])
    expect(rows[0]!.command).toBe('bun add @foo/bar')
    expect(rows[1]!.command).toBe('npm install @foo/bar')
  })

  it('renderInstallRows respects a partial managers map (filters absent entries)', () => {
    const rows = renderInstallRows('foo', { bun: 'add' })
    expect(rows).toHaveLength(1)
    expect(rows[0]!.command).toBe('bun add foo')
  })

  it('hides the install block when hideInstall is true', () => {
    const { container, cleanup } = mountReactive(
      <PackageBadge name="foo" hideInstall={true} />,
    )
    expect(container.querySelector('.pyreon-pkgbadge__install')).toBeNull()
    cleanup()
  })
})

describe('PR-K — <PropTable>', () => {
  it('renders one row per supplied prop', () => {
    const { container, cleanup } = mountReactive(
      <PropTable
        rows={[
          { name: 'a', type: 'string', required: true, description: 'A' },
          { name: 'b', type: 'number', default: '0' },
        ]}
      />,
    )
    const rows = container.querySelectorAll('.pyreon-proptable__table tbody tr')
    expect(rows).toHaveLength(2)
    cleanup()
  })

  it('renders a "*" marker on required props', () => {
    const { container, cleanup } = mountReactive(
      <PropTable rows={[{ name: 'a', type: 'string', required: true }]} />,
    )
    const marker = container.querySelector('.pyreon-proptable__required')
    expect(marker).not.toBeNull()
    expect(marker!.textContent).toBe('*')
    cleanup()
  })

  it('honors custom column labels', () => {
    const { container, cleanup } = mountReactive(
      <PropTable
        rows={[{ name: 'a', type: 'string' }]}
        labels={{ name: 'Param', type: 'Kind' }}
      />,
    )
    const headers = container.querySelectorAll('thead th')
    expect(headers[0]!.textContent).toBe('Param')
    expect(headers[1]!.textContent).toBe('Kind')
    cleanup()
  })
})

describe('PR-K — <APICard>', () => {
  it.each([
    ['getCollection', 'getcollection'],
    ['useFetch.options', 'usefetch-options'],
    ['HTTP   Status', 'http-status'],
    ['_internal_', 'internal'],
  ])('deriveApiId(%j) → %j', (input, expected) => {
    expect(deriveApiId(input)).toBe(expected)
  })

  it('renders the name in an <h3> + a self-anchor link', () => {
    const { container, cleanup } = mountReactive(
      <APICard name="getCollection" />,
    )
    const heading = container.querySelector('.pyreon-apicard__name')
    expect(heading!.tagName).toBe('H3')
    const anchor = heading!.querySelector('.pyreon-apicard__anchor') as HTMLAnchorElement
    expect(anchor.getAttribute('href')).toBe('#getcollection')
    cleanup()
  })

  it('renders the signature in a <pre><code> block', () => {
    const { container, cleanup } = mountReactive(
      <APICard
        name="getCollection"
        signature="getCollection<K>(name: K): Promise<Entry[]>"
      />,
    )
    const code = container.querySelector('.pyreon-apicard__signature code')
    expect(code).not.toBeNull()
    expect(code!.textContent).toContain('getCollection<K>')
    cleanup()
  })

  it('renders the stability badge when set', () => {
    const { container, cleanup } = mountReactive(
      <APICard name="getCollection" stability="experimental" />,
    )
    const badge = container.querySelector('.pyreon-apicard__stability--experimental')
    expect(badge).not.toBeNull()
    expect(badge!.textContent).toBe('experimental')
    cleanup()
  })
})

describe('PR-K — <CompatMatrix>', () => {
  it.each([
    [true, '✓', 'yes'],
    [false, '✗', 'no'],
    ['partial', '🚧', 'partial'],
    ['planned', '⏳', 'planned'],
    [null, '', 'unknown'],
    [undefined, '', 'unknown'],
    ['custom-string', 'custom-string', 'custom'],
  ])('renderCompatCell(%j) → %j', (input, display, status) => {
    const result = renderCompatCell(input)
    expect(result.display).toBe(display)
    expect(result.status).toBe(status)
  })

  it('renders a row per feature and a column per platform', () => {
    const { container, cleanup } = mountReactive(
      <CompatMatrix
        features={['F1', 'F2']}
        platforms={['P1', 'P2', 'P3']}
        cells={{
          F1: { P1: true, P2: false, P3: 'partial' },
          F2: { P1: true, P2: true, P3: 'planned' },
        }}
      />,
    )
    const rows = container.querySelectorAll('tbody tr')
    expect(rows).toHaveLength(2)
    const cells = container.querySelectorAll('.pyreon-compatmatrix__cell')
    expect(cells).toHaveLength(6)
    cleanup()
  })

  it('renders an empty cell when no status is supplied', () => {
    const { container, cleanup } = mountReactive(
      <CompatMatrix
        features={['F1']}
        platforms={['P1']}
        cells={{}}
      />,
    )
    const cell = container.querySelector('.pyreon-compatmatrix__cell')
    expect(cell!.textContent).toBe('')
    expect(cell!.getAttribute('data-status')).toBe('unknown')
    cleanup()
  })
})

describe('PR-K — <Playground>', () => {
  it('buildSrcdoc embeds HTML/CSS/JS in a complete document', () => {
    const out = buildSrcdoc(
      '<button id="b">Click</button>',
      'button { color: red }',
      'console.log("hi")',
    )
    expect(out).toContain('<!doctype html>')
    expect(out).toContain('<button id="b">Click</button>')
    expect(out).toContain('button { color: red }')
    expect(out).toContain('console.log("hi")')
  })

  it('renders editors for each section + a sandboxed iframe', () => {
    const { container, cleanup } = mountReactive(
      <Playground html="<p>Hi</p>" css="p { color: red }" js="" />,
    )
    const editors = container.querySelectorAll('.pyreon-playground__editor')
    expect(editors).toHaveLength(3)
    const iframe = container.querySelector('iframe')
    expect(iframe).not.toBeNull()
    expect(iframe!.getAttribute('sandbox')).toBe('allow-scripts')
    cleanup()
  })

  it('omits editors for unsupplied sections', () => {
    const { container, cleanup } = mountReactive(
      <Playground html="<p>Hi</p>" />,
    )
    const editors = container.querySelectorAll('.pyreon-playground__editor')
    expect(editors).toHaveLength(1)
    cleanup()
  })
})
