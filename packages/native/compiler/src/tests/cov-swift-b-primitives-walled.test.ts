// Branch-coverage matrices for the Swift PRIMITIVE emitters and the walled
// tags (`<Suspense>` / `<ErrorBoundary>` / `<KeepAlive>`), plus the dispatch
// arms that route a tag to its own emitter.
//
// The primitives are "special-case emitters that never reach the generic
// modifier tail" (the Link/Toggle lesson), so each pairs its match shape with
// the shape that BAILS to `emitSwiftGeneric` — a bail is the emit saying the
// element will not compile natively, and it must be reachable by a test.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

function tx(jsxBody: string, extra = ''): { code: string; warnings: string[] } {
  return transform(
    `import { Stack, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
export function App() {
  const draft = signal<string>('')
  const done = signal<boolean>(false)
  const fn = () => {}
${extra}
  return (${jsxBody})
}`,
    { target: 'swift' },
  )
}

describe('<TextField> — the signal-binding pattern and its fallthrough', () => {
  it('value is a bare identifier naming a signal → the $-binding form', () => {
    const { code } = tx(`<TextField value={draft} placeholder="what?" />`)
    expect(code).toContain('TextField("what?", text: $draft)')
  })

  it('no placeholder attr → the empty-string default', () => {
    expect(tx(`<TextField value={draft} />`).code).toContain('TextField("", text: $draft)')
  })

  it('a NON-LITERAL placeholder also takes the empty-string default', () => {
    // The placeholder arm is `placeholderAttr && kind === 'literal'`; a
    // signal-valued placeholder fails the second half.
    expect(tx(`<TextField value={draft} placeholder={draft} />`).code).toContain(
      'TextField("", text: $draft)',
    )
  })

  it('value is NOT a signal identifier → the generic emit, not a binding', () => {
    const { code } = tx(`<TextField value="fixed" placeholder="p" />`)
    expect(code).not.toContain('text: $')
    expect(code).toContain('TextField(')
  })

  it('NO value attr at all → the generic emit', () => {
    expect(tx(`<TextField placeholder="p" />`).code).not.toContain('text: $')
  })

  it('onKeyDown Enter+&& → .onSubmit; a different key does NOT', () => {
    const enter = tx(
      `<TextField value={draft} onKeyDown={(ev) => ev.key === 'Enter' && fn()} />`,
    ).code
    expect(enter).toContain('.onSubmit {')

    const escape = tx(
      `<TextField value={draft} onKeyDown={(ev) => ev.key === 'Escape' && fn()} />`,
    ).code
    expect(escape).not.toContain('.onSubmit')
  })

  it('the Enter matcher rejects every structural near-miss', () => {
    // Each of these fails a DIFFERENT guard inside extractEnterSubmitAction:
    //   zero params / non-`&&` body / `!==` comparison / a non-`key` member /
    //   a member on a DIFFERENT identifier.
    const shapes = [
      `onKeyDown={() => fn()}`,
      `onKeyDown={(ev) => ev.key === 'Enter' || fn()}`,
      `onKeyDown={(ev) => ev.key !== 'Enter' && fn()}`,
      `onKeyDown={(ev) => ev.code === 'Enter' && fn()}`,
      `onKeyDown={(ev) => draft.key === 'Enter' && fn()}`,
      `onKeyDown={(ev) => ev.key === 13 && fn()}`,
    ]
    for (const s of shapes) {
      expect(tx(`<TextField value={draft} ${s} />`).code, s).not.toContain('.onSubmit')
    }
  })

  it('a non-arrow onKeyDown handler is rejected', () => {
    expect(tx(`<TextField value={draft} onKeyDown={fn} />`).code).not.toContain('.onSubmit')
  })
})

describe('<Checkbox> — the checked attr and its absence', () => {
  it('checked present → the conditional systemName', () => {
    expect(tx(`<Checkbox checked={done} />`).code).toContain(
      'Image(systemName: done ? "checkmark.square.fill" : "square")',
    )
  })

  it('checked ABSENT → the empty-square degrade', () => {
    const { code } = tx(`<Checkbox />`)
    expect(code).toContain('Image(systemName: "square")')
    expect(code).not.toContain('checkmark.square.fill')
  })
})

describe('<Text> — the children-count and segment arms', () => {
  it('NO children → Text("")', () => {
    expect(tx(`<Text></Text>`).code).toContain('Text("")')
  })

  it('a single TEXT child → the literal form', () => {
    expect(tx(`<Text>hello</Text>`).code).toContain('Text("hello")')
  })

  it('a template child splices its quasis into the Text interpolation', () => {
    const { code } = tx('<Text>{`Hi ${draft()}`}</Text>')
    expect(code).toContain('Text(verbatim: "Hi \\(draft)")')
  })

  it('mixed text + expression children each take their own segment arm', () => {
    const { code } = tx(`<Text>a{draft()}b</Text>`)
    expect(code).toContain('Text(verbatim: "a\\(draft)b")')
  })
})

describe('<Heading> / <Icon> — token-table lookups and their fallbacks', () => {
  it('a known level maps through HEADING_FONT; an UNKNOWN one falls back', () => {
    const known = tx(`<Heading level={2}>T</Heading>`).code
    expect(known).toContain('.font(')

    // Level 9 is outside the 1..6 table — the `?? '.largeTitle'` arm.
    const unknown = tx(`<Heading level={9}>T</Heading>`).code
    expect(unknown).toContain('.largeTitle')
  })

  it('a NON-NUMERIC level falls back to level 1 inside the lookup', () => {
    expect(tx(`<Heading level="two">T</Heading>`).code).toContain('.font(')
  })

  it('Heading with no children emits the empty Text', () => {
    expect(tx(`<Heading level={1}></Heading>`).code).toContain('Text("")')
  })

  it('Icon size: a known token vs an unknown one (the `?? .medium` arm)', () => {
    expect(tx(`<Icon name="star" size="lg" />`).code).toContain('.imageScale(')
    expect(tx(`<Icon name="star" size="nonsense" />`).code).toContain('.medium')
  })
})

describe('walled tags — <Suspense> / <ErrorBoundary> / <KeepAlive>', () => {
  it('Suspense WITH a JSX fallback emits the real if/else, not the walled comment', () => {
    const { code } = tx(`<Suspense fallback={<Text>wait</Text>}><Text>body</Text></Suspense>`)
    expect(code).toContain('Group {')
    expect(code).toContain('if false {')
    expect(code).not.toContain('unsupported on iOS')
  })

  it('Suspense with a NON-JSX fallback warns and walls', () => {
    const { code, warnings } = tx(
      `<Suspense fallback={draft()}><Text>body</Text></Suspense>`,
    )
    expect(warnings.some((w) => w.includes('only JSX-literal fallback is supported'))).toBe(true)
    expect(code).toContain('unsupported on iOS')
  })

  it('Suspense with NO fallback walls WITHOUT the JSX-literal warning', () => {
    const { code, warnings } = tx(`<Suspense><Text>body</Text></Suspense>`)
    expect(code).toContain('unsupported on iOS')
    expect(warnings.some((w) => w.includes('only JSX-literal fallback'))).toBe(false)
    // No `fallback` attr → nothing in droppableProps → no dropped-prop warning.
    expect(warnings.some((w) => w.includes('dropped prop(s)'))).toBe(false)
  })

  it('the DROPPED-PROP warning names the per-tag limitation sentence', () => {
    const sus = tx(`<Suspense fallback={draft()}><Text>b</Text></Suspense>`).warnings.join('\n')
    expect(sus).toContain('fallback never shows during async loads')

    const eb = tx(`<ErrorBoundary fallback={draft()}><Text>b</Text></ErrorBoundary>`).warnings.join(
      '\n',
    )
    expect(eb).toContain('fallback never shows on render errors')

    // `when` is honoured by the real KeepAlive wrapper, so the DROPPED-prop
    // arm needs one of the props that genuinely has nowhere to go.
    const ka = tx(`<KeepAlive include="a"><Text>b</Text></KeepAlive>`).warnings.join('\n')
    expect(ka).toContain('cache behaviour is inert')
  })

  it('ErrorBoundary WITH a JSX fallback emits the real if/else', () => {
    const { code, warnings } = tx(
      `<ErrorBoundary fallback={<Text>bad</Text>}><Text>ok</Text></ErrorBoundary>`,
    )
    expect(code).toContain('Group {')
    expect(warnings.some((w) => w.includes('only JSX-literal fallback'))).toBe(false)
  })

  it('ErrorBoundary with NO fallback walls quietly', () => {
    const { code, warnings } = tx(`<ErrorBoundary><Text>ok</Text></ErrorBoundary>`)
    expect(code).toContain('unsupported on iOS')
    expect(warnings.some((w) => w.includes('only JSX-literal fallback'))).toBe(false)
  })

  it('a KeepAlive with NO droppable prop emits no dropped-prop warning', () => {
    const { code, warnings } = tx(`<KeepAlive><Text>b</Text></KeepAlive>`)
    expect(code).toContain('unsupported on iOS')
    expect(warnings.some((w) => w.includes('dropped prop(s)'))).toBe(false)
  })
})

describe('transparent / permissions providers — the children-count arms', () => {
  it('QueryClientProvider with children emits a Group; with NONE, EmptyView()', () => {
    expect(tx(`<QueryClientProvider><Text>x</Text></QueryClientProvider>`).code).toContain(
      'Group {',
    )
    expect(tx(`<QueryClientProvider></QueryClientProvider>`).code).toContain('EmptyView()')
  })

  it('PermissionsProvider: a literal map bakes the grant set; children-less → EmptyView', () => {
    const withKids = tx(
      `<PermissionsProvider permissions={{ 'posts.read': true }}><Text>x</Text></PermissionsProvider>`,
    ).code
    expect(withKids).toContain('PyreonPermissions(["posts.read"])')
    expect(withKids).toContain('Group {')

    const bare = tx(
      `<PermissionsProvider permissions={{ 'posts.read': true }}></PermissionsProvider>`,
    ).code
    expect(bare).toContain('EmptyView().environment(\\.pyreonPermissions')
  })

  it('a NON-LITERAL permissions map warns that the provider injects NOTHING', () => {
    const { warnings } = tx(
      `<PermissionsProvider permissions={draft()}><Text>x</Text></PermissionsProvider>`,
    )
    expect(warnings.some((w) => w.includes('the provider injects NOTHING'))).toBe(true)
  })

  it('a `false` under a WILDCARD grant is a loud authz-direction warning', () => {
    const { warnings } = tx(
      `<PermissionsProvider permissions={{ 'posts.*': true, 'posts.delete': false }}><Text>x</Text></PermissionsProvider>`,
    )
    const w = warnings.find((x) => x.includes('GRANT-ONLY'))
    expect(w).toBeDefined()
    // Singular verb for one key — the pluralisation arm.
    expect(w).toContain('is set to false')
  })

  it('TWO denied-under-wildcard keys take the PLURAL arm', () => {
    const { warnings } = tx(
      `<PermissionsProvider permissions={{ 'posts.*': true, 'posts.delete': false, 'posts.edit': false }}><Text>x</Text></PermissionsProvider>`,
    )
    expect(warnings.find((x) => x.includes('GRANT-ONLY'))).toContain('are set to false')
  })
})

describe('<Link> / <RouterLink> — the children-count arm', () => {
  it('children render inside the trailing closure; NO children → an empty one', () => {
    expect(tx(`<Link to="/a"><Text>go</Text></Link>`).code).toContain('PyreonLink("/a") {')
    expect(tx(`<Link to="/a"></Link>`).code).toContain('PyreonLink("/a") { }')
  })

  it('<RouterLink> routes to the SAME emitter as <Link>', () => {
    expect(tx(`<RouterLink to="/a"><Text>go</Text></RouterLink>`).code).toContain(
      'PyreonLink("/a") {',
    )
  })

  it('a data-testid adds the contain+identifier tail', () => {
    expect(tx(`<Link to="/a" data-testid="lnk"><Text>go</Text></Link>`).code).toContain(
      '.accessibilityElement(children: .contain).accessibilityIdentifier("lnk")',
    )
  })
})
