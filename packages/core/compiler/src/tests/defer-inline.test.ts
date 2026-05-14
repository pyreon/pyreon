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
    expect(result.code).toContain(`chunk={() => import('./Modal').then((__m) => ({ default: __m.Modal }))}`)
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
    expect(result.code).toContain(`chunk={() => import('./Comments').then((__m) => ({ default: __m.Comments }))}`)
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
    // No transform fires (multi-child shape doesn't match the inline-eligible
    // single-component-child pattern). No warning either — v1 just leaves it
    // alone; downstream Defer's runtime behaviour handles the malformed shape.
    expect(result.changed).toBe(false)
  })

  test('skips Defer whose child has props (multi-prop closure capture)', () => {
    const input = `
import { Defer } from '@pyreon/core'
import { Modal } from './Modal'
export function App() {
  return <Defer when={() => true}><Modal title="hi" /></Defer>
}
`
    const result = transformDeferInline(input, 'app.tsx')
    expect(result.changed).toBe(false)
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

  test('skips renamed imports — { Modal as M } not handled in v1', () => {
    const input = `
import { Defer } from '@pyreon/core'
import { Modal as M } from './Modal'
export function App() {
  return <Defer when={() => true}><M /></Defer>
}
`
    const result = transformDeferInline(input, 'app.tsx')
    expect(result.changed).toBe(false)
    // Renamed-import case is not yet supported — falls through to the
    // import-not-found warning (no specifier whose `local.name === 'M'`
    // AND `imported.name === local.name` matches).
    expect(result.warnings[0]?.code).toBe('defer-inline/import-not-found')
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
    expect(result.code).toContain(`chunk={() => import('./Modal').then((__m) => ({ default: __m.Modal }))}`)
    expect(result.code).toContain(`chunk={() => import('./Comments').then((__m) => ({ default: __m.Comments }))}`)
  })
})
