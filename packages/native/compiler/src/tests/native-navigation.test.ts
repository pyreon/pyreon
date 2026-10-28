// `<Tabs>` / `<Tab>` and `<Split>` canonical primitive emit (#3983).
//
// iOS lowers to router-swift's `PyreonTabs` (TabView) / `PyreonSplit`
// (NavigationSplitView or a pushed compact detail); Android to
// runtime-kotlin's `PyreonTabs` (BottomNavigation / NavigationRail by window
// width) / `PyreonSplit` (two panes / one pane + BackHandler). The tab bar is
// built at COMPILE time from the literal `<Tab>` entries, so every shape that
// cannot be read statically must be NAMED, never dropped.

import { describe, expect, it } from 'vitest'
import { transform } from './first-party-plugins'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const SRC = `
import { Stack, Text, Button, Tabs, Tab, Split } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
export function NavApp() {
  const tab = signal('feed')
  const picked = signal('')
  return (
    <Tabs value={tab} onChange={(v) => tab.set(v)} data-testid="nav-tabs">
      <Tab value="feed" label="Feed" icon="home" data-testid="tab-feed">
        <Text data-testid="feed-body">feed</Text>
      </Tab>
      <Tab value="mail" label="Mail" icon="email" data-testid="tab-mail">
        <Split
          sidebar={<Stack><Button onPress={() => picked.set('a')} data-testid="mail-a">A</Button></Stack>}
          showDetail={picked() !== ''}
          onBack={() => picked.set('')}
          data-testid="mail-split"
        >
          <Text data-testid="mail-detail">{picked()}</Text>
          <Text>second</Text>
        </Split>
      </Tab>
    </Tabs>
  )
}
`

const ENUM_SRC = `
import { Text, Tabs, Tab } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
type Section = 'feed' | 'me'
export function EnumTabs() {
  const tab = signal<Section>('feed')
  return (
    <Tabs value={tab} onChange={(v) => tab.set(v)}>
      <Tab value="feed" label="Feed"><Text>a</Text></Tab>
      <Tab value="me" label="Me"><Text>b</Text></Tab>
    </Tabs>
  )
}
`

const EXPR_SRC = `
import { Text, Tabs, Tab } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
export function ExprTabs() {
  const state = signal({ tab: 'a' })
  return (
    <Tabs value={state().tab} onChange={(v) => state.set({ tab: v })}>
      <Tab value="a" label="A"><Text>a</Text></Tab>
      <Tab value="b" label="B"><Text>b</Text></Tab>
    </Tabs>
  )
}
`

describe('<Tabs> emit', () => {
  it('Swift: PyreonTabs over a two-way binding, items built at compile time, one case per tab', () => {
    const r = transform(SRC, { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('PyreonTabs(selection: $tab, items: [')
    expect(r.code).toContain('PyreonTabItem(value: "feed", label: "Feed", systemImage: "house.fill"),')
    expect(r.code).toContain('PyreonTabItem(value: "mail", label: "Mail", systemImage: "envelope.fill"),')
    expect(r.code).toContain('{ pyreonTab in')
    expect(r.code).toContain('case "feed":')
    expect(r.code).toContain('case "mail":')
    expect(r.code).toContain('.accessibilityElement(children: .contain).accessibilityIdentifier("nav-tabs")')
  })

  it('Kotlin: PyreonTabs with the item testTags and Material glyphs, one when-branch per tab', () => {
    const r = transform(SRC, { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('selected = tab,')
    expect(r.code).toContain('onSelect = { v -> tab = v },')
    expect(r.code).toContain(
      'PyreonTabItem(value = "feed", label = "Feed", icon = Icons.Filled.Home, testTag = "tab-feed"),',
    )
    expect(r.code).toContain('modifier = Modifier.testTag("nav-tabs"),')
    expect(r.code).toContain('when (pyreonTab) {')
    expect(r.code).toContain('"mail" -> {')
  })

  it('a string-literal-union selection uses the emitted enum on both targets', () => {
    const swift = transform(ENUM_SRC, { target: 'swift' })
    expect(swift.warnings).toEqual([])
    expect(swift.code).toContain('PyreonTabItem(value: Section.feed, label: "Feed"),')
    expect(swift.code).toContain('case Section.me:')
    const kotlin = transform(ENUM_SRC, { target: 'kotlin' })
    expect(kotlin.warnings).toEqual([])
    expect(kotlin.code).toContain('PyreonTabItem(value = Section.feed, label = "Feed"),')
    expect(kotlin.code).toContain('Section.me -> {')
  })

  it('a non-signal value + onChange becomes a custom Binding (Swift) / explicit onSelect (Kotlin)', () => {
    const swift = transform(EXPR_SRC, { target: 'swift' })
    expect(swift.code).toMatch(/PyreonTabs\(selection: Binding\(get: \{ state\.tab \}, set: \{ v in/)
    const kotlin = transform(EXPR_SRC, { target: 'kotlin' })
    expect(kotlin.code).toContain('selected = state.tab,')
  })

  it('several children of one tab are wrapped in ONE container on both targets', () => {
    const src = SRC.replace('<Text data-testid="feed-body">feed</Text>', '<Text>one</Text><Text>two</Text>')
    const swift = transform(src, { target: 'swift' }).code
    expect(swift).toMatch(/case "feed":\n\s+VStack\(spacing: 0\) \{/)
    const kotlin = transform(src, { target: 'kotlin' }).code
    expect(kotlin).toMatch(/"feed" -> \{\n\s+Column \{/)
  })

  it.each([
    [
      'a non-<Tab> child',
      `<Tabs value={tab} onChange={(v) => tab.set(v)}><Tab value="a" label="A"><Text>a</Text></Tab><Text>stray</Text></Tabs>`,
      'every child must be a literal <Tab',
    ],
    [
      'a computed value',
      `<Tabs value={tab} onChange={(v) => tab.set(v)}><Tab value={tab()} label="A"><Text>a</Text></Tab></Tabs>`,
      '`value` must be a string LITERAL',
    ],
    [
      'a duplicate value',
      `<Tabs value={tab} onChange={(v) => tab.set(v)}><Tab value="a" label="A"><Text>a</Text></Tab><Tab value="a" label="B"><Text>b</Text></Tab></Tabs>`,
      'a second tab with the same value is DROPPED',
    ],
    [
      'a missing label',
      `<Tabs value={tab} onChange={(v) => tab.set(v)}><Tab value="a"><Text>a</Text></Tab></Tabs>`,
      'no `label`',
    ],
    [
      'an unmapped icon',
      `<Tabs value={tab} onChange={(v) => tab.set(v)}><Tab value="a" label="A" icon="nope"><Text>a</Text></Tab></Tabs>`,
      'not in the canonical icon map',
    ],
    [
      'no selection binding',
      `<Tabs value={'a'}><Tab value="a" label="A"><Text>a</Text></Tab></Tabs>`,
      'needs `value` bound to a signal',
    ],
  ])('names %s on both targets', (_label, jsx, expected) => {
    const src = `import { Text, Tabs, Tab } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
export function W() {
  const tab = signal('a')
  return (${jsx})
}`
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(src, { target })
      expect(r.warnings.join('\n'), target).toContain(expected)
    }
  })

  it.skipIf(!isSwiftcAvailable())('Swift: the emit type-checks against the stubs (string + enum + expr shapes)', () => {
    for (const src of [SRC, ENUM_SRC, EXPR_SRC]) {
      const res = validateSwiftWithStubs(transform(src, { target: 'swift' }).code)
      expect(res.ok, res.error ?? '').toBe(true)
    }
  })

  it.skipIf(!isKotlincAvailable())('Kotlin: the emit compiles on kotlinc (string + enum + expr shapes)', () => {
    for (const src of [SRC, ENUM_SRC, EXPR_SRC]) {
      const res = validateKotlin(transform(src, { target: 'kotlin' }).code)
      expect(res.ok, res.error ?? '').toBe(true)
    }
  })
})

describe('<Split> emit', () => {
  it('Swift: PyreonSplit(showDetail:onBack:) { sidebar } detail: { detail }', () => {
    const r = transform(SRC, { target: 'swift' })
    expect(r.code).toContain('PyreonSplit(showDetail: picked != "", onBack: { picked = "" }) {')
    expect(r.code).toContain('} detail: {')
    expect(r.code).toContain('.accessibilityIdentifier("mail-split")')
  })

  it('Kotlin: PyreonSplit(showDetail, onBack, modifier, sidebar = { … }) { detail }', () => {
    const r = transform(SRC, { target: 'kotlin' })
    expect(r.code).toContain('showDetail = picked != "",')
    expect(r.code).toContain('onBack = { picked = "" },')
    expect(r.code).toContain('modifier = Modifier.testTag("mail-split"),')
    expect(r.code).toContain('sidebar = {')
  })

  it.each([
    ['no sidebar', `<Split showDetail={false} onBack={() => {}}><Text>d</Text></Split>`, 'no `sidebar`'],
    ['a non-JSX sidebar', `<Split sidebar={list} showDetail={false} onBack={() => {}}><Text>d</Text></Split>`, 'only a JSX literal'],
    ['no showDetail', `<Split sidebar={<Text>l</Text>} onBack={() => {}}><Text>d</Text></Split>`, 'no `showDetail`'],
    ['no onBack', `<Split sidebar={<Text>l</Text>} showDetail={false}><Text>d</Text></Split>`, 'no `onBack`'],
  ])('names %s on both targets', (_label, jsx, expected) => {
    const src = `import { Text, Split } from '@pyreon/primitives'
const list = 'x'
export function W() {
  return (${jsx})
}`
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(src, { target })
      expect(r.warnings.join('\n'), target).toContain(expected)
    }
  })

  it('a JSX sidebar is a CONSUMED slot — no "attribute is dropped" warning', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      expect(transform(SRC, { target }).warnings.join('\n')).not.toContain('JSX-valued `sidebar`')
    }
  })
})
