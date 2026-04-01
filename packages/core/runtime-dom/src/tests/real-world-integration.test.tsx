/**
 * Real-World Integration Tests
 *
 * Tests that simulate real application patterns — multiple features combined.
 * Todo app, form validation, tab component, nested context.
 */
import type { VNodeChild } from '@pyreon/core'
import { createContext, For, Fragment, h, onMount, provide, Show, useContext } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '../index'

// ─── Helpers ────────────────────────────────────────────────────────────────

function container(): HTMLElement {
  const el = document.createElement('div')
  document.body.appendChild(el)
  return el
}

afterEach(() => {
  document.body.innerHTML = ''
})

// ─── Todo App Pattern ───────────────────────────────────────────────────────

describe('real-world — todo app pattern', () => {
  type Todo = {
    id: number
    text: ReturnType<typeof signal<string>>
    completed: ReturnType<typeof signal<boolean>>
  }

  function createTodo(id: number, text: string, completed = false): Todo {
    return { id, text: signal(text), completed: signal(completed) }
  }

  const TodoItem = (props: {
    text: () => string
    completed: () => boolean
    onToggle: () => void
    onDelete: () => void
  }) =>
    h('li', { class: () => (props.completed() ? 'done' : 'pending') },
      h('span', { class: 'todo-text' }, () => props.text()),
      h('button', { class: 'toggle', onClick: props.onToggle }, 'toggle'),
      h('button', { class: 'delete', onClick: props.onDelete }, 'delete'),
    )

  test('render list of todos with For', () => {
    const el = container()
    const todos = signal<Todo[]>([
      createTodo(1, 'Buy milk'),
      createTodo(2, 'Write tests', true),
      createTodo(3, 'Ship feature'),
    ])

    mount(
      h('ul', null,
        For({
          each: todos,
          by: (t: Todo) => t.id,
          children: (t: Todo) =>
            h(TodoItem, {
              text: () => t.text(),
              completed: () => t.completed(),
              onToggle: () => t.completed.update((c) => !c),
              onDelete: () => todos.update((list) => list.filter((i) => i.id !== t.id)),
            }),
        }),
      ),
      el,
    )

    expect(el.querySelectorAll('li').length).toBe(3)
    expect(el.querySelectorAll('.todo-text')[0]?.textContent).toBe('Buy milk')
    expect(el.querySelectorAll('.todo-text')[1]?.textContent).toBe('Write tests')
    expect(el.querySelectorAll('li')[1]?.className).toBe('done')
  })

  test('add a todo -> appears in DOM', () => {
    const el = container()
    const todos = signal<Todo[]>([
      createTodo(1, 'Existing'),
    ])

    mount(
      h('ul', null,
        For({
          each: todos,
          by: (t: Todo) => t.id,
          children: (t: Todo) =>
            h(TodoItem, {
              text: () => t.text(),
              completed: () => t.completed(),
              onToggle: () => t.completed.update((c) => !c),
              onDelete: () => todos.update((list) => list.filter((i) => i.id !== t.id)),
            }),
        }),
      ),
      el,
    )

    expect(el.querySelectorAll('li').length).toBe(1)

    // Add new todo
    todos.update((list) => [...list, createTodo(2, 'New todo')])
    expect(el.querySelectorAll('li').length).toBe(2)
    expect(el.querySelectorAll('.todo-text')[1]?.textContent).toBe('New todo')
  })

  test('toggle todo complete -> class changes on that item only', () => {
    const el = container()
    const todo1 = createTodo(1, 'First')
    const todo2 = createTodo(2, 'Second')
    const todos = signal<Todo[]>([todo1, todo2])

    mount(
      h('ul', null,
        For({
          each: todos,
          by: (t: Todo) => t.id,
          children: (t: Todo) =>
            h(TodoItem, {
              text: () => t.text(),
              completed: () => t.completed(),
              onToggle: () => t.completed.update((c) => !c),
              onDelete: () => todos.update((list) => list.filter((i) => i.id !== t.id)),
            }),
        }),
      ),
      el,
    )

    // Both start as pending
    expect(el.querySelectorAll('li')[0]?.className).toBe('pending')
    expect(el.querySelectorAll('li')[1]?.className).toBe('pending')

    // Toggle first todo via click
    el.querySelectorAll('.toggle')[0]?.dispatchEvent(new Event('click', { bubbles: true }))
    expect(el.querySelectorAll('li')[0]?.className).toBe('done')
    expect(el.querySelectorAll('li')[1]?.className).toBe('pending')
  })

  test('delete todo -> removed from DOM, others unchanged', () => {
    const el = container()
    const todos = signal<Todo[]>([
      createTodo(1, 'Keep'),
      createTodo(2, 'Delete me'),
      createTodo(3, 'Also keep'),
    ])

    mount(
      h('ul', null,
        For({
          each: todos,
          by: (t: Todo) => t.id,
          children: (t: Todo) =>
            h(TodoItem, {
              text: () => t.text(),
              completed: () => t.completed(),
              onToggle: () => t.completed.update((c) => !c),
              onDelete: () => todos.update((list) => list.filter((i) => i.id !== t.id)),
            }),
        }),
      ),
      el,
    )

    expect(el.querySelectorAll('li').length).toBe(3)

    // Delete second item via click
    el.querySelectorAll('.delete')[1]?.dispatchEvent(new Event('click', { bubbles: true }))
    expect(el.querySelectorAll('li').length).toBe(2)
    expect(el.querySelectorAll('.todo-text')[0]?.textContent).toBe('Keep')
    expect(el.querySelectorAll('.todo-text')[1]?.textContent).toBe('Also keep')
  })

  test('edit todo text -> only that text node updates', () => {
    const el = container()
    const todo1 = createTodo(1, 'Original text')
    const todo2 = createTodo(2, 'Other text')
    const todos = signal<Todo[]>([todo1, todo2])

    mount(
      h('ul', null,
        For({
          each: todos,
          by: (t: Todo) => t.id,
          children: (t: Todo) =>
            h(TodoItem, {
              text: () => t.text(),
              completed: () => t.completed(),
              onToggle: () => t.completed.update((c) => !c),
              onDelete: () => todos.update((list) => list.filter((i) => i.id !== t.id)),
            }),
        }),
      ),
      el,
    )

    // Edit first todo's text
    todo1.text.set('Edited text')
    expect(el.querySelectorAll('.todo-text')[0]?.textContent).toBe('Edited text')
    // Second todo unchanged
    expect(el.querySelectorAll('.todo-text')[1]?.textContent).toBe('Other text')
  })
})

// ─── Form with Validation ───────────────────────────────────────────────────

describe('real-world — form with validation', () => {
  test('render inputs with signals and display updates', () => {
    const el = container()
    const username = signal('')
    const email = signal('')

    const Form = () =>
      h('form', null,
        h('input', {
          type: 'text',
          class: 'username',
          value: () => username(),
          onInput: (e: Event) => username.set((e.target as HTMLInputElement).value),
        }),
        h('input', {
          type: 'email',
          class: 'email',
          value: () => email(),
          onInput: (e: Event) => email.set((e.target as HTMLInputElement).value),
        }),
        h('p', { class: 'preview' }, () => `${username()} <${email()}>`),
      )

    mount(h(Form, null), el)

    expect(el.querySelector('.preview')!.textContent).toBe(' <>')

    // Simulate typing
    username.set('alice')
    expect(el.querySelector('.preview')!.textContent).toBe('alice <>')

    email.set('alice@example.com')
    expect(el.querySelector('.preview')!.textContent).toBe('alice <alice@example.com>')
  })

  test('show/hide error message based on validation signal', () => {
    const el = container()
    const value = signal('')
    const touched = signal(false)
    const hasError = () => touched() && value().length < 3

    const Field = () =>
      h('div', null,
        h('input', {
          type: 'text',
          value: () => value(),
          onInput: (e: Event) => value.set((e.target as HTMLInputElement).value),
          onBlur: () => touched.set(true),
        }),
        h(Show, { when: hasError },
          h('span', { class: 'error' }, 'Must be at least 3 characters'),
        ),
      )

    mount(h(Field, null), el)

    // No error initially (not touched)
    expect(el.querySelector('.error')).toBeNull()

    // Touch the field with short value
    touched.set(true)
    expect(el.querySelector('.error')).not.toBeNull()
    expect(el.querySelector('.error')!.textContent).toBe('Must be at least 3 characters')

    // Fix the error
    value.set('valid')
    expect(el.querySelector('.error')).toBeNull()

    // Make it invalid again
    value.set('ab')
    expect(el.querySelector('.error')).not.toBeNull()
  })

  test('form submission tracking', () => {
    const el = container()
    const submitting = signal(false)
    const submitted = signal(false)

    const Form = () =>
      h('div', null,
        h('button', {
          class: 'submit',
          disabled: () => submitting(),
          onClick: () => {
            submitting.set(true)
            // Simulate async submit
            submitted.set(true)
            submitting.set(false)
          },
        }, () => (submitting() ? 'Submitting...' : 'Submit')),
        h(Show, { when: submitted },
          h('p', { class: 'success' }, 'Form submitted successfully!'),
        ),
      )

    mount(h(Form, null), el)

    expect(el.querySelector('.success')).toBeNull()
    expect(el.querySelector('.submit')!.textContent).toBe('Submit')

    // Click submit
    el.querySelector('.submit')!.dispatchEvent(new Event('click', { bubbles: true }))
    expect(el.querySelector('.success')).not.toBeNull()
    expect(el.querySelector('.submit')!.textContent).toBe('Submit')
  })
})

// ─── Tab Component ──────────────────────────────────────────────────────────

describe('real-world — tab component', () => {
  test('render tabs and switch between them', () => {
    const el = container()
    const activeTab = signal(0)

    const TabContent0 = () => h('div', { class: 'tab-content-0' }, 'First tab content')
    const TabContent1 = () => h('div', { class: 'tab-content-1' }, 'Second tab content')
    const TabContent2 = () => h('div', { class: 'tab-content-2' }, 'Third tab content')

    const Tabs = () =>
      h('div', null,
        h('div', { class: 'tab-bar' },
          h('button', { class: 'tab-0', onClick: () => activeTab.set(0) }, 'Tab 1'),
          h('button', { class: 'tab-1', onClick: () => activeTab.set(1) }, 'Tab 2'),
          h('button', { class: 'tab-2', onClick: () => activeTab.set(2) }, 'Tab 3'),
        ),
        h(Show, { when: () => activeTab() === 0 }, h(TabContent0, null)),
        h(Show, { when: () => activeTab() === 1 }, h(TabContent1, null)),
        h(Show, { when: () => activeTab() === 2 }, h(TabContent2, null)),
      )

    mount(h(Tabs, null), el)

    // First tab visible by default
    expect(el.querySelector('.tab-content-0')).not.toBeNull()
    expect(el.querySelector('.tab-content-1')).toBeNull()
    expect(el.querySelector('.tab-content-2')).toBeNull()

    // Switch to second tab
    el.querySelector('.tab-1')!.dispatchEvent(new Event('click', { bubbles: true }))
    expect(el.querySelector('.tab-content-0')).toBeNull()
    expect(el.querySelector('.tab-content-1')).not.toBeNull()
    expect(el.querySelector('.tab-content-2')).toBeNull()

    // Switch to third tab
    el.querySelector('.tab-2')!.dispatchEvent(new Event('click', { bubbles: true }))
    expect(el.querySelector('.tab-content-0')).toBeNull()
    expect(el.querySelector('.tab-content-1')).toBeNull()
    expect(el.querySelector('.tab-content-2')).not.toBeNull()
  })

  test('signal in active tab is reactive', () => {
    const el = container()
    const activeTab = signal(0)
    const counter = signal(0)

    const CounterTab = () =>
      h('div', { class: 'counter-tab' },
        h('span', { class: 'count' }, () => String(counter())),
        h('button', { class: 'increment', onClick: () => counter.update((n) => n + 1) }, '+'),
      )

    const OtherTab = () => h('div', { class: 'other-tab' }, 'Other content')

    const Tabs = () =>
      h('div', null,
        h('button', { class: 'switch', onClick: () => activeTab.update((t) => (t === 0 ? 1 : 0)) }, 'switch'),
        h(Show, { when: () => activeTab() === 0 }, h(CounterTab, null)),
        h(Show, { when: () => activeTab() === 1 }, h(OtherTab, null)),
      )

    mount(h(Tabs, null), el)

    // Counter starts at 0
    expect(el.querySelector('.count')!.textContent).toBe('0')

    // Increment works
    el.querySelector('.increment')!.dispatchEvent(new Event('click', { bubbles: true }))
    expect(el.querySelector('.count')!.textContent).toBe('1')

    // Switch to other tab
    el.querySelector('.switch')!.dispatchEvent(new Event('click', { bubbles: true }))
    expect(el.querySelector('.counter-tab')).toBeNull()
    expect(el.querySelector('.other-tab')).not.toBeNull()

    // Switch back — counter remounts with current signal value
    el.querySelector('.switch')!.dispatchEvent(new Event('click', { bubbles: true }))
    expect(el.querySelector('.counter-tab')).not.toBeNull()
    expect(el.querySelector('.count')!.textContent).toBe('1')
  })

  test('previous tab unmounts when switching', () => {
    const el = container()
    const activeTab = signal(0)
    let mountCount = 0
    let unmountCount = 0

    const TrackedTab = () => {
      onMount(() => {
        mountCount++
        return () => { unmountCount++ }
      })
      return h('div', { class: 'tracked' }, 'tracked content')
    }

    const Tabs = () =>
      h('div', null,
        h('button', { class: 'switch', onClick: () => activeTab.update((t) => (t === 0 ? 1 : 0)) }, 'switch'),
        h(Show, { when: () => activeTab() === 0 }, h(TrackedTab, null)),
        h(Show, { when: () => activeTab() === 1 }, h('div', null, 'other')),
      )

    mount(h(Tabs, null), el)
    expect(mountCount).toBe(1)
    expect(unmountCount).toBe(0)

    // Switch away — tracked tab unmounts
    el.querySelector('.switch')!.dispatchEvent(new Event('click', { bubbles: true }))
    expect(unmountCount).toBe(1)

    // Switch back — tracked tab mounts again
    el.querySelector('.switch')!.dispatchEvent(new Event('click', { bubbles: true }))
    expect(mountCount).toBe(2)
  })
})

// ─── Nested Context ─────────────────────────────────────────────────────────

describe('real-world — nested context', () => {
  const ThemeCtx = createContext<string>('light')

  test('parent provides context, child reads it', () => {
    const el = container()
    let childTheme: string | undefined

    const Child = () => {
      childTheme = useContext(ThemeCtx)
      return h('span', null, childTheme)
    }

    const Parent = () => {
      provide(ThemeCtx, 'dark')
      return h(Child, null)
    }

    mount(h(Parent, null), el)
    expect(childTheme).toBe('dark')
    expect(el.querySelector('span')!.textContent).toBe('dark')
  })

  test('deeply nested child reads ancestor context', () => {
    const el = container()
    let deepTheme: string | undefined

    const DeepChild = () => {
      deepTheme = useContext(ThemeCtx)
      return h('span', { class: 'deep' }, deepTheme)
    }

    const Middle = () => h('div', { class: 'middle' }, h(DeepChild, null))

    const Root = () => {
      provide(ThemeCtx, 'blue')
      return h('div', null, h(Middle, null))
    }

    mount(h(Root, null), el)
    expect(deepTheme).toBe('blue')
    expect(el.querySelector('.deep')!.textContent).toBe('blue')
  })

  test('nested providers override parent context', () => {
    const el = container()
    let innerTheme: string | undefined
    let outerTheme: string | undefined

    const InnerChild = () => {
      innerTheme = useContext(ThemeCtx)
      return h('span', { class: 'inner' }, innerTheme)
    }

    const OuterChild = () => {
      outerTheme = useContext(ThemeCtx)
      return h('span', { class: 'outer' }, outerTheme)
    }

    const InnerProvider = () => {
      provide(ThemeCtx, 'red')
      return h(InnerChild, null)
    }

    const OuterProvider = () => {
      provide(ThemeCtx, 'green')
      return h(Fragment, null,
        h(OuterChild, null),
        h(InnerProvider, null),
      )
    }

    mount(h(OuterProvider, null), el)
    expect(outerTheme).toBe('green')
    expect(innerTheme).toBe('red')
    expect(el.querySelector('.outer')!.textContent).toBe('green')
    expect(el.querySelector('.inner')!.textContent).toBe('red')
  })

  test('sibling providers isolate context', () => {
    const el = container()
    let themeA: string | undefined
    let themeB: string | undefined

    const ChildA = () => {
      themeA = useContext(ThemeCtx)
      return h('span', { class: 'a' }, themeA)
    }

    const ChildB = () => {
      themeB = useContext(ThemeCtx)
      return h('span', { class: 'b' }, themeB)
    }

    const ProviderA = () => {
      provide(ThemeCtx, 'alpha')
      return h(ChildA, null)
    }

    const ProviderB = () => {
      provide(ThemeCtx, 'beta')
      return h(ChildB, null)
    }

    mount(h(Fragment, null, h(ProviderA, null), h(ProviderB, null)), el)

    expect(themeA).toBe('alpha')
    expect(themeB).toBe('beta')
    expect(el.querySelector('.a')!.textContent).toBe('alpha')
    expect(el.querySelector('.b')!.textContent).toBe('beta')
  })

  test('context with Show — context survives reactive boundary', async () => {
    const el = container()
    let childTheme: string | undefined
    const visible = signal(false)

    const Child = () => {
      childTheme = useContext(ThemeCtx)
      return h('span', { class: 'themed' }, childTheme)
    }

    const App = () => {
      provide(ThemeCtx, 'purple')
      return h('div', null,
        h(Show, { when: visible }, h(Child, null)),
      )
    }

    mount(h(App, null), el)
    expect(el.querySelector('.themed')).toBeNull()

    // Show child — context should be available
    visible.set(true)
    await new Promise((r) => setTimeout(r, 50))
    expect(childTheme).toBe('purple')
    expect(el.querySelector('.themed')!.textContent).toBe('purple')
  })
})

// ─── Complex Composition ────────────────────────────────────────────────────

describe('real-world — complex composition', () => {
  test('counter with derived display and reset', () => {
    const el = container()
    const count = signal(0)

    const Counter = () =>
      h('div', null,
        h('span', { class: 'value' }, () => String(count())),
        h('span', { class: 'doubled' }, () => String(count() * 2)),
        h('span', { class: 'label' }, () => (count() === 0 ? 'zero' : count() > 0 ? 'positive' : 'negative')),
        h('button', { class: 'inc', onClick: () => count.update((n) => n + 1) }, '+'),
        h('button', { class: 'dec', onClick: () => count.update((n) => n - 1) }, '-'),
        h('button', { class: 'reset', onClick: () => count.set(0) }, 'reset'),
      )

    mount(h(Counter, null), el)

    expect(el.querySelector('.value')!.textContent).toBe('0')
    expect(el.querySelector('.doubled')!.textContent).toBe('0')
    expect(el.querySelector('.label')!.textContent).toBe('zero')

    // Increment
    el.querySelector('.inc')!.dispatchEvent(new Event('click', { bubbles: true }))
    expect(el.querySelector('.value')!.textContent).toBe('1')
    expect(el.querySelector('.doubled')!.textContent).toBe('2')
    expect(el.querySelector('.label')!.textContent).toBe('positive')

    // Increment again
    el.querySelector('.inc')!.dispatchEvent(new Event('click', { bubbles: true }))
    expect(el.querySelector('.value')!.textContent).toBe('2')
    expect(el.querySelector('.doubled')!.textContent).toBe('4')

    // Decrement 3 times
    el.querySelector('.dec')!.dispatchEvent(new Event('click', { bubbles: true }))
    el.querySelector('.dec')!.dispatchEvent(new Event('click', { bubbles: true }))
    el.querySelector('.dec')!.dispatchEvent(new Event('click', { bubbles: true }))
    expect(el.querySelector('.value')!.textContent).toBe('-1')
    expect(el.querySelector('.label')!.textContent).toBe('negative')

    // Reset
    el.querySelector('.reset')!.dispatchEvent(new Event('click', { bubbles: true }))
    expect(el.querySelector('.value')!.textContent).toBe('0')
    expect(el.querySelector('.label')!.textContent).toBe('zero')
  })

  test('filterable list with search', () => {
    const el = container()
    type Item = { id: number; name: string }

    const allItems: Item[] = [
      { id: 1, name: 'Apple' },
      { id: 2, name: 'Banana' },
      { id: 3, name: 'Cherry' },
      { id: 4, name: 'Apricot' },
    ]

    const query = signal('')
    const filtered = () =>
      allItems.filter((i) => i.name.toLowerCase().includes(query().toLowerCase()))

    const SearchList = () =>
      h('div', null,
        h('input', {
          class: 'search',
          value: () => query(),
          onInput: (e: Event) => query.set((e.target as HTMLInputElement).value),
        }),
        h('ul', null,
          For({
            each: filtered,
            by: (i: Item) => i.id,
            children: (i: Item) => h('li', null, i.name),
          }),
        ),
        h('span', { class: 'count' }, () => `${filtered().length} results`),
      )

    mount(h(SearchList, null), el)

    expect(el.querySelectorAll('li').length).toBe(4)
    expect(el.querySelector('.count')!.textContent).toBe('4 results')

    // Filter to "ap" — matches Apple and Apricot
    query.set('ap')
    expect(el.querySelectorAll('li').length).toBe(2)
    expect(el.querySelector('.count')!.textContent).toBe('2 results')

    // Filter to "ban" — matches Banana
    query.set('ban')
    expect(el.querySelectorAll('li').length).toBe(1)
    expect(el.querySelectorAll('li')[0]?.textContent).toBe('Banana')

    // Clear filter
    query.set('')
    expect(el.querySelectorAll('li').length).toBe(4)
  })

  test('dynamic class list based on multiple signals', () => {
    const el = container()
    const active = signal(false)
    const disabled = signal(false)
    const size = signal<'sm' | 'md' | 'lg'>('md')

    const Button = () =>
      h('button', {
        class: () => [
          'btn',
          active() && 'btn-active',
          disabled() && 'btn-disabled',
          `btn-${size()}`,
        ].filter(Boolean).join(' '),
        disabled: () => disabled(),
      }, 'Click')

    mount(h(Button, null), el)

    const btn = el.querySelector('button')!
    expect(btn.className).toBe('btn btn-md')

    active.set(true)
    expect(btn.className).toBe('btn btn-active btn-md')

    size.set('lg')
    expect(btn.className).toBe('btn btn-active btn-lg')

    disabled.set(true)
    expect(btn.className).toBe('btn btn-active btn-disabled btn-lg')
    expect(btn.disabled).toBe(true)

    active.set(false)
    disabled.set(false)
    size.set('sm')
    expect(btn.className).toBe('btn btn-sm')
    expect(btn.disabled).toBe(false)
  })
})
