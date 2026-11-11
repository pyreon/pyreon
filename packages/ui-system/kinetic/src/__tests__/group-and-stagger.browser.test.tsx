/**
 * Stagger, group and per-row transitions in real Chromium, compiled by the
 * REAL Pyreon compiler (`vitest.browser.config.ts` runs `@pyreon/vite-plugin`),
 * which is what decides the shape kinetic's children arrive in:
 *
 * - literal markup such as `<li>Install</li>` is a pre-built `_tpl` item, not a
 *   VNode: the stagger renderers filtered on `'type' in child` and rendered an
 *   EMPTY container (#4359, the docs' own `StepList` example);
 * - a group's `{() => todos().map(…)}` reaches the renderer wrapped once more by
 *   the compiler (an accessor returning the user's accessor): `children is not
 *   iterable` at setup;
 * - group rows were rebuilt on every change, so a removed row never unmounted
 *   and an added row showed no enter state;
 * - an `appear` row rendered twice: its ref moved the stage while the `<Show>`
 *   above it was still mounting it.
 *
 * Bisect: see the PR description (each block fails on `main`).
 */
import { For } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { afterEach, describe, expect, it, vi } from 'vitest'
import kinetic from '../kinetic'
import Stagger from '../Stagger'
import Transition from '../Transition'
import TransitionGroup from '../TransitionGroup'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const frames = () =>
  new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))))

const fadeUp = {
  enterStyle: { opacity: 0, transform: 'translateY(8px)' },
  enterToStyle: { opacity: 1, transform: 'translateY(0)' },
  enterTransition: 'opacity 60ms ease-out, transform 60ms ease-out',
  leaveStyle: { opacity: 1, transform: 'translateY(0)' },
  leaveToStyle: { opacity: 0, transform: 'translateY(8px)' },
  leaveTransition: 'opacity 40ms ease-in, transform 40ms ease-in',
}

const texts = (root: Element, sel: string) =>
  Array.from(root.querySelectorAll(sel)).map((el) => el.textContent)

const reducedMotion = (on: boolean) => {
  const real = window.matchMedia.bind(window)
  vi.spyOn(window, 'matchMedia').mockImplementation((q: string) =>
    q.includes('prefers-reduced-motion')
      ? ({
          matches: on,
          media: q,
          addEventListener: () => {},
          removeEventListener: () => {},
        } as unknown as MediaQueryList)
      : real(q),
  )
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('kinetic stagger (real compiler, real Chromium)', () => {
  it("renders the docs' StepList example and animates it out and back in", async () => {
    const StepList = kinetic('ol').preset(fadeUp).stagger({ interval: 80, reverseLeave: true })
    const open = signal(true)
    const { container, unmount } = mountInBrowser(
      <StepList show={() => open()}>
        <li>Install</li>
        <li>Write a component</li>
        <li>Ship it</li>
      </StepList>,
    )
    expect(texts(container, 'ol li')).toEqual(['Install', 'Write a component', 'Ship it'])
    const items = Array.from(container.querySelectorAll<HTMLElement>('ol li'))
    // Per-item stagger delays, enter forward and leave reversed.
    expect(items.map((li) => li.style.getPropertyValue('--kinetic-delay'))).toEqual([
      '0ms',
      '80ms',
      '160ms',
    ])
    expect(items.map((li) => li.style.getPropertyValue('--kinetic-leave-delay'))).toEqual([
      '160ms',
      '80ms',
      '0ms',
    ])

    open.set(false)
    await flush()
    await frames()
    expect(items[0]!.style.opacity).toBe('0')
    // Each item unmounts once its delayed leave finishes.
    await wait(400)
    expect(container.querySelectorAll('ol li').length).toBe(0)

    open.set(true)
    await flush()
    expect(texts(container, 'ol li')).toEqual(['Install', 'Write a component', 'Ship it'])
    await frames()
    await wait(400)
    for (const li of container.querySelectorAll<HTMLElement>('ol li')) {
      expect(getComputedStyle(li).opacity).toBe('1')
    }
    unmount()
  })

  it('renders array and accessor children too', async () => {
    const List = kinetic('ul').preset(fadeUp).stagger()
    const { container, unmount } = mountInBrowser(
      <div>
        <List class="arr">{[<li>a</li>, <li>b</li>]}</List>
        <List class="fn">{() => [<li>c</li>, <li>d</li>]}</List>
      </div>,
    )
    expect(texts(container, 'ul.arr li')).toEqual(['a', 'b'])
    expect(texts(container, 'ul.fn li')).toEqual(['c', 'd'])
    unmount()
  })

  it('keeps a static item’s own class and style alongside the stagger style', async () => {
    const List = kinetic('ul').preset(fadeUp).stagger({ interval: 30 })
    const { container, unmount } = mountInBrowser(
      <List>
        <li class="own" style="color: red">
          x
        </li>
        <li>y</li>
      </List>,
    )
    const first = container.querySelector<HTMLElement>('ul li')!
    expect(first.classList.contains('own')).toBe(true)
    expect(first.style.color).toBe('red')
    expect(first.style.getPropertyValue('--stagger-index')).toBe('0')
    unmount()
  })

  it('initially hidden: items render in their hidden state and enter on show', async () => {
    const List = kinetic('ul').preset(fadeUp).stagger({ interval: 20 })
    const open = signal(false)
    const { container, unmount } = mountInBrowser(
      <List show={() => open()}>
        <li>a</li>
        <li>b</li>
      </List>,
    )
    const items = Array.from(container.querySelectorAll<HTMLElement>('ul li'))
    expect(items.length).toBe(2)
    expect(items[0]!.style.opacity).toBe('0')
    open.set(true)
    await flush()
    await frames()
    await wait(200)
    for (const li of container.querySelectorAll<HTMLElement>('ul li')) {
      expect(getComputedStyle(li).opacity).toBe('1')
    }
    unmount()
  })

  it('with reduced motion, hiding unmounts the items at once', async () => {
    reducedMotion(true)
    const List = kinetic('ul').preset(fadeUp).stagger()
    const open = signal(true)
    const { container, unmount } = mountInBrowser(
      <List show={() => open()}>
        <li>a</li>
        <li>b</li>
      </List>,
    )
    expect(container.querySelectorAll('ul li').length).toBe(2)
    open.set(false)
    await flush()
    expect(container.querySelectorAll('ul li').length).toBe(0)
    open.set(true)
    await flush()
    expect(container.querySelectorAll('ul li').length).toBe(2)
    unmount()
  })

  it('<Stagger> renders static children', async () => {
    const show = signal(true)
    const { container, unmount } = mountInBrowser(
      <ul>
        <Stagger show={() => show()} interval={40} {...fadeUp}>
          <li>one</li>
          <li>two</li>
        </Stagger>
      </ul>,
    )
    expect(texts(container, 'ul li')).toEqual(['one', 'two'])
    expect(
      container
        .querySelectorAll<HTMLElement>('ul li')[1]!
        .style.getPropertyValue('--kinetic-delay'),
    ).toBe('40ms')
    unmount()
  })

  it('<Transition> animates a static child and unmounts it on hide', async () => {
    const show = signal(true)
    const { container, unmount } = mountInBrowser(
      <Transition show={() => show()} {...fadeUp}>
        <p class="panel">hello</p>
      </Transition>,
    )
    expect(texts(container, 'p.panel')).toEqual(['hello'])
    show.set(false)
    await flush()
    await frames()
    expect(container.querySelector<HTMLElement>('p.panel')!.style.opacity).toBe('0')
    await wait(200)
    expect(container.querySelector('p.panel')).toBeNull()
    unmount()
  })
})

describe('kinetic group (real compiler, real Chromium)', () => {
  type Todo = { id: number; text: string }

  const setup = () => {
    const AnimatedList = kinetic('ul').preset(fadeUp).group()
    const todos = signal<Todo[]>([
      { id: 1, text: 'one' },
      { id: 2, text: 'two' },
      { id: 3, text: 'three' },
    ])
    const remove = (id: number) => todos.set(todos().filter((t) => t.id !== id))
    const mounted = mountInBrowser(
      <AnimatedList>
        {() =>
          todos().map((t) => (
            <li key={t.id} data-id={t.id}>
              <button type="button" onClick={() => remove(t.id)}>
                {t.text}
              </button>
            </li>
          ))
        }
      </AnimatedList>,
    )
    return { ...mounted, todos }
  }

  it('mounts the initial rows', async () => {
    const { container, unmount } = setup()
    expect(texts(container, 'ul li')).toEqual(['one', 'two', 'three'])
    unmount()
  })

  it('a clicked row animates out and then unmounts', async () => {
    const { container, unmount } = setup()
    const two = container.querySelector<HTMLElement>('[data-id="2"]')!
    two.querySelector('button')!.click()
    await flush()
    await frames()
    expect(two.isConnected).toBe(true)
    expect(two.style.opacity).toBe('0')
    await wait(300)
    expect(two.isConnected).toBe(false)
    expect(texts(container, 'ul li')).toEqual(['one', 'three'])
    unmount()
  })

  it('an added row enters; a reorder moves rows without rebuilding them', async () => {
    const { container, unmount, todos } = setup()
    const one = container.querySelector('[data-id="1"]')
    todos.set([
      { id: 3, text: 'three' },
      { id: 1, text: 'one' },
      { id: 4, text: 'four' },
      { id: 2, text: 'two' },
    ])
    await flush()
    expect(texts(container, 'ul li')).toEqual(['three', 'one', 'four', 'two'])
    expect(container.querySelector('[data-id="1"]')).toBe(one)
    const four = container.querySelector<HTMLElement>('[data-id="4"]')!
    expect(four.style.opacity).toBe('0')
    await frames()
    await wait(200)
    expect(getComputedStyle(four).opacity).toBe('1')
    unmount()
  })

  it('with reduced motion a clicked row unmounts at once', async () => {
    reducedMotion(true)
    const { container, unmount } = setup()
    container.querySelector<HTMLElement>('[data-id="1"] button')!.click()
    await flush()
    expect(texts(container, 'ul li')).toEqual(['two', 'three'])
    unmount()
  })

  it('<TransitionGroup> removes a row after its leave', async () => {
    const items = signal([1, 2, 3])
    const { container, unmount } = mountInBrowser(
      <ul>
        <TransitionGroup {...fadeUp}>
          {() => items().map((n) => <li key={n}>{n}</li>)}
        </TransitionGroup>
      </ul>,
    )
    expect(texts(container, 'ul li')).toEqual(['1', '2', '3'])
    items.set([1, 3])
    await flush()
    expect(container.querySelectorAll('ul li').length).toBe(3)
    await frames()
    await wait(300)
    expect(texts(container, 'ul li')).toEqual(['1', '3'])
    unmount()
  })
})

describe('kinetic transition rows (real compiler, real Chromium)', () => {
  it('an appear row inside <For> renders once, takes clicks and animates on toggle', async () => {
    const Row = kinetic('li').preset(fadeUp).config({ appear: true })
    const items = signal([
      { id: 1, text: 'a', show: signal(true) },
      { id: 2, text: 'b', show: signal(true) },
    ])
    let clicks = 0
    const { container, unmount } = mountInBrowser(
      <ul>
        <For each={items} by={(i) => i.id}>
          {(i) => (
            <Row show={() => i.show()} onClick={() => clicks++}>
              {i.text}
            </Row>
          )}
        </For>
      </ul>,
    )
    expect(texts(container, 'ul li')).toEqual(['a', 'b'])
    const first = container.querySelector<HTMLElement>('ul li')!
    first.click()
    expect(clicks).toBe(1)
    await frames()
    await wait(150)
    items()[0]!.show.set(false)
    await flush()
    await frames()
    expect(first.style.opacity).toBe('0')
    await wait(200)
    expect(texts(container, 'ul li')).toEqual(['b'])
    unmount()
  })
})
