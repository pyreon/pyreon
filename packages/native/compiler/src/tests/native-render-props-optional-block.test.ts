// Two render-prop shapes that used to WARN instead of lowering (#3683's
// named residuals), now lowered on both targets:
//
// 1. An OPTIONAL render prop on iOS. A render prop is a generic
//    `@ViewBuilder` closure whose view type is inferred from the caller's
//    closure — so a caller that OMITS it leaves the generic with nothing to
//    infer from, and the prop was emitted REQUIRED with a warning. Now it is
//    stored as an optional closure, with one initializer per subset of the
//    optional slots, the omitted ones pinned to `EmptyView` by a constrained
//    extension (SwiftUI's own idiom for a defaulted view parameter). Android
//    already kept it a nullable composable lambda.
//
// 2. A BLOCK-bodied render callback — `(u) => { const n = …; if (!u) return
//    <A/>; return <B n/> }` — and the same body under a reactive-accessor
//    return. A view builder takes declarations and conditionals directly, so
//    `const` → `let`/`val`, an early-return branch → `if` / `if let`, and a
//    final `return` → the view. Both used to emit an EMPTY view.
//
// Bisect-load-bearing: see the PR body — neutering `planViewBlock` (return
// null) fails the block specs on both targets; restoring the required-slot
// emit (drop `emitSwiftOptionalSlotInits`) fails the Swift optional specs and
// the SDK compile with `generic parameter 'RenderContent' could not be
// inferred`.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  isSwiftUIAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const HEAD = `import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
import type { VNodeChild } from '@pyreon/core'
type User = { name: string; age: number }
type Item = { title: string; rank: number }
`

const swift = (src: string) => transform(HEAD + src, { target: 'swift' })
const kotlin = (src: string) => transform(HEAD + src, { target: 'kotlin' })

const CARD = `function Card(props: { title: string; header?: VNodeChild; children?: VNodeChild; footer?: (n: number) => VNodeChild }) {
  const n = signal(2)
  return (
    <Stack>
      {props.header}
      <Text>{props.title}</Text>
      {props.children}
      {props.footer ? props.footer(n()) : <Text>no footer</Text>}
    </Stack>
  )
}
`

describe('optional render props on iOS', () => {
  it('are stored as optional closures and invoked with `?`', () => {
    const { code, warnings } = swift(`${CARD}export function App() { return <Card title="t" /> }`)
    expect(warnings).toEqual([])
    expect(code).toContain('struct Card<HeaderContent: View, ChildrenContent: View, FooterContent: View>: View {')
    expect(code).toContain('  let header: (() -> HeaderContent)?')
    expect(code).toContain('  let footer: ((Int) -> FooterContent)?')
    expect(code).toContain('      header?()')
    expect(code).toContain('      children?()')
  })

  it('a presence test narrows to the unwrapped closure (no `?`)', () => {
    const { code } = swift(`${CARD}export function App() { return <Card title="t" /> }`)
    expect(code).toContain('if let footer {\n        footer(n)\n      } else {')
  })

  it('one initializer per subset, the omitted slots pinned to EmptyView', () => {
    const { code } = swift(`${CARD}export function App() { return <Card title="t" /> }`)
    // 3 optional slots → 8 initializers.
    expect(code.match(/^extension Card/gm)).toHaveLength(8)
    expect(code).toContain(
      'extension Card {\n  init(title: String, @ViewBuilder header: @escaping () -> HeaderContent, @ViewBuilder children: @escaping () -> ChildrenContent, @ViewBuilder footer: @escaping (Int) -> FooterContent) {',
    )
    expect(code).toContain(
      'extension Card where HeaderContent == EmptyView, ChildrenContent == EmptyView, FooterContent == EmptyView {\n  init(title: String) {\n    self.title = title\n    self.header = nil\n    self.children = nil\n    self.footer = nil\n  }',
    )
  })

  it('callers may omit or pass each slot', () => {
    const { code, warnings } = swift(`${CARD}export function App() {
  return <Stack><Card title="a" /><Card title="b" footer={(n) => <Text>{n}</Text>}><Text>kid</Text></Card></Stack>
}`)
    expect(warnings).toEqual([])
    expect(code).toContain('      Card(title: "a")')
    expect(code).toContain('      Card(title: "b", children: {')
  })

  it('forwarding an optional slot splits the call on presence', () => {
    const { code, warnings } = swift(`${CARD}function Pass(props: { footer?: (n: number) => VNodeChild }) {
  return <Card title="p" footer={props.footer} />
}
export function App() { return <Stack><Pass /><Pass footer={(n) => <Text>{n}</Text>} /></Stack> }`)
    expect(warnings).toEqual([])
    expect(code).toContain(
      '    Group {\n      if let footer {\n        Card(title: "p", footer: footer)\n      } else {\n        Card(title: "p")\n      }\n    }',
    )
  })

  it('beyond three optional slots it falls back to REQUIRED, and says why', () => {
    const src = `function Many(props: { a?: VNodeChild; b?: VNodeChild; c?: VNodeChild; d?: VNodeChild }) {
  return <Stack>{props.a}{props.b}{props.c}{props.d}</Stack>
}
export function App() { return <Many a={<Text>a</Text>} b={<Text>b</Text>} c={<Text>c</Text>} d={<Text>d</Text>} /> }`
    const out = swift(src)
    expect(out.warnings.join('\n')).toContain('it has 4 optional render props')
    expect(out.code).toContain('@ViewBuilder let a: () -> AContent')
    expect(out.code).toContain('      a()')
    expect(out.code).not.toContain('extension Many')
  })

  it('Android keeps nullable composable lambdas, with the same call sites', () => {
    const { code, warnings } = kotlin(`${CARD}function Pass(props: { footer?: (n: number) => VNodeChild }) {
  return <Card title="p" footer={props.footer} />
}
export function App() { return <Stack><Card title="a" /><Pass /></Stack> }`)
    expect(warnings).toEqual([])
    expect(code).toContain('footer: (@Composable (Int) -> Unit)? = null')
    expect(code).toContain('header?.invoke()')
    expect(code).toContain('Card(title = "p", footer = footer)')
  })
})

const DATA = `function UserData(props: { children: (data: User | undefined) => unknown }) {
  const u: User = { name: 'Ada', age: 36 }
  return props.children(u)
}
`

describe('block-bodied render callbacks', () => {
  const src = `${DATA}export function App() {
  return (
    <Stack>
      <UserData>{(u) => { const n = u?.name ?? '-'; const k = n.length; return <Text>{n}{k}</Text> }}</UserData>
      <UserData>{(u) => { if (!u) return <Text>none</Text>; const label = \`\${u.name} (\${u.age})\`; return <Text>{label}</Text> }}</UserData>
      <UserData>{(u) => { if (u === undefined) { return null } else { return <Text>{u.name}</Text> } }}</UserData>
    </Stack>
  )
}`

  it('Swift: locals become `let`s, an early return narrows to `if let`', () => {
    const { code, warnings } = swift(src)
    expect(warnings).toEqual([])
    expect(code).toContain('UserData(children: { u in\n        let n = (u?.name ?? "-")\n        let k = n.utf16.count\n        Text(')
    expect(code).toContain('        if let u {\n          let label = "\\(u.name) (\\(u.age))"\n          Text(verbatim: "\\(label)")\n        } else {\n          Text("none")\n        }')
    // `return null` renders nothing: the absent arm is dropped.
    expect(code).toContain('        if let u {\n          Text(verbatim: "\\(u.name)")\n        }\n      })')
    expect(code).not.toContain('EmptyView()')
  })

  it('Kotlin: locals become `val`s, a lambda parameter smart-casts', () => {
    const { code, warnings } = kotlin(src)
    expect(warnings).toEqual([])
    expect(code).toContain('UserData(children = { u ->\n      val n = (u?.name ?: "-")\n      val k = n.length\n      Text(')
    expect(code).toContain('      if (u == null) {\n        Text(text = "none")\n      } else {\n        val label = "${u.name} (${u.age})"')
  })

  it('Kotlin binds a subject it cannot smart-cast (a data-class field) before the branch', () => {
    const src2 = `type Profile = { nick?: string }
function ProfileView(props: { profile: Profile; render: (p: Profile) => VNodeChild }) { return props.render(props.profile) }
export function App() {
  return <ProfileView profile={{ nick: 'ada' }} render={(p) => { if (!p.nick) return <Text>anon</Text>; return <Text>{p.nick.toUpperCase()}</Text> }} />
}`
    const kt = kotlin(src2)
    expect(kt.warnings).toEqual([])
    expect(kt.code).toMatch(/val nick = p\.nick\?\.takeIf \{ it\.isNotEmpty\(\) \}\n\s+if \(nick != null\) \{\n\s+Text\(text = "\$\{nick\.uppercase\(\)\}"\)/)
    const sw = swift(src2)
    expect(sw.warnings).toEqual([])
    expect(sw.code).toContain('if let nick = p.nick, !nick.isEmpty {')
  })

  it('a block with something a view builder cannot take is still NAMED', () => {
    const bad = `${DATA}export function App() {
  return <UserData>{(u) => { let n = 0; n = n + 1; return <Text>{n}</Text> }}</UserData>
}`
    for (const out of [swift(bad), kotlin(bad)]) {
      expect(out.warnings.join('\n')).toContain("this render callback's BLOCK body")
    }
  })
})

describe('block-bodied reactive-accessor return', () => {
  const src = `export function Acc() {
  const s = signal(1)
  return () => { const t = s() + 1; if (t > 3) return <Text>big</Text>; return <Text>{t}</Text> }
}`

  it('Swift: the block is the body, wrapped in one Group', () => {
    const { code, warnings } = swift(src)
    expect(warnings).toEqual([])
    expect(code).toContain('  var body: some View {\n    Group {\n      let t = s + 1\n      if t > 3 {\n        Text("big")\n      } else {')
  })

  it('Kotlin: the block is the composable body', () => {
    const { code, warnings } = kotlin(src)
    expect(warnings).toEqual([])
    expect(code).toContain('  val t = s + 1\n  if (t > 3) {\n    Text(text = "big")\n  } else {')
  })

  it('a render prop invoked from a block accessor makes the prop a slot', () => {
    const src2 = `function Live(props: { children: (n: number) => unknown }) {
  const n = signal(0)
  return () => { const doubled = n() * 2; return props.children(doubled) }
}
export function App() { return <Live>{(n) => <Text>{n}</Text>}</Live> }`
    const sw = swift(src2)
    expect(sw.warnings).toEqual([])
    expect(sw.code).toContain('@ViewBuilder let children: (Int) -> ChildrenContent')
    expect(sw.code).toContain('      let doubled = n * 2\n      children(doubled)')
  })
})

// ---------------------------------------------------------------------------
// Compile gates: one fixture covering every shape above.

const BROAD = `${DATA}${CARD}
type Profile = { nick?: string }
function ProfileView(props: { profile: Profile; render: (p: Profile) => VNodeChild }) { return props.render(props.profile) }
function Pass(props: { footer?: (n: number) => VNodeChild }) {
  return <Card title="pass" footer={props.footer} />
}
function List(props: { row?: (it: Item) => VNodeChild }) {
  return <Card title="list" footer={(k) => <Text>{k}</Text>}>{props.row?.({ title: 'x', rank: 1 })}</Card>
}
function Live(props: { children: (n: number) => unknown }) {
  const n = signal(0)
  return () => { const doubled = n() * 2; if (doubled > 10) return <Text>max</Text>; return props.children(doubled) }
}
export function App() {
  return (
    <Stack>
      <Card title="bare" />
      <Card title="kids"><Text>body</Text></Card>
      <Card title="all" header={<Text>H</Text>} footer={(n) => { const d = n * 2; if (d > 3) return <Text>big {d}</Text>; return <Text>{d}</Text> }}><Text>b</Text></Card>
      <Pass />
      <Pass footer={(n) => <Text>{n}</Text>} />
      <List />
      <List row={(it) => { if (it.rank < 0) return null; return <Text>{it.title}</Text> }} />
      <UserData>{(u) => { if (!u) return <Text>none</Text>; const label = \`\${u.name} (\${u.age})\`; return <Text>{label}</Text> }}</UserData>
      <UserData>{(u) => { if (u === undefined) { return null } else { return <Text>{u.name}</Text> } }}</UserData>
      <ProfileView profile={{ nick: 'ada' }} render={(p) => { if (!p.nick) return <Text>anon</Text>; return <Text>{p.nick.toUpperCase()}</Text> }} />
      <Live>{(n) => <Text>{n}</Text>}</Live>
    </Stack>
  )
}
`

describe('the emit compiles', () => {
  it('no warnings on either target', () => {
    expect(swift(BROAD).warnings).toEqual([])
    expect(kotlin(BROAD).warnings).toEqual([])
  })

  it.skipIf(!isSwiftcAvailable())('Swift: against the stubs', () => {
    const r = validateSwiftWithStubs(swift(BROAD).code)
    expect(r.ok, r.error ?? '').toBe(true)
  }, 120_000)

  it.skipIf(!isKotlincAvailable())('Kotlin: on kotlinc', () => {
    const r = validateKotlin(kotlin(BROAD).code)
    expect(r.ok, r.error ?? '').toBe(true)
  }, 300_000)

  // The stubs cannot fake SwiftUI's generic inference through a constrained
  // extension initializer, which is the whole mechanism — so the real SDK is
  // the load-bearing compile for the optional-slot half.
  it.runIf(isSwiftUIAvailable())('Swift: against the real iOS SDK', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pyreon-render-props-opt-'))
    try {
      const file = join(dir, 'OptionalSlots.swift')
      writeFileSync(file, `import SwiftUI\nimport Foundation\n${swift(BROAD).code}`, 'utf8')
      const sdk = execFileSync('xcrun', ['--sdk', 'iphonesimulator', '--show-sdk-path'], { encoding: 'utf8' }).trim()
      try {
        execFileSync(
          'xcrun',
          ['--sdk', 'iphonesimulator', 'swiftc', '-typecheck', '-target', 'arm64-apple-ios17.0-simulator', '-sdk', sdk, file],
          { encoding: 'utf8', stdio: 'pipe' },
        )
      } catch (err) {
        const e = err as { stderr?: string | Buffer; stdout?: string | Buffer }
        const out = [e.stderr, e.stdout].map((x) => (typeof x === 'string' ? x : x?.toString('utf8')) ?? '').join('\n')
        expect.fail(`swiftc -typecheck failed:\n${out.split('\n').filter((l) => l.includes('error:')).slice(0, 12).join('\n')}`)
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 300_000)
})
