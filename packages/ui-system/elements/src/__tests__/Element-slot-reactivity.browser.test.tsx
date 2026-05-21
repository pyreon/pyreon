/** @jsxImportSource @pyreon/core */
/**
 * Regression specs for the Element slot reactivity bug.
 *
 * Pre-fix: `<Element content={() => <Icon name={signal()} />}>` evaluated the
 * function once at mount and baked in the result. Signal changes inside the
 * function body did NOT cause the slot to re-render — even though the
 * `getChildren` helper in Element/component.tsx had a getter shape intended
 * to preserve reactivity.
 *
 * Root cause: the JSX child position read the resolved slot value at
 * component-setup time. The runtime's `mountChild` reactive-function-child
 * handling (`mountReactive`) was never reached because the function was
 * passed to `render()` which treated it as a component (one-shot mount),
 * not as a reactive accessor.
 *
 * Fix: wrap the JSX child position in `{() => ...}` so it becomes a
 * reactive accessor that mountChild routes through mountReactive.
 * Slot values that are themselves functions get unwrapped (called) inside
 * the accessor so their body's signal reads are tracked by the effect.
 *
 * Bisect-verify-with-restore: revert the wrap → these tests fail with
 * stuck slot content; restore → tests pass.
 */
import { describe, expect, it } from 'vitest'
import { signal } from '@pyreon/reactivity'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { Element } from '../Element'

describe('Element slot reactivity — function-valued slot props', () => {
  it('content={() => <X />} re-renders when a signal inside the function body changes', async () => {
    const dark = signal(false)
    const { container, unmount } = mountInBrowser(
      <Element
        tag="div"
        data-id="root"
        content={() => <span data-id="icon">{dark() ? 'moon' : 'sun'}</span>}
      />,
    )

    expect(container.querySelector('[data-id="icon"]')?.textContent).toBe('sun')
    dark.set(true)
    await flush()
    expect(container.querySelector('[data-id="icon"]')?.textContent).toBe('moon')
    dark.set(false)
    await flush()
    expect(container.querySelector('[data-id="icon"]')?.textContent).toBe('sun')
    unmount()
  })

  it('beforeContent={() => <X />} re-renders when a signal inside changes', async () => {
    const count = signal(0)
    const { container, unmount } = mountInBrowser(
      <Element
        tag="div"
        data-id="root"
        beforeContent={() => <span data-id="badge">{`#${count()}`}</span>}
        content={<span data-id="main">main</span>}
      />,
    )

    expect(container.querySelector('[data-id="badge"]')?.textContent).toBe('#0')
    count.set(5)
    await flush()
    expect(container.querySelector('[data-id="badge"]')?.textContent).toBe('#5')
    unmount()
  })

  it('afterContent={() => <X />} re-renders when a signal inside changes', async () => {
    const tag = signal('draft')
    const { container, unmount } = mountInBrowser(
      <Element
        tag="div"
        data-id="root"
        content={<span data-id="main">main</span>}
        afterContent={() => <span data-id="status">{tag()}</span>}
      />,
    )

    expect(container.querySelector('[data-id="status"]')?.textContent).toBe('draft')
    tag.set('published')
    await flush()
    expect(container.querySelector('[data-id="status"]')?.textContent).toBe('published')
    unmount()
  })

  it('static VNode content (non-function) still works unchanged', () => {
    // Regression guard for the static path — no function unwrap should
    // happen here.
    const { container, unmount } = mountInBrowser(
      <Element tag="div" content={<span data-id="static">hello</span>} />,
    )
    expect(container.querySelector('[data-id="static"]')?.textContent).toBe('hello')
    unmount()
  })

  it('static beforeContent + afterContent still render (compound path)', () => {
    const { container, unmount } = mountInBrowser(
      <Element
        tag="div"
        beforeContent={<span data-id="b">before</span>}
        content={<span data-id="c">main</span>}
        afterContent={<span data-id="a">after</span>}
      />,
    )
    expect(container.querySelector('[data-id="b"]')?.textContent).toBe('before')
    expect(container.querySelector('[data-id="c"]')?.textContent).toBe('main')
    expect(container.querySelector('[data-id="a"]')?.textContent).toBe('after')
    unmount()
  })

  it('null slot stays unrendered; flipping a signal can introduce it', async () => {
    const show = signal(false)
    const { container, unmount } = mountInBrowser(
      <Element
        tag="div"
        data-id="root"
        content={() => (show() ? <span data-id="present">shown</span> : null)}
      />,
    )
    expect(container.querySelector('[data-id="present"]')).toBeNull()
    show.set(true)
    await flush()
    expect(container.querySelector('[data-id="present"]')?.textContent).toBe('shown')
    show.set(false)
    await flush()
    expect(container.querySelector('[data-id="present"]')).toBeNull()
    unmount()
  })

  it('children prop (priority over content) — function form is reactive in compound layout', async () => {
    // children takes priority over content per getChildren's `??` chain.
    // Compound layout (when beforeContent OR afterContent exists) routes
    // through a different render path than the simple-element fast path —
    // both must handle function children reactively.
    const text = signal('first')
    const { container, unmount } = mountInBrowser(
      <Element
        tag="div"
        beforeContent={<span data-id="b">b</span>}
        afterContent={<span data-id="a">a</span>}
      >
        {() => <span data-id="kid">{text()}</span>}
      </Element>,
    )
    expect(container.querySelector('[data-id="kid"]')?.textContent).toBe('first')
    text.set('second')
    await flush()
    expect(container.querySelector('[data-id="kid"]')?.textContent).toBe('second')
    unmount()
  })
})
