/**
 * Slow-path receiver contract for `_bindText` / `_bindDirect`.
 *
 * The compiler emits a 3rd argument for member-expression callees
 * (`{row.label()}`) purely so the runtime's SLOW path can preserve `this` when
 * `source` turns out to be a plain method rather than a signal. The FAST path
 * (`source.direct`) returns before ever reading it.
 *
 * That made the legacy `() => row.label()` thunk a pure waste for the dominant
 * case: one closure allocated per row, immediately discarded. The emit now
 * passes the RECEIVER (`row`) — an identifier already in scope, zero
 * allocation — and the runtime rebuilds the call only if it actually reaches
 * the slow path.
 *
 * The receiver gets its OWN positional slot (4th) rather than sharing the 3rd
 * with the thunk, because a receiver can itself be callable — so
 * `typeof x === 'function'` cannot tell the two apart. The slot-3 thunk is
 * still honoured for deeper chains and for any older compiler's output.
 *
 * These specs lock all three halves: the `this` semantics the argument exists
 * for, the callable-receiver disambiguation, and the fact that the fast path is
 * unaffected.
 */
import { describe, expect, it, afterEach } from 'vitest'
import { signal, _bind } from '@pyreon/reactivity'
import { transformJSX } from '@pyreon/compiler'
import { h, Fragment, _rp, cx } from '@pyreon/core'
import { mountChild } from '../mount'
import { _tpl, _bindText, _bindDirect, _setStyle, _setClass, _applyProps } from '../index'

const RUNTIME_DEPS = {
  _tpl,
  _bind,
  _bindText,
  _bindDirect,
  _applyProps,
  _setStyle,
  _setClass,
  _rp,
  _cx: cx,
  h,
  Fragment,
  signal,
  document,
} as const

const DEP_NAMES = Object.keys(RUNTIME_DEPS)
const DEP_VALUES = Object.values(RUNTIME_DEPS)

function stripImports(code: string): string {
  return code.replace(/^import[^\n]*\n/gm, '').trim()
}

function compileAndMount(source: string, globals: Record<string, unknown> = {}) {
  const { code } = transformJSX(source, 'test.tsx')
  const body = stripImports(code)
  const fn = new Function(...DEP_NAMES, ...Object.keys(globals), `return ${body}`)
  const result = fn(...DEP_VALUES, ...Object.values(globals))
  const container = document.createElement('div')
  document.body.appendChild(container)
  const cleanup = mountChild(result, container)
  return { container, cleanup, code }
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('slow-path receiver: `this` preservation (the reason the 3rd arg exists)', () => {
  it('_bindText: a plain method reading `this` renders correctly through the real emit', () => {
    // `row.label` has no `.direct`, so this lands in the renderEffect fallback
    // — the ONLY place the 3rd arg is consulted. Detaching the method would
    // read `this === undefined` and throw.
    const row = {
      first: 'Ada',
      last: 'Lovelace',
      label(this: { first: string; last: string }) {
        return `${this.first} ${this.last}`
      },
    }
    const { container, cleanup, code } = compileAndMount('<div>{row.label()}</div>', { row })

    // Lock the emitted shape: receiver, not a per-row thunk.
    expect(code).toContain('_bindText(row.label,')
    expect(code).toContain(', undefined, row)')
    expect(code).not.toContain('() => row.label()')

    expect(container.textContent).toBe('Ada Lovelace')
    cleanup()
  })

  it('_bindDirect: a plain method reading `this` drives an attribute correctly', () => {
    const row = {
      state: 'active',
      cls(this: { state: string }) {
        return `row-${this.state}`
      },
    }
    const { container, cleanup, code } = compileAndMount('<div class={row.cls()}>x</div>', { row })

    expect(code).toContain('_bindDirect(row.cls,')
    expect(code).toContain(', undefined, row)')
    expect(code).not.toContain('() => row.cls()')

    expect(container.querySelector('div')?.className).toBe('row-active')
    cleanup()
  })

  it('deep chains keep the thunk — their receiver is itself a property read', () => {
    // `row.data.name()` would need `row.data` evaluated a second time at the
    // call site to pass as a receiver, which would double-fire a getter. The
    // rarer shape deliberately keeps the legacy form.
    const row = {
      data: {
        first: 'Grace',
        name(this: { first: string }) {
          return this.first
        },
      },
    }
    const { container, cleanup, code } = compileAndMount('<div>{row.data.name()}</div>', { row })

    expect(code).toContain('() => row.data.name()')
    expect(container.textContent).toBe('Grace')
    cleanup()
  })
})

describe('slow-path receiver: a CALLABLE receiver is not mistaken for a thunk', () => {
  it('a callable object with a zero-arg method keeps `this`', () => {
    // WHY the receiver needs its OWN positional slot rather than sharing slot 3
    // with the thunk: a receiver can itself be a function, so
    // `typeof x === 'function'` cannot tell "receiver" from "thunk". Sharing one
    // slot would make the runtime invoke the RECEIVER — here returning
    // 'called-as-function' instead of the method's 'state-value'.
    //
    // The zustand-style shape is the reachable instance: a callable store
    // carrying methods. (`Date.now()` looks like the same trap but is NOT a
    // vector — the compiler's pure-call allowlist hoists it to a static
    // `_setChild`, so it never reaches `_bindText`.)
    const store = Object.assign(() => 'called-as-function', {
      inner: 'state-value',
      getState(this: { inner: string }) {
        return this.inner
      },
    })
    const { container, cleanup, code } = compileAndMount('<div>{store.getState()}</div>', { store })
    expect(code).toContain('_bindText(store.getState,')
    expect(code).toContain(', undefined, store)')
    expect(container.textContent).toBe('state-value')
    cleanup()
  })
})

describe('slow-path receiver: fast path is unaffected', () => {
  it('_bindText: a signal-valued member still takes the .direct fast path and stays reactive', () => {
    const label = signal('one')
    const row = { label }
    const { container, cleanup, code } = compileAndMount('<div>{row.label()}</div>', { row })

    expect(code).toContain(', undefined, row)')
    expect(container.textContent).toBe('one')
    // Reactivity through the fast path is untouched by the argument change.
    label.set('two')
    expect(container.textContent).toBe('two')
    cleanup()
  })

  it('_bindDirect: a signal-valued member attribute stays reactive', () => {
    const cls = signal('a')
    const row = { cls }
    const { container, cleanup } = compileAndMount('<div class={row.cls()}>x</div>', { row })

    expect(container.querySelector('div')?.className).toBe('a')
    cls.set('b')
    expect(container.querySelector('div')?.className).toBe('b')
    cleanup()
  })
})

describe('slow-path thunk (slot 3): deeper chains + older compiler output', () => {
  it('_bindText accepts a legacy thunk 3rd arg', () => {
    const row = {
      v: 'legacy',
      label(this: { v: string }) {
        return this.v
      },
    }
    const text = document.createTextNode('')
    const host = document.createElement('div')
    host.appendChild(text)
    document.body.appendChild(host)

    // Exactly what an OLDER compiler emitted.
    const dispose = _bindText(row.label as never, text, () => row.label())
    expect(host.textContent).toBe('legacy')
    dispose()
  })

  it('_bindDirect accepts a legacy thunk 3rd arg', () => {
    const row = {
      v: 'legacy-attr',
      cls(this: { v: string }) {
        return this.v
      },
    }
    const el = document.createElement('div')
    const dispose = _bindDirect(
      row.cls as never,
      (v) => {
        el.className = String(v)
      },
      () => row.cls(),
    )
    expect(el.className).toBe('legacy-attr')
    dispose()
  })

  it('a 2-arg call (no receiver) is unchanged for a standalone callable', () => {
    const text = document.createTextNode('')
    const host = document.createElement('div')
    host.appendChild(text)
    document.body.appendChild(host)

    const dispose = _bindText((() => 'standalone') as never, text)
    expect(host.textContent).toBe('standalone')
    dispose()
  })
})
