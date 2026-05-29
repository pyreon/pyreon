import { transformDeferInline } from '../defer-inline'

describe('transformDeferInline — basic rewrites', () => {
  test('rewrites <Defer when={x}><Modal /></Defer> with named import', () => {
    const input = `
import { Defer } from '@pyreon/core'
import { Modal } from './Modal'

export function App() {
  const open = () => true
  return <Defer when={open}><Modal /></Defer>
}
`
    const result = transformDeferInline(input, 'app.tsx')
    expect(result.changed).toBe(true)
    expect(result.code).not.toContain("import { Modal } from './Modal'")
    expect(result.code).toContain(
      `chunk={() => import('./Modal').then((__m) => ({ default: __m.Modal }))}`,
    )
    expect(result.code).toContain('{(__C) => <__C />}')
  })

  test('rewrites with default import', () => {
    const input = `
import { Defer } from '@pyreon/core'
import Modal from './Modal'

export function App() {
  return <Defer when={() => true}><Modal /></Defer>
}
`
    const result = transformDeferInline(input, 'app.tsx')
    expect(result.changed).toBe(true)
    expect(result.code).not.toContain('import Modal from')
    expect(result.code).toContain(`chunk={() => import('./Modal')}`)
    expect(result.code).not.toContain(`.then((__m) =>`)
  })

  test('preserves other props on Defer (fallback, when, on)', () => {
    const input = `
import { Defer } from '@pyreon/core'
import { Modal } from './Modal'
export function App() {
  return <Defer when={() => true} fallback={<span>loading</span>}><Modal /></Defer>
}
`
    const result = transformDeferInline(input, 'app.tsx')
    expect(result.changed).toBe(true)
    expect(result.code).toContain('when={() => true}')
    expect(result.code).toContain('fallback={<span>loading</span>}')
  })

  test('works for on="visible" trigger', () => {
    const input = `
import { Defer } from '@pyreon/core'
import { Comments } from './Comments'
export function Post() {
  return <Defer on="visible"><Comments /></Defer>
}
`
    const result = transformDeferInline(input, 'post.tsx')
    expect(result.changed).toBe(true)
    expect(result.code).toContain('on="visible"')
    expect(result.code).toContain(
      `chunk={() => import('./Comments').then((__m) => ({ default: __m.Comments }))}`,
    )
  })
})

describe('transformDeferInline — bail-out cases', () => {
  test('leaves unchanged when chunk prop is already provided', () => {
    const input = `
import { Defer } from '@pyreon/core'
import { Modal } from './Modal'
export function App() {
  return (
    <Defer chunk={() => import('./Modal')} when={() => true}>
      {Modal => <Modal />}
    </Defer>
  )
}
`
    const result = transformDeferInline(input, 'app.tsx')
    expect(result.changed).toBe(false)
    expect(result.code).toBe(input)
    expect(result.warnings).toEqual([])
  })

  test('warns when inline child is also used outside the Defer', () => {
    const input = `
import { Defer } from '@pyreon/core'
import { Modal } from './Modal'
const eagerCopy = <Modal />
export function App() {
  return <Defer when={() => true}><Modal /></Defer>
}
`
    const result = transformDeferInline(input, 'app.tsx')
    expect(result.changed).toBe(false)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]!.code).toBe('defer-inline/import-used-elsewhere')
  })

  test('warns when inline child is not imported', () => {
    const input = `
import { Defer } from '@pyreon/core'
export function App() {
  return <Defer when={() => true}><LocalThing /></Defer>
}
function LocalThing() { return null }
`
    const result = transformDeferInline(input, 'app.tsx')
    expect(result.changed).toBe(false)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]!.code).toBe('defer-inline/import-not-found')
  })

  test('skips Defer with multiple children (still requires render-prop form)', () => {
    const input = `
import { Defer } from '@pyreon/core'
import { Modal } from './Modal'
import { Spinner } from './Spinner'
export function App() {
  return <Defer when={() => true}><Modal /><Spinner /></Defer>
}
`
    const result = transformDeferInline(input, 'app.tsx')
    // v2 now emits a `multiple-children` warning so the author knows to use
    // the explicit `chunk` form. v1 was silent — that was a footgun.
    expect(result.changed).toBe(false)
    expect(result.warnings[0]?.code).toBe('defer-inline/multiple-children')
  })

  test('fast-path: no Defer in source returns unchanged', () => {
    const input = `
import { signal } from '@pyreon/reactivity'
export const count = signal(0)
`
    const result = transformDeferInline(input, 'count.ts')
    expect(result.changed).toBe(false)
    expect(result.code).toBe(input)
  })

  test('does not blow up on syntactically-invalid source — returns unchanged', () => {
    const input = `import {{{ Defer broken syntax`
    const result = transformDeferInline(input, 'broken.tsx')
    expect(result.changed).toBe(false)
    // Returns the input unchanged; downstream parser will surface the real error.
    expect(result.code).toBe(input)
  })

  // v1 bailed on `{ Modal as M }`. v2 handles renamed imports — the
  // local name in JSX is `M`, but the chunk extracts `__m.Modal` (the
  // original exported name). See the positive test in the v2 section.
})

describe('transformDeferInline — v2 capabilities', () => {
  test('preserves props on inline child', () => {
    const input = `
import { Defer } from '@pyreon/core'
import { Modal } from './Modal'
export function App() {
  return <Defer when={() => true}><Modal title="Confirm" size="md" /></Defer>
}
`
    const result = transformDeferInline(input, 'app.tsx')
    expect(result.changed).toBe(true)
    expect(result.code).not.toContain('import { Modal }')
    // Props pass through verbatim. Only the component name is replaced.
    expect(result.code).toContain('{(__C) => <__C title="Confirm" size="md" />}')
  })

  test('preserves nested children on inline child (non-self-closing)', () => {
    const input = `
import { Defer } from '@pyreon/core'
import { Modal } from './Modal'
export function App() {
  return (
    <Defer when={() => true}>
      <Modal title="Hello">
        <p>nested content</p>
      </Modal>
    </Defer>
  )
}
`
    const result = transformDeferInline(input, 'app.tsx')
    expect(result.changed).toBe(true)
    // Both opening AND closing tag names replaced with __C; nested JSX intact.
    expect(result.code).toContain('<__C title="Hello">')
    expect(result.code).toContain('</__C>')
    expect(result.code).toContain('<p>nested content</p>')
  })

  test('captures closure variables via render-prop scope (signal in handler)', () => {
    const input = `
import { Defer } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { Modal } from './Modal'

export function App() {
  const open = signal(false)
  const count = signal(0)
  return (
    <Defer when={open}>
      <Modal count={count} onClose={() => open.set(false)} />
    </Defer>
  )
}
`
    const result = transformDeferInline(input, 'app.tsx')
    expect(result.changed).toBe(true)
    // The render-prop arrow naturally captures `count` + `open.set` from
    // the App function's scope — no closure-tracking pass needed, JS
    // lexical scope just works.
    expect(result.code).toContain('<__C count={count} onClose={() => open.set(false)} />')
  })

  test('handles renamed imports — { Modal as M }', () => {
    const input = `
import { Defer } from '@pyreon/core'
import { Modal as M } from './Modal'
export function App() {
  return <Defer when={() => true}><M /></Defer>
}
`
    const result = transformDeferInline(input, 'app.tsx')
    expect(result.changed).toBe(true)
    // Local name `M` is used at the JSX site, but the chunk extracts
    // `__m.Modal` (the original exported name from './Modal').
    expect(result.code).toContain(
      `chunk={() => import('./Modal').then((__m) => ({ default: __m.Modal }))}`,
    )
    expect(result.code).not.toContain('import { Modal as M }')
    expect(result.code).toContain('{(__C) => <__C />}')
  })

  test('multi-specifier import: drops only the Defer-targeted binding', () => {
    const input = `
import { Defer } from '@pyreon/core'
import { Modal, OtherThing } from './shared'
export function App() {
  const use = OtherThing
  return <Defer when={() => true}><Modal /></Defer>
}
`
    const result = transformDeferInline(input, 'app.tsx')
    expect(result.changed).toBe(true)
    // OtherThing is referenced elsewhere — its import must survive.
    expect(result.code).toContain('OtherThing')
    expect(result.code).toMatch(/import \{\s*OtherThing\s*\} from '\.\/shared'/)
    // Modal binding is gone from the import declaration.
    expect(result.code).not.toMatch(/import \{[^}]*\bModal\b[^}]*\}/)
    // ...but the dynamic chunk pulls Modal from './shared' (same source).
    expect(result.code).toContain(
      `chunk={() => import('./shared').then((__m) => ({ default: __m.Modal }))}`,
    )
  })
})

describe('transformDeferInline — multiple Defers in one file', () => {
  test('rewrites two independent Defers with distinct imports', () => {
    const input = `
import { Defer } from '@pyreon/core'
import { Modal } from './Modal'
import { Comments } from './Comments'
export function App() {
  return (
    <div>
      <Defer when={() => true}><Modal /></Defer>
      <Defer on="visible"><Comments /></Defer>
    </div>
  )
}
`
    const result = transformDeferInline(input, 'app.tsx')
    expect(result.changed).toBe(true)
    expect(result.code).not.toContain("import { Modal } from './Modal'")
    expect(result.code).not.toContain("import { Comments } from './Comments'")
    expect(result.code).toContain(
      `chunk={() => import('./Modal').then((__m) => ({ default: __m.Modal }))}`,
    )
    expect(result.code).toContain(
      `chunk={() => import('./Comments').then((__m) => ({ default: __m.Comments }))}`,
    )
  })
})

// Gap 4 from the v2 follow-up roadmap. Namespace imports were the last
// inline-Defer shape that fell back to the explicit form — closing this
// gap means EVERY common import shape is supported by the inline form.
describe('transformDeferInline — namespace imports (v3)', () => {
  test('rewrites <M.Modal /> with namespace import — chunk extracts __m.Modal', () => {
    const input = `
import { Defer } from '@pyreon/core'
import * as M from './Modal'
export function App() {
  return <Defer when={() => true}><M.Modal /></Defer>
}
`
    const result = transformDeferInline(input, 'app.tsx')
    expect(result.changed).toBe(true)
    expect(result.code).toContain(
      `chunk={() => import('./Modal').then((__m) => ({ default: __m.Modal }))}`,
    )
    // M.Modal in the JSX replaced with __C (the whole member expression
    // is the "name" range that gets substituted).
    expect(result.code).toContain('{(__C) => <__C />}')
    expect(result.code).not.toContain('import * as M from')
  })

  test('rewrites with props on member-expression child', () => {
    const input = `
import { Defer } from '@pyreon/core'
import * as M from './Modal'
export function App() {
  return <Defer when={() => true}><M.Modal title="hi" /></Defer>
}
`
    const result = transformDeferInline(input, 'app.tsx')
    expect(result.changed).toBe(true)
    expect(result.code).toContain('{(__C) => <__C title="hi" />}')
  })

  test('non-self-closing member-expression child preserves opening + closing replacement', () => {
    const input = `
import { Defer } from '@pyreon/core'
import * as M from './Modal'
export function App() {
  return <Defer when={() => true}><M.Modal title="hi"><span>body</span></M.Modal></Defer>
}
`
    const result = transformDeferInline(input, 'app.tsx')
    expect(result.changed).toBe(true)
    expect(result.code).toContain('{(__C) => <__C title="hi"><span>body</span></__C>}')
  })

  test('bails when namespace is referenced elsewhere in the file', () => {
    // `M` is used for multiple components. Removing the static import
    // would break the other usage AND the dynamic import becomes a
    // no-op (Rolldown bundles the module statically when ANY part is
    // referenced).
    const input = `
import { Defer } from '@pyreon/core'
import * as M from './Modal'
export function App() {
  void M.Settings
  return <Defer when={() => true}><M.Modal /></Defer>
}
`
    const result = transformDeferInline(input, 'app.tsx')
    expect(result.changed).toBe(false)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]!.code).toBe('defer-inline/import-used-elsewhere')
  })

  test('bails on deeper member expression — <M.Sub.X /> not supported', () => {
    const input = `
import { Defer } from '@pyreon/core'
import * as M from './Modal'
export function App() {
  return <Defer when={() => true}><M.Sub.Modal /></Defer>
}
`
    const result = transformDeferInline(input, 'app.tsx')
    // analyzeChildElement returns null for non-depth-1 member
    // expressions → no match in findDeferMatches → no warning. The
    // Defer is left alone; runtime errors with "missing chunk".
    expect(result.changed).toBe(false)
  })

  test('bails when member property is lowercase — <M.helper /> is not a component', () => {
    const input = `
import { Defer } from '@pyreon/core'
import * as M from './lib'
export function App() {
  return <Defer when={() => true}><M.helper /></Defer>
}
`
    const result = transformDeferInline(input, 'app.tsx')
    expect(result.changed).toBe(false)
  })

  test('bails when member expression but import is default (not namespace)', () => {
    // `import M from './X'` (default) followed by `<M.Modal />` is a
    // member access on the default-exported component itself, not a
    // namespace lookup. Different semantics; out of scope. Compiler
    // emits `unsupported-import-shape` so the author knows why.
    const input = `
import { Defer } from '@pyreon/core'
import M from './Modal'
export function App() {
  return <Defer when={() => true}><M.Modal /></Defer>
}
`
    const result = transformDeferInline(input, 'app.tsx')
    expect(result.changed).toBe(false)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]!.code).toBe('defer-inline/unsupported-import-shape')
  })
})
