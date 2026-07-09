/** @jsxImportSource @pyreon/core */
/**
 * Regression specs for reactive-prop leak in `@pyreon/elements`.
 *
 * BUG SHAPE: Element / Text / Content each had JSX object-spread sites
 *   <Comp {...rest} foo={x}>
 * which the automatic JSX runtime (esbuild via `vl_rolldown_build`)
 * lowers to `jsx(Comp, { ...rest, foo: x })`. That object literal is
 * evaluated at JS LEVEL — it fires every getter on `rest` and stores
 * resolved values before `jsx()` ever sees the object.
 *
 * Compiler-emitted reactive props (`_rp(() => signal())` converted to
 * getters by `makeReactiveProps`) survive `splitProps` (which copies
 * descriptors verbatim) but die at the JSX spread. Result: any signal-
 * driven prop forwarded through Element/Text/Content rendered as a
 * frozen snapshot — `<a href={_rp(() => url())}>` rendered the initial
 * URL once and never updated.
 *
 * Wrapper was already fixed (descriptor-preserving prop construction
 * + `h()` instead of JSX spread). The bug remained on Element's four
 * spread sites + Text's one + Content's one because those compiled
 * with the same JSX spread shape.
 *
 * FIX (two parts):
 *   1. `mergeProps(rest, overrides)` from `@pyreon/core` copies own
 *      descriptors via `Object.defineProperty`, then `h(Comp, result)`
 *      stores the descriptor-preserving object on the vnode as-is.
 *   2. Children are passed via the mergeProps OVERRIDE (not h's third
 *      arg). Otherwise `mount.ts` runs the children-merge step to merge
 *      h's children into props — even though `mount.ts` is now itself
 *      descriptor-safe, routing children through props skips the extra
 *      hop. With children in the override, `vnode.props.children` is
 *      non-undefined so mount short-circuits.
 *
 * Each spec is bisect-load-bearing. Reverting any one component's fix
 * fails its dedicated spec(s) with `expected '/initial' to be '/updated'`.
 */
import { _rp, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { describe, expect, it } from 'vitest'
import { Element } from '../Element'
import Content from '../helpers/Content'
import { Text } from '../Text'

const flush = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

describe('reactive prop through Element — JSX spread regression', () => {
  it('Element fast path (isSimpleElement && !needsFix) forwards reactive href as a live getter', async () => {
    const url = signal('/initial')
    const { container } = mountInBrowser(
      h(Element, {
        tag: 'a',
        // _rp() simulates what the compiler emits for `href={url()}` — a
        // REACTIVE_PROP-branded thunk that makeReactiveProps converts to
        // a property getter. Pre-fix the fast-path JSX spread collapsed
        // the getter to its initial value before <Styled> ever saw it.
        href: _rp(() => url()),
        'data-testid': 'el-fast',
      }),
    )
    const el = container.querySelector<HTMLAnchorElement>('[data-testid="el-fast"]')!
    expect(el).not.toBeNull()
    expect(el.getAttribute('href')).toBe('/initial')

    url.set('/updated')
    await flush()
    expect(el.getAttribute('href')).toBe('/updated')

    url.set('/third')
    await flush()
    expect(el.getAttribute('href')).toBe('/third')
  })

  it('Element void-tag path (shouldBeEmpty) forwards reactive src on <img>', async () => {
    const src = signal('/a.png')
    const { container } = mountInBrowser(
      h(Element, {
        tag: 'img',
        src: _rp(() => src()),
        'data-testid': 'el-void',
      }),
    )
    const el = container.querySelector<HTMLImageElement>('[data-testid="el-void"]')!
    expect(el).not.toBeNull()
    expect(el.getAttribute('src')).toBe('/a.png')

    src.set('/b.png')
    await flush()
    expect(el.getAttribute('src')).toBe('/b.png')
  })

  it('Element needsFix path (tag=button) forwards reactive aria-label through the two-layer wrap', async () => {
    // 'button' is in isWebFixNeeded — it triggers the parent+child Styled
    // two-layer flex fix in Wrapper. The outer Element's JSX spread on
    // `<Wrapper {...rest}>` was the leak site; Wrapper's internal
    // descriptor-preserving prop construction (via `mergeProps` from
    // `@pyreon/core`) is already correct.
    const label = signal('initial')
    const { container } = mountInBrowser(
      h(Element, {
        tag: 'button',
        'aria-label': _rp(() => label()),
        'data-testid': 'el-needsfix',
      }),
    )
    const el = container.querySelector<HTMLButtonElement>('[data-testid="el-needsfix"]')!
    expect(el).not.toBeNull()
    expect(el.getAttribute('aria-label')).toBe('initial')

    label.set('updated')
    await flush()
    expect(el.getAttribute('aria-label')).toBe('updated')
  })

  it('Element compound path (beforeContent + afterContent) forwards reactive prop on outer Wrapper', async () => {
    // Exercises the final `return h(Wrapper, mergeProps(rest, {...}), beforeContent, content, afterContent)` shape.
    const cls = signal('a')
    const { container } = mountInBrowser(
      h(Element, {
        tag: 'div',
        'data-tag': _rp(() => cls()),
        beforeContent: 'B',
        afterContent: 'A',
        'data-testid': 'el-compound',
      }),
    )
    const el = container.querySelector<HTMLElement>('[data-testid="el-compound"]')!
    expect(el).not.toBeNull()
    expect(el.getAttribute('data-tag')).toBe('a')

    cls.set('b')
    await flush()
    expect(el.getAttribute('data-tag')).toBe('b')
  })
})

describe('reactive prop through Text — JSX spread regression', () => {
  it('Text forwards reactive href when rendered as <a> via tag prop', async () => {
    const url = signal('/initial')
    const { container } = mountInBrowser(
      h(Text, {
        tag: 'a',
        href: _rp(() => url()),
        'data-testid': 'txt-href',
      }),
    )
    const el = container.querySelector<HTMLAnchorElement>('[data-testid="txt-href"]')!
    expect(el).not.toBeNull()
    expect(el.getAttribute('href')).toBe('/initial')

    url.set('/updated')
    await flush()
    expect(el.getAttribute('href')).toBe('/updated')
  })

  it('Text forwards reactive title (works on any tag including span)', async () => {
    const title = signal('initial')
    const { container } = mountInBrowser(
      h(Text, {
        tag: 'span',
        title: _rp(() => title()),
        'data-testid': 'txt-title',
      }),
    )
    const el = container.querySelector<HTMLElement>('[data-testid="txt-title"]')!
    expect(el).not.toBeNull()
    expect(el.getAttribute('title')).toBe('initial')

    title.set('updated')
    await flush()
    expect(el.getAttribute('title')).toBe('updated')
  })

  // The residual bug #1168 did NOT close: `label` (and an explicit
  // `children` PROP) were read eagerly via `own.children ?? own.label` at
  // setup, so a compiler `_rp()`-getter (what `<Text label={sig()} />`
  // lowers to) was captured ONCE and never re-read. `<Text>{sig()}</Text>`
  // (a JSX CHILD accessor) always worked — the bug is specific to the
  // getter-valued `label`/`children` PROP. Fix = pass `children` as an
  // accessor. These two specs are bisect-load-bearing: revert the accessor
  // in Text/component.tsx → both fail with `expected 'live-1' to be 'live-2'`.
  it('Text renders a reactive label as live text content', async () => {
    const label = signal('live-1')
    const { container } = mountInBrowser(
      h(Text, {
        tag: 'span',
        label: _rp(() => label()),
        'data-testid': 'txt-label',
      }),
    )
    const el = container.querySelector<HTMLElement>('[data-testid="txt-label"]')!
    expect(el).not.toBeNull()
    expect(el.textContent).toBe('live-1')

    label.set('live-2')
    await flush()
    expect(el.textContent).toBe('live-2')
  })

  it('Text renders a reactive children PROP as live text content', async () => {
    const value = signal('live-1')
    const { container } = mountInBrowser(
      h(Text, {
        tag: 'span',
        children: _rp(() => value()),
        'data-testid': 'txt-children-prop',
      }),
    )
    const el = container.querySelector<HTMLElement>('[data-testid="txt-children-prop"]')!
    expect(el).not.toBeNull()
    expect(el.textContent).toBe('live-1')

    value.set('live-2')
    await flush()
    expect(el.textContent).toBe('live-2')
  })
})

describe('reactive prop through Content — JSX spread regression', () => {
  it('Content forwards reactive title via the rest spread', async () => {
    // Content is normally reached through Element's compound path
    // (beforeContent / afterContent slots). Each Content's `{...rest}` spread
    // could leak reactive HTML props passed to the outer Element. We mount
    // Content directly here to keep the spec focused on Content's spread
    // site — Element's compound-path coverage above proves the
    // integration.
    const label = signal('one')
    const { container } = mountInBrowser(
      h(Content, {
        contentType: 'content',
        tag: 'span',
        title: _rp(() => label()),
        'data-testid': 'content-title',
      } as unknown as Record<string, unknown>),
    )
    const el = container.querySelector<HTMLElement>('[data-testid="content-title"]')!
    expect(el).not.toBeNull()
    expect(el.getAttribute('title')).toBe('one')

    label.set('two')
    await flush()
    expect(el.getAttribute('title')).toBe('two')
  })
})
