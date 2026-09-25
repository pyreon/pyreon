// Render props, function-as-children and view slots on iOS + Android.
//
// A view-typed prop was lowered as a VALUE on both targets:
//
//   Swift   `let children: (User?) -> Void`, and the call site interpolated
//           the callback into `Text(verbatim: "\({ user in … })")` — a
//           closure's debug description on screen, or a type error.
//   Kotlin  `children: (User?) -> Unit` — not `@Composable`, so the lambda
//           the caller passes cannot call `Text` — and the same stringified
//           closure at the call site.
//   Both    `children: VNodeChild` reached the target as a type name neither
//           has, and `{props.children}` was stringified.
//
// Zero warnings on any of it. `@pyreon/lathe`'s generated `<Op>Data`
// components are exactly this shape, so none of them built for iOS.
//
// The lowering is the platforms' own container idiom: a generic
// `@ViewBuilder let x: (T) -> C` (C a type parameter inferred from the
// caller) on iOS, `x: @Composable (T) -> Unit` on Android.
//
// Bisect-load-bearing: neutering `slotPropsOf` (return []) fails the
// declaration, invocation and call-site specs on both targets, and the
// stub + real-SDK compiles fail with the original `(User?) -> Void` /
// debug-description emit.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  isSwiftUIAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const HEAD = `import { Stack, Text } from '@pyreon/primitives'
import type { VNodeChild } from '@pyreon/core'
type User = { name: string; age: number }
`

const swift = (src: string) => transform(HEAD + src, { target: 'swift' })
const kotlin = (src: string) => transform(HEAD + src, { target: 'kotlin' })

/** The lathe `<Op>Data` shape: `children: (data: T | undefined) => unknown`, returned from the body. */
const DATA = `function UserData(props: { children: (data: User | undefined) => unknown }) {
  const u: User = { name: 'Ada', age: 36 }
  return props.children(u)
}
`

describe('the receiving component', () => {
  it('Swift: a generic @ViewBuilder closure, invoked in the body', () => {
    const { code, warnings } = swift(`${DATA}export function App() { return <UserData>{(u) => <Text>{u?.name ?? '-'}</Text>}</UserData> }`)
    expect(warnings).toEqual([])
    expect(code).toContain('struct UserData<ChildrenContent: View>: View {')
    expect(code).toContain('@ViewBuilder let children: (User?) -> ChildrenContent')
    expect(code).toContain('    children(u)')
    expect(code).not.toContain('-> Void')
  })

  it('Kotlin: a @Composable lambda parameter, invoked in the body', () => {
    const { code, warnings } = kotlin(`${DATA}export function App() { return <UserData>{(u) => <Text>{u?.name ?? '-'}</Text>}</UserData> }`)
    expect(warnings).toEqual([])
    expect(code).toContain('fun UserData(children: @Composable (User?) -> Unit)')
    expect(code).toContain('  children(u)')
  })

  it('a declared VNodeChild return is a slot even when the body does not render it directly', () => {
    const src = `function Row(props: { cell: (n: number) => VNodeChild }) { return <Stack /> }
export function App() { return <Row cell={(n) => <Text>{n}</Text>} /> }`
    expect(swift(src).code).toContain('@ViewBuilder let cell: (Int) -> CellContent')
    expect(kotlin(src).code).toContain('cell: @Composable (Int) -> Unit')
  })

  it('a function prop returning a VALUE is not a slot', () => {
    const src = `function Price(props: { format: (n: number) => string }) { return <Text>{props.format(3)}</Text> }
export function App() { return <Price format={(n) => String(n)} /> }`
    const sw = swift(src).code
    expect(sw).toContain('let format: (Int) -> String')
    expect(sw).not.toContain('@ViewBuilder')
    expect(kotlin(src).code).toContain('format: (Int) -> String')
  })

  it('an unknown-return function prop the body never renders is not a slot', () => {
    const src = `function Btn(props: { onTap: () => unknown }) { return <Text>x</Text> }
export function App() { return <Btn onTap={() => 1} /> }`
    expect(swift(src).code).not.toContain('@ViewBuilder')
    expect(kotlin(src).code).not.toContain('@Composable ()')
  })

  it('a bare `children: VNodeChild` slot is a zero-argument closure, read as a call', () => {
    const src = `function Card(props: { title: string; children: VNodeChild }) {
  return <Stack><Text>{props.title}</Text>{props.children}</Stack>
}
export function App() { return <Card title="t"><Text>body</Text></Card> }`
    const sw = swift(src)
    expect(sw.warnings).toEqual([])
    expect(sw.code).toContain('@ViewBuilder let children: () -> ChildrenContent')
    expect(sw.code).toContain('      children()')
    expect(sw.code).toContain('Card(title: "t", children: {')
    expect(sw.code).not.toContain('VNodeChild')
    const kt = kotlin(src)
    expect(kt.code).toContain('children: @Composable () -> Unit')
    expect(kt.code).toContain('    children()')
    expect(kt.code).toContain('Card(title = "t", children = {')
    expect(kt.code).not.toContain('VNodeChild')
  })
})

describe('the call site', () => {
  const PICKER = `function Picker(props: { label: string; render: (item: { title: string; rank: number }) => VNodeChild }) {
  return <Stack><Text>{props.label}</Text>{props.render({ title: 'x', rank: 1 })}</Stack>
}
`

  it('children form, inline arrow', () => {
    const src = `${DATA}export function App() { return <UserData>{(user) => <Text>{user?.name ?? 'none'}</Text>}</UserData> }`
    expect(swift(src).code).toContain('UserData(children: { user in\n')
    expect(kotlin(src).code).toContain('UserData(children = { user ->\n')
    // never a stringified closure
    expect(swift(src).code).not.toContain('Text(verbatim: "\\({')
    expect(kotlin(src).code).not.toContain('Text(text = "${{')
  })

  it('prop form, inline arrow with a view ternary body', () => {
    const src = `${PICKER}export function App() {
  return <Picker label="p" render={(it) => (it.rank > 0 ? <Text>{it.title}</Text> : <Text>none</Text>)} />
}`
    const sw = swift(src).code
    expect(sw).toContain('Picker(label: "p", render: { it in')
    expect(sw).toContain('if it.rank > 0 {')
    expect(kotlin(src).code).toContain('Picker(label = "p", render = { it ->')
  })

  it('a callback that declares FEWER parameters than it is passed pads with `_`', () => {
    const src = `${PICKER}export function App() { return <Picker label="p" render={() => <Text>x</Text>} /> }`
    expect(swift(src).code).toContain('render: { _ in')
    expect(kotlin(src).code).toContain('render = { _ ->')
  })

  it('named reference: a component-scope JSX function', () => {
    const src = `${DATA}export function App() {
  const renderUser = (u: User | undefined) => <Text>{u?.name ?? 'local'}</Text>
  return <UserData>{renderUser}</UserData>
}`
    const sw = swift(src)
    expect(sw.warnings).toEqual([])
    expect(sw.code).toContain('@ViewBuilder private func renderUser(_ u: User?) -> some View {')
    expect(sw.code).toContain('UserData(children: { a0 in renderUser(a0) })')
    const kt = kotlin(src)
    expect(kt.warnings).toEqual([])
    expect(kt.code).toContain('  @Composable\n  fun renderUser(u: User?) {')
    // never `::renderUser` — Compose rejects references to @Composable functions
    expect(kt.code).toContain('UserData(children = { a0 -> renderUser(a0) })')
  })

  it('named reference: a file-scope JSX arrow', () => {
    const src = `${DATA}const renderUser = (u: User | undefined) => <Text>{u?.name ?? 'top'}</Text>
export function App() { return <UserData>{renderUser}</UserData> }`
    const sw = swift(src)
    expect(sw.warnings).toEqual([])
    expect(sw.code).toContain('@ViewBuilder private func renderUser(_ u: User?) -> some View {')
    expect(sw.code).not.toContain('private let renderUser')
    const kt = kotlin(src)
    expect(kt.code).toContain('@Composable\nprivate fun renderUser(u: User?) {')
    expect(kt.code).not.toContain('private val renderUser')
  })

  it('a render prop FORWARDED from the enclosing component passes through', () => {
    const src = `${PICKER}function Shell(props: { render: (item: { title: string; rank: number }) => VNodeChild }) {
  return <Picker label="fwd" render={props.render} />
}
export function App() { return <Shell render={(it) => <Text>{it.title}</Text>} /> }`
    expect(swift(src).code).toContain('Picker(label: "fwd", render: render)')
    expect(kotlin(src).code).toContain('Picker(label = "fwd", render = render)')
  })

  it('a component from ANOTHER file is lowered from the callback shape alone', () => {
    // `GetBookData` is not declared here — the generated-client case.
    const src = `export function Screen() { return <GetBookData bookId="1">{(b: User | undefined) => <Text>{b?.name ?? '…'}</Text>}</GetBookData> }`
    expect(swift(src).code).toContain('GetBookData(bookId: "1", children: { b in')
    expect(kotlin(src).code).toContain('GetBookData(bookId = "1", children = { b ->')
  })
})

describe('typed parameter structs', () => {
  it('an inline object parameter type is lifted to ONE struct the body literal constructs', () => {
    const src = `function Picker(props: { render: (item: { title: string; rank: number }) => VNodeChild }) {
  return <Stack>{props.render({ title: 'x', rank: 1 })}</Stack>
}
export function App() { return <Picker render={(it) => <Text>{it.title}</Text>} /> }`
    const sw = swift(src).code
    expect(sw).toContain('struct PickerRenderItem: Codable {')
    expect(sw).toContain('@ViewBuilder let render: (PickerRenderItem) -> RenderContent')
    expect(sw).toContain('render(PickerRenderItem(title: "x", rank: 1))')
    const kt = kotlin(src).code
    expect(kt).toContain('data class PickerRenderItem(')
    expect(kt).toContain('render(PickerRenderItem(title = "x", rank = 1))')
  })

  it('the same shape in two components is one struct (TS is structural)', () => {
    const src = `function A(props: { render: (item: { title: string }) => VNodeChild }) { return <Stack>{props.render({ title: 'a' })}</Stack> }
function B(props: { render: (item: { title: string }) => VNodeChild }) { return <A render={props.render} /> }
export function App() { return <B render={(it) => <Text>{it.title}</Text>} /> }`
    const sw = swift(src).code
    expect(sw).toContain('struct ARenderItem')
    expect(sw).not.toContain('struct BRenderItem')
    expect(sw).toContain('@ViewBuilder let render: (ARenderItem) -> RenderContent')
  })
})

describe('shapes that do not lower are NAMED', () => {
  it('a block-bodied render callback', () => {
    const src = `${DATA}export function App() {
  return <UserData>{(u) => { const n = u?.name ?? '-'; return <Text>{n}</Text> }}</UserData>
}`
    for (const out of [swift(src), kotlin(src)]) {
      expect(out.warnings.join('\n')).toContain('a render callback with a BLOCK body')
    }
    expect(swift(src).code).toContain('UserData(children: { _ in EmptyView() })')
  })

  it('a render prop value PMTC cannot see into', () => {
    const src = `${DATA}function pick(): (u: User | undefined) => unknown { return (u) => null }
export function App() { return <UserData children={pick()} /> }`
    for (const out of [swift(src), kotlin(src)]) {
      expect(out.warnings.join('\n')).toContain('this render prop is not an inline arrow')
    }
  })

  it('Swift: an OPTIONAL render prop (Kotlin keeps it optional)', () => {
    const src = `function Opt(props: { render?: (n: number) => VNodeChild }) { return <Stack>{props.render?.(1)}</Stack> }
export function App() { return <Opt render={(n) => <Text>{n}</Text>} /> }`
    expect(swift(src).warnings.join('\n')).toContain('the render prop `render` is OPTIONAL')
    const kt = kotlin(src)
    expect(kt.warnings).toEqual([])
    expect(kt.code).toContain('render: (@Composable (Int) -> Unit)? = null')
    expect(kt.code).toContain('render?.invoke(1)')
  })
})

describe('the reactive-accessor return (`return () => …`)', () => {
  // The web idiom for a component whose output reads a signal — and the only
  // shape of a data component that stays LIVE on the web, since a component
  // body runs once there. Native re-runs the body anyway, so the accessor's
  // body IS the view; it used to reach both targets as a closure literal.
  it('unwraps to the view on both targets', () => {
    const src = `import { signal } from '@pyreon/reactivity'
function Live(props: { children: (n: number) => unknown }) {
  const n = signal(0)
  return () => props.children(n())
}
export function App() { return <Live>{(n) => <Text>{n}</Text>}</Live> }`
    const sw = swift(src)
    expect(sw.warnings).toEqual([])
    expect(sw.code).toContain('  var body: some View {\n    children(n)\n')
    expect(sw.code).not.toContain('{ children(n) }')
    const kt = kotlin(src)
    expect(kt.code).toContain('  children(n)\n}')
    expect(kt.code).not.toContain('{ children(n) }')
  })

  it('a view ternary under the accessor lowers to if/else', () => {
    const src = `import { signal } from '@pyreon/reactivity'
export function App() { const s = signal(1); return () => (s() > 0 ? <Text>a</Text> : <Stack />) }`
    expect(swift(src).code).toContain('if s > 0 {')
  })

  it('a BLOCK-bodied accessor is named, not emitted as a closure', () => {
    const src = `import { signal } from '@pyreon/reactivity'
export function App() { const s = signal(1); return () => { const t = s() + 1; return <Text>{t}</Text> } }`
    const out = swift(src)
    expect(out.warnings.join('\n')).toContain('returns a reactive accessor with a BLOCK body')
    expect(out.code).toContain('EmptyView()')
  })
})

describe('a JSX function called in view position renders (was an EmptyView)', () => {
  it('both targets', () => {
    const src = `export function App() {
  const row = (u: User) => <Text>{u.name}</Text>
  return <Stack>{row({ name: 'a', age: 1 })}</Stack>
}`
    const sw = swift(src)
    expect(sw.warnings).toEqual([])
    expect(sw.code).toContain('      row(User(name: "a", age: 1))')
    const kt = kotlin(src)
    expect(kt.warnings).toEqual([])
    expect(kt.code).toContain('    row(User(name = "a", age = 1))')
  })
})

// ---------------------------------------------------------------------------
// Compile gates. The broad fixture covers every lowered shape at once.

const BROAD = `${DATA}
const renderTop = (u: User | undefined) => <Text>{u?.name ?? 'top'}</Text>
function Picker(props: { label: string; render: (item: { title: string; rank: number }) => VNodeChild }) {
  return <Stack><Text>{props.label}</Text>{props.render({ title: 'x', rank: 1 })}</Stack>
}
function Card(props: { title: string; children: VNodeChild }) {
  return <Stack><Text>{props.title}</Text>{props.children}</Stack>
}
function Shell(props: { render: (item: { title: string; rank: number }) => VNodeChild }) {
  return <Picker label="fwd" render={props.render} />
}
function Opt(props: { render?: (n: number) => VNodeChild }) {
  return <Stack>{props.render?.(1)}</Stack>
}
export function App() {
  const renderLocal = (u: User | undefined) => <Text>{u?.name ?? 'local'}</Text>
  return (
    <Stack>
      <UserData>{(user) => <Text>{user?.name ?? 'none'}</Text>}</UserData>
      <UserData>{renderTop}</UserData>
      <UserData>{renderLocal}</UserData>
      <Picker label="p" render={(it) => (it.rank > 0 ? <Text>{it.title}</Text> : <Text>none</Text>)} />
      <Picker label="q" render={() => <Text>ignored</Text>} />
      <Card title="c"><Text>body</Text></Card>
      <Shell render={(it) => <Text>{it.title}</Text>} />
      <Opt render={(n) => <Text>{n}</Text>} />
      {renderLocal(undefined)}
    </Stack>
  )
}
`

describe('the emit compiles', () => {
  it.skipIf(!isSwiftcAvailable())('Swift: against the stubs', () => {
    const r = validateSwiftWithStubs(swift(BROAD).code)
    expect(r.ok, r.error ?? '').toBe(true)
  }, 120_000)

  it.skipIf(!isKotlincAvailable())('Kotlin: on kotlinc', () => {
    const { code, warnings } = kotlin(BROAD)
    expect(warnings).toEqual([])
    const r = validateKotlin(code)
    expect(r.ok, r.error ?? '').toBe(true)
  }, 300_000)
})

/**
 * The stubs cannot fake `@ViewBuilder` on a stored closure property carrying
 * into the memberwise initializer, the `some View` result of a view helper
 * satisfying a generic closure parameter, or `PyreonQuery` from the real
 * runtime — so the same emits are compiled against the real iOS SDK with the
 * real runtime sources linked in. The lathe pair is TWO modules, compiled as
 * the app does (one Swift module), which is the cross-file case for real.
 */
describe.runIf(isSwiftUIAvailable())('the emit compiles against the real SDK + runtime', () => {
  const REPO = resolve(import.meta.dirname, '../../../../..')
  const runtimeSources = (): string[] => {
    const out: string[] = []
    const walk = (dir: string): void => {
      let entries: string[]
      try {
        entries = readdirSync(dir)
      } catch {
        return
      }
      for (const e of entries) {
        if (e === 'node_modules' || e === 'lib' || e === '.build' || e === 'Package.swift') continue
        if (e.toLowerCase() === 'tests' || /Tests?\.swift$/.test(e)) continue
        const p = join(dir, e)
        if (statSync(p).isDirectory()) walk(p)
        else if (p.endsWith('.swift')) out.push(p)
      }
    }
    for (const r of ['packages/fundamentals', 'packages/core', 'packages/native/runtime-swift', 'packages/native/router-swift']) {
      walk(join(REPO, r))
    }
    return out
  }

  it('BROAD fixture + the lathe bookshelf data components and their consumer', () => {
    const sources = runtimeSources()
    // An empty list would make the compile vacuously succeed.
    expect(sources.length).toBeGreaterThan(40)
    const fixture = (f: string) => readFileSync(join(import.meta.dirname, '../fixtures', f), 'utf8')
    const books = transform(fixture('render-props-lathe-books.tsx'), { target: 'swift' })
    const screen = transform(fixture('render-props-lathe-consumer.tsx'), { target: 'swift' })
    expect(books.warnings).toEqual([])
    expect(screen.warnings).toEqual([])
    const broad = swift(BROAD).code
    const dir = mkdtempSync(join(tmpdir(), 'pyreon-render-props-'))
    try {
      const files = [broad, books.code, screen.code].map((code, i) => {
        const p = join(dir, `RenderProps${i}.swift`)
        writeFileSync(p, `import SwiftUI\nimport Foundation\n${code}`, 'utf8')
        return p
      })
      const sdk = execFileSync('xcrun', ['--sdk', 'iphonesimulator', '--show-sdk-path'], { encoding: 'utf8' }).trim()
      try {
        execFileSync(
          'xcrun',
          ['--sdk', 'iphonesimulator', 'swiftc', '-typecheck', '-target', 'arm64-apple-ios17.0-simulator', '-sdk', sdk, ...files, ...sources],
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
