/**
 * `migrateReactCode` — the shapes around the core conversions: what it
 * rewrites, what it leaves in place WITH a `manual` note, and how it edits
 * imports. The end-to-end "the output updates" proof is
 * `react-migrate-behavior.test.ts`; this file pins the edges (#4287).
 */
import { detectReactPatterns, migrateReactCode } from '../react-intercept'

const migrate = (code: string) => migrateReactCode(code, 'in.tsx')

describe('reads and writes of state', () => {
  it('rewrites a setter passed as a value into a value-or-updater function', () => {
    const r = migrate(`import { useState } from 'react'
function A() {
  const [v, setV] = useState('')
  const api = { setV }
  return <B onChange={setV} api={api} />
}`)
    expect(r.code).toContain(
      "onChange={((next) => (typeof next === 'function' ? v.update(next) : v.set(next)))}",
    )
    expect(r.code).toContain(
      "{ setV: ((next) => (typeof next === 'function' ? v.update(next) : v.set(next))) }",
    )
  })

  it('expands a shorthand property read and leaves a shadowing parameter alone', () => {
    const r = migrate(`import { useState } from 'react'
function A() {
  const [n, setN] = useState(1)
  const inc = (n: number) => n + 1
  return <B data={() => ({ n })} onClick={() => setN(inc(n))} />
}`)
    expect(r.code).toContain('const inc = (n: number) => n + 1')
    expect(r.code).toContain('({ n: n() })')
    expect(r.code).toContain('n.set(inc(n()))')
  })

  it('wraps a function-expression lazy initializer and calls it once', () => {
    expect(migrate(`const [a, setA] = useState(function () { return 1 })`).code).toContain(
      'a = signal((function () { return 1 })())',
    )
  })

  it('makes a body-level object derived from state a computed, keeping it an expression', () => {
    const r = migrate(`import { useState } from 'react'
function A() {
  const [n, setN] = useState(1)
  const view = { n }
  return <p>{view.n}</p>
}`)
    expect(r.code).toContain('const view = computed(() => ({ n: n() }))')
    expect(r.code).toContain('{view().n}')
    expect(r.manual).toEqual([])
  })

  it('reports a setup-level read it cannot make reactive, in a component and in a custom hook', () => {
    const r = migrate(`import { useState } from 'react'
function A() {
  const [n, setN] = useState(1)
  if (n > 2) console.log('big')
  return <p>{n}</p>
}
function useThing() {
  const [m, setM] = useState(1)
  return m
}
const useOther = function () {
  const [k] = useState(1)
  return k
}`)
    expect(r.manual.map((n) => n.line)).toEqual([4, 9, 13])
    expect(r.manual[0]!.message).toContain('`n` is read once')
    expect(r.manual[1]!.suggested).toContain('return the signal itself (`m`)')
    expect(r.manual[2]!.suggested).toContain('return the signal itself (`k`)')
  })

  it('reports a read nested in a body-level block, once per statement', () => {
    const r = migrate(`import { useState } from 'react'
function A() {
  const [n, setN] = useState(1)
  for (const x of [n, n]) console.log(x)
  return <p>{n}</p>
}`)
    expect(r.manual).toHaveLength(1)
    expect(r.manual[0]!.line).toBe(4)
  })

  it('reports a read in an expression-bodied hook function', () => {
    const r = migrate(`import { useMemo } from 'react'
const A = () => { const t = useMemo(() => 1, []); return <B v={t} /> }`)
    expect(r.code).toContain('<B v={t()} />')
  })
})

describe('hooks it converts with a caveat, or leaves in place', () => {
  it('notes useState outside a declaration, or with a rest / default / empty pattern', () => {
    for (const src of [
      `useState(0)`,
      `const [...all] = useState(0)`,
      `const [a = 1, setA] = useState(0)`,
      `const [] = useState(0)`,
      `const [a, setA, extra] = useState(0)`,
    ]) {
      const r = migrate(src)
      expect(r.code, src).toContain('useState(0)')
      expect(r.manual, src).toHaveLength(1)
    }
  })

  it('a module-level snippet converts without setup-level notes', () => {
    const r = migrate(`const [n, setN] = useState(0)\nconsole.log(n)\nconst [m] = useState(n)`)
    expect(r.code).toContain('console.log(n())')
    expect(r.code).toContain('const m = signal(n())')
    expect(r.manual).toEqual([])
  })

  it('reads in a hook argument or a deps array are not setup-level reads', () => {
    const r = migrate(`function A() {
  const [n, setN] = useState(0)
  const [m] = useState(n)
  const box = useRef(n)
  const t = useMemo(() => 1, [n])
  const f = useCallback(() => 1, [n])
  useLayoutEffect(() => { console.log(n) }, [n])
  return <p>{m}{t}{box.current}{f()}</p>
}`)
    expect(r.manual).toEqual([])
    expect(r.code).toContain('const m = signal(n())')
  })

  it('types useState() with no initializer as possibly undefined', () => {
    expect(migrate(`const [a, setA] = useState<string>()`).code).toContain(
      'a = signal<string | undefined>(undefined)',
    )
  })

  it('names every extra dependency in one note', () => {
    const r = migrate(`function A() {
  const [a] = useState(0)
  const [b] = useState(0)
  const [c] = useState(0)
  useEffect(() => { console.log(a, b, c) }, [a])
  return null
}`)
    expect(r.manual[0]!.message).toContain(
      're-runs when b, c change — its deps array did not list them',
    )
  })

  it('notes a useState it cannot convert and keeps its import', () => {
    const r = migrate(`import { useState } from 'react'
function A() {
  const pair = useState(0)
  return <p>{pair[0]}</p>
}`)
    expect(r.code).toContain("import { useState } from 'react'")
    expect(r.code).toContain('useState(0)')
    expect(r.manual[0]!.message).toContain(
      'only converted in the `const [value, setValue] = useState(…)` shape',
    )
  })

  it('notes a useReducer without an initial state', () => {
    const r = migrate(`function A() { const [s, d] = useReducer(reducer); return <p>{s}</p> }`)
    expect(r.manual[0]!.message).toContain('needs a reducer and an initial state')
    expect(r.code).toContain('useReducer(reducer)')
  })

  it('converts a useReducer whose dispatch is not destructured', () => {
    expect(
      migrate(`function A() { const [s] = useReducer(r, 1); return <p>{s}</p> }`).code,
    ).toContain('const s = signal(1);')
  })

  it('notes a useMemo result that is not bound to a const', () => {
    const r = migrate(`function A() { return <p>{useMemo(() => 1, [])}</p> }`)
    expect(r.code).toContain('computed(() => 1)')
    expect(r.manual[0]!.message).toContain('not bound to a const')
  })

  it('flags reads an effect will now track that its deps array did not list', () => {
    const r = migrate(`function A() {
  const [a, setA] = useState(0)
  const [b, setB] = useState(0)
  useEffect(() => { console.log(a, b) }, [a])
  return null
}`)
    expect(r.manual).toHaveLength(1)
    expect(r.manual[0]!.message).toContain('re-runs when b changes')
    expect(r.manual[0]!.suggested).toContain('b.peek()')
  })

  it('starts an effect that reads a DOM ref in onMount, and disposes it on unmount', () => {
    const r = migrate(`function A() {
  const el = useRef(null)
  const [n] = useState(0)
  useEffect(() => { el.current.textContent = String(n) }, [n])
  return <div ref={el} />
}`)
    expect(r.code).toContain(`onMount(() => {
    const stopEffect = effect(() => { el.current.textContent = String(n()) })
    return () => stopEffect.dispose()
  })`)
    expect(r.code).toContain('import { createRef, onMount } from "@pyreon/core"')
  })

  it('picks an unused name for the effect handle', () => {
    const r = migrate(`function A() {
  const stopEffect = 1
  const el = useRef(null)
  useEffect(() => { el.current.x = stopEffect }, [stopEffect])
  return <div ref={el} />
}`)
    expect(r.code).toContain('const stopEffect2 = effect(')
  })

  it('leaves zero-argument wrappers alone; useRef() is a DOM ref', () => {
    expect(migrate(`memo(); forwardRef()`).code).toBe('memo(); forwardRef()')
    expect(migrate(`const r = useRef()`).code).toContain('const r = createRef()')
  })

  it('keeps forwardRef around a non-inline function, or one with destructured props', () => {
    const named = migrate(`const A = forwardRef(Impl)`)
    expect(named.code).toContain('forwardRef(Impl)')
    expect(named.manual[0]!.message).toContain('inline (props, ref)')
    const destructured = migrate(`const A = forwardRef(({ a }, ref) => <i ref={ref}>{a}</i>)`)
    expect(destructured.code).toContain('forwardRef(({ a }, ref)')
    expect(destructured.manual[0]!.message).toContain('destructured props')
  })

  it('types the props of an unwrapped forwardRef from its annotations', () => {
    expect(
      migrate(`const A = forwardRef((props: P, ref: Ref<HTMLElement>) => <i ref={ref} />)`).code,
    ).toContain('const A = (props: P & { ref?: Ref<HTMLElement> }) => <i ref={props.ref} />')
    expect(migrate(`const A = forwardRef((props: P, ref) => <i ref={ref} />)`).code).toContain(
      'const A = (props: P) => <i ref={props.ref} />',
    )
    expect(
      migrate(`const A = forwardRef<HTMLElement>((props, ref) => <i ref={ref} />)`).code,
    ).toContain('const A = (props: { ref?: Ref<HTMLElement> }) => <i ref={props.ref} />')
    expect(migrate(`const A = forwardRef((props) => <i />)`).code).toContain(
      'const A = (props) => <i />',
    )
  })
})

describe('context, fragments, router', () => {
  it('reports Context.Provider, which Pyreon does not have', () => {
    const r = migrate(`import { createContext } from 'react'
const Ctx = createContext(0)
const A = () => <Ctx.Provider value={1}><i /></Ctx.Provider>
const Other = { Provider: 1 }
const B = () => <Other.Provider />`)
    expect(r.manual).toHaveLength(1)
    expect(r.manual[0]!.suggested).toContain('provide(Ctx, value)')
  })

  it('turns <Fragment> into <> and keeps a keyed one, with a note', () => {
    const r = migrate(`import { Fragment } from 'react'
const A = () => <Fragment><i /></Fragment>
const B = () => <Fragment />
const C = (p) => <Fragment key={p.id}><i /></Fragment>
const D = () => h(Fragment, null)`)
    expect(r.code).toContain('const A = () => <><i /></>')
    expect(r.code).toContain('const B = () => <></>')
    expect(r.code).toContain('<Fragment key={p.id}><i /></Fragment>')
    expect(r.code).toContain('import { Fragment } from "@pyreon/core"')
    expect(r.manual.map((n) => n.line)).toEqual([4])
  })

  it('converts React.X namespace references', () => {
    const r = migrate(`import * as React from 'react'
const A = () => {
  const [n, setN] = React.useState(0)
  return <React.Fragment>{n}<React.Suspense fallback={null} /></React.Fragment>
}`)
    expect(r.code).toContain('const n = signal(0)')
    expect(r.code).toContain('<>{n()}<Suspense fallback={null} /></>')
    expect(r.code).not.toContain("from 'react'")
  })

  it('maps router exports and reports the ones with a different shape', () => {
    const r = migrate(`import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
const A = () => {
  const loc = useLocation()
  return <nav><NavLink to="/a">a</NavLink><Link to="/">{loc.pathname}</Link><Outlet /></nav>
}`)
    expect(r.code).toContain('<RouterLink to="/a">a</RouterLink><RouterLink to="/">')
    expect(r.code).toContain('<RouterView />')
    expect(r.code).toContain("import { useLocation } from 'react-router-dom'")
    expect(r.code).toContain('import { RouterLink, RouterView } from "@pyreon/router"')
    const messages = r.manual.map((n) => n.message).join('\n')
    expect(messages).toContain('Pyreon has no useLocation()')
    expect(messages).toContain('NavLink → RouterLink')
  })

  it('renames hydrateRoot to the Pyreon export with the same argument order', () => {
    const r = migrate(`import { hydrateRoot } from 'react-dom/client'
hydrateRoot(document.body, <App />)`)
    expect(r.code).toBe(`import { hydrateRoot } from "@pyreon/runtime-dom"
hydrateRoot(document.body, <App />)`)
  })
})

describe('imports', () => {
  it('keeps React types and type-only imports, each with a note', () => {
    const r = migrate(`import React, { useState } from 'react'
import type { ReactNode } from 'react'
const A: React.FC<{ c: ReactNode }> = () => {
  const [n] = useState(0)
  return <p>{n}</p>
}`)
    expect(r.code).toContain("import React from 'react'")
    expect(r.code).toContain("import type { ReactNode } from 'react'")
    expect(r.manual.map((n) => n.message).join('\n')).toContain('`React.FC` is a React type')
  })

  it('removes a side-effect React import and keeps named imports it could not convert', () => {
    const r = migrate(`import 'react'
import { useId, useState as useS } from 'react'
const A = () => {
  const [n] = useS(1)
  return <p id={useId()}>{n}</p>
}`)
    expect(r.code).not.toContain("import 'react'")
    expect(r.code).toContain("import { useId } from 'react'")
    expect(r.code).toContain('const n = signal(1)')
  })

  it('adds the import block after a multi-line import, reusing names already imported', () => {
    const r = migrate(`import {
  signal,
} from '@pyreon/reactivity'
import { useMemo } from 'react'
const a = signal(1)
const b = useMemo(() => a() + 1, [])`)
    expect(r.code).toBe(`import {
  signal,
} from '@pyreon/reactivity'

import { computed } from "@pyreon/reactivity"
const a = signal(1)
const b = computed(() => a() + 1)`)
  })

  it('inserts after a directive prologue when there are no imports', () => {
    expect(migrate(`'use client'\nconst [n, setN] = useState(0)`).code).toBe(
      `'use client'\nimport { signal } from "@pyreon/reactivity"\n\nconst n = signal(0)`,
    )
  })

  it('notes an un-imported React name in a snippet that it could not convert', () => {
    const r = migrate(`const root = createRoot(el)\nconst x = React.useId()`)
    expect(r.manual.map((n) => n.line)).toEqual([1, 2])
    expect(r.manual[1]!.message).toContain('`React.useId`')
  })

  it('is idempotent on already-migrated code', () => {
    const once = migrate(`import { useState } from 'react'
export function C() {
  const [n, setN] = useState(0)
  return <button onClick={() => setN(n + 1)}>{n}</button>
}`).code
    expect(migrate(once).code).toBe(once)
    expect(detectReactPatterns(once)).toEqual([])
  })
})
