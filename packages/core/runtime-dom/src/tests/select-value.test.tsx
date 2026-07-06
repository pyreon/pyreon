/**
 * `<select value>` binding — regression matrix (PZ-09).
 *
 * The invariant under test: `select.value` must be applied AFTER the option
 * children exist, as a DOM PROPERTY. Four verified-broken cells pre-fix:
 *
 *   - Compiled template, static `value="b"`: staticAttrToHtml baked a dead
 *     `value` CONTENT attribute into the template HTML (the parser ignores
 *     `value` on <select>) — first option always won.
 *   - Compiled template, reactive value + DYNAMIC options (`.map`/`<For>`):
 *     the `_bindDirect` line was emitted BEFORE the children `_mountSlot`,
 *     so its eager initial update ran against an option-less select — the
 *     initial value was silently dropped (updates to a DIFFERENT value
 *     worked; `sig.set(sameValue)` never notifies → no self-heal).
 *   - h() path, static + reactive: mountElement ran applyProps before
 *     mountChildren — both the static property assignment and the reactive
 *     renderEffect's initial run were dropped.
 *
 * Fix layers (each bisect-verified — see PR):
 *   - compiler: select/value never baked; the property bind line (static
 *     one-time set AND `_bindDirect`) is deferred past the children lines.
 *   - runtime-dom: mountElement/hydrateElement exclude `value` from the
 *     pre-children applyProps pass for <select> and apply it after children
 *     via `applySelectValueProp`.
 *   - runtime-server: SSR marks the matching `<option selected>` instead of
 *     serializing the dead attribute (covered in runtime-server's own
 *     select-value-ssr.test.ts; the hydrate specs here consume its output).
 *
 * happy-dom faithfully models all four real-browser select semantics
 * (parser ignores value attr; property set selects; pre-options set drops;
 * no-match → value "" / selectedIndex -1) — verified standalone, so these
 * happy-dom specs are load-bearing.
 */
import { transformJSX } from '@pyreon/compiler'
import { Fragment, h, _rp, cx } from '@pyreon/core'
import { _bind, signal } from '@pyreon/reactivity'
import { renderToString } from '@pyreon/runtime-server'
import { transformSync } from 'esbuild'
import { _tpl, _bindText, _bindDirect } from '../template'
import { _applyProps, _setStyle, _mountSlot, hydrateRoot, mountChild } from '../index'

// ─── Compiled-template harness ───────────────────────────────────────────────
// Same shape as compiler-integration.test.tsx, plus an esbuild classic-JSX
// pass for RESIDUAL JSX the Pyreon compiler leaves to the automatic runtime
// (e.g. `<option>` inside a `.map` callback routed through `_mountSlot`).

function stripImports(code: string): string {
  return code.replace(/^import\s+.*$/gm, '').trim()
}

const RUNTIME_DEPS = {
  _tpl,
  _bind,
  _bindText,
  _bindDirect,
  _applyProps,
  _setStyle,
  _mountSlot,
  _rp,
  _cx: cx,
  h,
  Fragment,
  signal,
  document,
} as const

const DEP_NAMES = Object.keys(RUNTIME_DEPS)
const DEP_VALUES = Object.values(RUNTIME_DEPS)

function compileAndMount(source: string, globals: Record<string, unknown> = {}) {
  const { code } = transformJSX(source, 'test.tsx')
  // Residual JSX (inside _mountSlot accessors) → h() calls, mirroring the
  // automatic-runtime pass a real Vite build applies after the Pyreon
  // transform.
  const { code: js } = transformSync(stripImports(code), {
    loader: 'tsx',
    jsx: 'transform',
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
  })
  const body = js.trim().replace(/;$/, '')
  const fn = new Function(...DEP_NAMES, ...Object.keys(globals), `return ${body}`)
  const result = fn(...DEP_VALUES, ...Object.values(globals))
  const container = document.createElement('div')
  document.body.appendChild(container)
  const cleanup = mountChild(result, container)
  return { container, cleanup, code }
}

function sel(container: HTMLElement): HTMLSelectElement {
  return container.querySelector('select') as HTMLSelectElement
}

afterEach(() => {
  document.body.innerHTML = ''
})

// ─── Compiled template path ──────────────────────────────────────────────────

describe('<select value> — compiled template path', () => {
  it('static value="b" + static options selects b (never baked as a dead attribute)', () => {
    const { container, code } = compileAndMount(
      '<select value="b"><option value="a">A</option><option value="b">B</option></select>',
    )
    // The dead content attribute must NOT be in the template HTML…
    expect(code).not.toContain('<select value=')
    // …the property set is emitted instead…
    expect(code).toContain('.value = "b"')
    // …and the select actually shows b.
    expect(sel(container).value).toBe('b')
  })

  it('expression-container static value={"b"} selects b', () => {
    const { container } = compileAndMount(
      '<select value={"b"}><option value="a">A</option><option value="b">B</option></select>',
    )
    expect(sel(container).value).toBe('b')
  })

  it('reactive value + STATIC options — initial and update both bind (control cell)', () => {
    const sig = signal('b')
    const { container } = compileAndMount(
      '<select value={() => sig()}><option value="a">A</option><option value="b">B</option></select>',
      { sig },
    )
    expect(sel(container).value).toBe('b')
    sig.set('a')
    expect(sel(container).value).toBe('a')
  })

  it('reactive value + DYNAMIC options (.map) — INITIAL value survives (the PZ-09 cell)', () => {
    const sig = signal('b')
    const items = ['a', 'b', 'c']
    const { container, code } = compileAndMount(
      '<select value={() => sig()}>{items.map((i) => <option value={i}>{i}</option>)}</select>',
      { sig, items },
    )
    // Emission order: options mount (_mountSlot call) BEFORE the value bind
    // (call sites, not the import line).
    expect(code.indexOf('_mountSlot(')).toBeGreaterThan(-1)
    expect(code.indexOf('_bindDirect(sig')).toBeGreaterThan(code.indexOf('_mountSlot('))
    // The eager initial update now sees the options.
    expect(sel(container).value).toBe('b')
    sig.set('c')
    expect(sel(container).value).toBe('c')
  })

  it('same-value set is a no-op that never needed to self-heal', () => {
    const sig = signal('b')
    const items = ['a', 'b']
    const { container } = compileAndMount(
      '<select value={() => sig()}>{items.map((i) => <option value={i}>{i}</option>)}</select>',
      { sig, items },
    )
    expect(sel(container).value).toBe('b')
    // Same-value write does not notify subscribers — pre-fix this was the
    // trap: the dropped initial could never be repaired by re-setting the
    // same value.
    sig.set('b')
    expect(sel(container).value).toBe('b')
  })

  it('value={undefined} emits nothing and does not clobber a selected-attr option', () => {
    const { container, code } = compileAndMount(
      '<select value={undefined}><option value="a">A</option><option value="b" selected>B</option></select>',
    )
    expect(code).not.toContain('.value')
    expect(sel(container).value).toBe('b')
  })

  it('<input value="b"> still bakes the content attribute (control — input value attr is live)', () => {
    const { code } = compileAndMount('<div><input value="b" /></div>')
    expect(code).toContain('value=\\"b\\"')
  })
})

// ─── h()/applyProp path ──────────────────────────────────────────────────────

describe('<select value> — h()/applyProp path', () => {
  it('static value selects the matching option (applied after mountChildren)', () => {
    const vnode = h(
      'select',
      { value: 'b' },
      h('option', { value: 'a' }, 'A'),
      h('option', { value: 'b' }, 'B'),
    )
    const container = document.createElement('div')
    document.body.appendChild(container)
    mountChild(vnode, container)
    expect(sel(container).value).toBe('b')
  })

  it('reactive value accessor — initial AND update both apply', () => {
    const sig = signal('b')
    const vnode = h(
      'select',
      { value: () => sig() },
      h('option', { value: 'a' }, 'A'),
      h('option', { value: 'b' }, 'B'),
      h('option', { value: 'c' }, 'C'),
    )
    const container = document.createElement('div')
    document.body.appendChild(container)
    mountChild(vnode, container)
    expect(sel(container).value).toBe('b')
    sig.set('c')
    expect(sel(container).value).toBe('c')
  })

  it('select multiple — value selects the first matching option', () => {
    const vnode = h(
      'select',
      { multiple: true, value: 'b' },
      h('option', { value: 'a' }, 'A'),
      h('option', { value: 'b' }, 'B'),
    )
    const container = document.createElement('div')
    document.body.appendChild(container)
    mountChild(vnode, container)
    const s = sel(container)
    expect(s.multiple).toBe(true)
    expect(s.value).toBe('b')
  })

  it('value: undefined does not clobber a selected: true option', () => {
    const vnode = h(
      'select',
      { value: undefined },
      h('option', { value: 'a' }, 'A'),
      h('option', { value: 'b', selected: true }, 'B'),
    )
    const container = document.createElement('div')
    document.body.appendChild(container)
    mountChild(vnode, container)
    expect(sel(container).value).toBe('b')
  })

  it('cleanup of the deferred reactive value binding disposes with the element', () => {
    const sig = signal('a')
    const vnode = h(
      'select',
      { value: () => sig() },
      h('option', { value: 'a' }, 'A'),
      h('option', { value: 'b' }, 'B'),
    )
    const container = document.createElement('div')
    document.body.appendChild(container)
    const cleanup = mountChild(vnode, container)
    expect(sel(container).value).toBe('a')
    cleanup()
    // Post-cleanup the binding must be dead — the write would throw or
    // mutate detached DOM if the renderEffect were still alive; assert it
    // simply doesn't crash and the container is empty.
    sig.set('b')
    expect(container.querySelector('select')).toBeNull()
  })
})

// ─── SSR → hydrate ───────────────────────────────────────────────────────────

describe('<select value> — SSR → hydrate', () => {
  it('hydrating SSR output ends with the right selection and reuses the DOM', async () => {
    const vnode = () =>
      h(
        'select',
        { value: 'b' },
        h('option', { value: 'a' }, 'A'),
        h('option', { value: 'b' }, 'B'),
      )
    const html = await renderToString(vnode())
    // SSR carries the selection as markup — usable before hydration.
    expect(html).not.toContain('value="b"><option')
    expect(html).toContain('<option value="b" selected>')

    const container = document.createElement('div')
    document.body.appendChild(container)
    container.innerHTML = html
    const ssrSelect = container.querySelector('select')!
    expect((ssrSelect as HTMLSelectElement).value).toBe('b')

    const cleanup = hydrateRoot(container, vnode())
    const hydrated = sel(container)
    expect(hydrated).toBe(ssrSelect) // reused, not remounted
    expect(hydrated.value).toBe('b')
    cleanup()
  })

  it('hydrate: value applies AFTER a child-mismatch re-mount adds the matching option', () => {
    // SSR DOM deliberately missing the matching option (stale SSG output vs
    // newer client code). hydrateChildren mounts the missing <option b>
    // fresh — the value assignment must run AFTER that mount, or it's
    // dropped against the incomplete option list (the hydrate-layer half of
    // the PZ-09 deferral).
    const container = document.createElement('div')
    document.body.appendChild(container)
    container.innerHTML = '<select><option value="a">A</option></select>'
    const cleanup = hydrateRoot(
      container,
      h('select', { value: 'b' }, h('option', { value: 'a' }, 'A'), h('option', { value: 'b' }, 'B')),
    )
    expect(sel(container).value).toBe('b')
    cleanup()
  })

  it('hydrating a reactive value keeps the SSR selection and tracks updates', async () => {
    const sig = signal('b')
    const vnode = () =>
      h(
        'select',
        { value: () => sig() },
        h('option', { value: 'a' }, 'A'),
        h('option', { value: 'b' }, 'B'),
      )
    const html = await renderToString(vnode())
    expect(html).toContain('<option value="b" selected>')

    const container = document.createElement('div')
    document.body.appendChild(container)
    container.innerHTML = html
    const cleanup = hydrateRoot(container, vnode())
    expect(sel(container).value).toBe('b')
    sig.set('a')
    expect(sel(container).value).toBe('a')
    cleanup()
  })
})
