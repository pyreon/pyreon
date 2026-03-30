import type { ComponentFn, VNodeChild } from '@pyreon/core'
import { effect, signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { render as previewRender } from '../preview'
import { defaultRender, renderToCanvas } from '../render'
import type { DecoratorFn, Meta, StoryContext, StoryFn, StoryObj } from '../types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createCanvas(): HTMLElement {
  const el = document.createElement('div')
  document.body.appendChild(el)
  return el
}

function makeRenderContext(overrides: {
  storyFn?: () => VNodeChild
  component?: ComponentFn<any>
  args?: Record<string, unknown>
}) {
  return {
    storyFn: overrides.storyFn ?? (() => <div>default</div>),
    storyContext: {
      ...(overrides.component != null ? { component: overrides.component } : {}),
      args: overrides.args ?? {},
    },
    showMain: () => {
      /* noop */
    },
    showError: (_err: { title: string; description: string }) => {
      /* noop */
    },
    forceRemount: false,
  }
}

// ─── renderToCanvas ──────────────────────────────────────────────────────────

describe('renderToCanvas', () => {
  it('mounts a simple VNode into the canvas', () => {
    const canvas = createCanvas()
    const ctx = makeRenderContext({
      storyFn: () => <button>Click me</button>,
    })

    renderToCanvas(ctx, canvas)

    expect(canvas.innerHTML).toContain('Click me')
    expect(canvas.querySelector('button')).toBeTruthy()
    canvas.remove()
  })

  it('mounts a Pyreon component with props', () => {
    function Button(props: { label: string; disabled?: boolean }) {
      return <button disabled={props.disabled ?? false}>{props.label}</button>
    }

    const canvas = createCanvas()
    const ctx = makeRenderContext({
      storyFn: () => <Button label="Submit" disabled={true} />,
    })

    renderToCanvas(ctx, canvas)

    const btn = canvas.querySelector('button')!
    expect(btn).toBeTruthy()
    expect(btn.textContent).toBe('Submit')
    expect(btn.getAttribute('disabled')).not.toBeNull()
    canvas.remove()
  })

  it('cleans up previous mount on re-render', () => {
    const canvas = createCanvas()

    renderToCanvas(makeRenderContext({ storyFn: () => <div>First</div> }), canvas)
    expect(canvas.textContent).toBe('First')

    renderToCanvas(makeRenderContext({ storyFn: () => <div>Second</div> }), canvas)
    expect(canvas.textContent).toBe('Second')
    // Only one child — previous mount was cleaned up
    expect(canvas.children.length).toBe(1)
    canvas.remove()
  })

  it('disposes reactive effects on cleanup', () => {
    const canvas = createCanvas()
    let effectRunCount = 0

    const count = signal(0)
    function Counter() {
      effect(() => {
        count()
        effectRunCount++
      })
      return <span>{() => `${count()}`}</span>
    }

    renderToCanvas(makeRenderContext({ storyFn: () => <Counter /> }), canvas)

    const initialCount = effectRunCount
    count.set(1)
    expect(effectRunCount).toBe(initialCount + 1)

    // Re-render with a different story — should dispose previous effects
    renderToCanvas(makeRenderContext({ storyFn: () => <div>New story</div> }), canvas)

    const countAfterCleanup = effectRunCount
    count.set(2)
    count.set(3)
    // Effect should NOT have run again — it was disposed
    expect(effectRunCount).toBe(countAfterCleanup)
    canvas.remove()
  })

  it('shows error when storyFn throws an Error', () => {
    const canvas = createCanvas()
    let errorShown: { title: string; description: string } | null = null

    const ctx = {
      storyFn: () => {
        throw new Error('Boom')
      },
      storyContext: { args: {} },
      showMain: () => {
        /* noop */
      },
      showError: (err: { title: string; description: string }) => {
        errorShown = err
      },
      forceRemount: false,
    }

    renderToCanvas(ctx, canvas)

    expect(errorShown).not.toBeNull()
    expect(errorShown!.description).toBe('Boom')
    canvas.remove()
  })

  it('shows error when storyFn throws a non-Error value', () => {
    const canvas = createCanvas()
    let errorShown: { title: string; description: string } | null = null

    const ctx = {
      storyFn: () => {
        throw 'string error'
      },
      storyContext: { args: {} },
      showMain: () => {
        /* noop */
      },
      showError: (err: { title: string; description: string }) => {
        errorShown = err
      },
      forceRemount: false,
    }

    renderToCanvas(ctx, canvas)

    expect(errorShown).not.toBeNull()
    expect(errorShown!.description).toBe('string error')
    canvas.remove()
  })

  it('renders reactive components that update the DOM', () => {
    const canvas = createCanvas()
    const count = signal(0)

    function Counter() {
      return <span data-testid="count">{() => `Count: ${count()}`}</span>
    }

    renderToCanvas(makeRenderContext({ storyFn: () => <Counter /> }), canvas)

    expect(canvas.textContent).toBe('Count: 0')

    count.set(5)
    expect(canvas.textContent).toBe('Count: 5')
    canvas.remove()
  })
})

// ─── defaultRender ───────────────────────────────────────────────────────────

describe('defaultRender', () => {
  it('creates a VNode from component + args', () => {
    function Greeting(props: { name: string }) {
      return <p>Hello, {props.name}!</p>
    }

    const canvas = createCanvas()
    const vnode = defaultRender(Greeting, { name: 'World' })
    const unmount = mount(vnode, canvas)

    expect(canvas.textContent).toBe('Hello, World!')
    unmount()
    canvas.remove()
  })
})

// ─── Type-level tests (Meta / StoryObj) ──────────────────────────────────────

describe('Meta and StoryObj types', () => {
  it('Meta accepts a component and typed args', () => {
    function Button(props: { label: string; variant?: 'primary' | 'secondary' }) {
      return (
        <button type="button" class={props.variant}>
          {props.label}
        </button>
      )
    }

    const meta = {
      component: Button,
      title: 'Button',
      args: { label: 'Click', variant: 'primary' as const },
      tags: ['autodocs'],
    } satisfies Meta<typeof Button>

    expect(meta.component).toBe(Button)
    expect(meta.args!.label).toBe('Click')
  })

  it('StoryObj inherits args from Meta', () => {
    function Input(props: { placeholder: string; disabled?: boolean }) {
      return <input placeholder={props.placeholder} disabled={props.disabled} />
    }

    const _meta = {
      component: Input,
      args: { placeholder: 'Type here' },
    } satisfies Meta<typeof Input>

    type Story = StoryObj<typeof _meta>

    const primary: Story = {
      args: { disabled: true },
    }

    expect(primary.args!.disabled).toBe(true)
  })

  it('StoryObj supports custom render function', () => {
    function Card(props: { title: string }) {
      return (
        <div class="card">
          <h2>{props.title}</h2>
        </div>
      )
    }

    const _meta = {
      component: Card,
      args: { title: 'Default' },
    } satisfies Meta<typeof Card>

    type Story = StoryObj<typeof _meta>

    const withWrapper: Story = {
      render: (args) => (
        <div class="wrapper">
          <Card {...args} />
        </div>
      ),
    }

    const canvas = createCanvas()
    const vnode = withWrapper.render!({ title: 'Custom' }, {} as any)
    const unmount = mount(vnode, canvas)

    expect(canvas.querySelector('.wrapper')).toBeTruthy()
    expect(canvas.querySelector('.card')).toBeTruthy()
    expect(canvas.textContent).toBe('Custom')
    unmount()
    canvas.remove()
  })
})

// ─── Decorators ──────────────────────────────────────────────────────────────

describe('Decorators', () => {
  it('decorator wraps a story', () => {
    function Button(props: { label: string }) {
      return <button>{props.label}</button>
    }

    const withPadding: DecoratorFn<{ label: string }> = (storyFn, context) => {
      return <div style="padding: 1rem">{storyFn(context.args, context)}</div>
    }

    const canvas = createCanvas()
    const storyResult = withPadding((args) => <Button {...args} />, {
      args: { label: 'Wrapped' },
      argTypes: {},
      globals: {},
      id: '1',
      kind: 'Button',
      name: 'Primary',
      viewMode: 'story',
    })

    const unmount = mount(storyResult, canvas)
    expect(canvas.querySelector('div[style]')).toBeTruthy()
    expect(canvas.querySelector('button')!.textContent).toBe('Wrapped')
    unmount()
    canvas.remove()
  })

  it('multiple decorators compose correctly', () => {
    function Text(props: { content: string }) {
      return <span>{props.content}</span>
    }

    const withBorder: DecoratorFn<{ content: string }> = (storyFn, ctx) => (
      <div class="border">{storyFn(ctx.args, ctx)}</div>
    )

    const withTheme: DecoratorFn<{ content: string }> = (storyFn, ctx) => (
      <div class="theme-dark">{storyFn(ctx.args, ctx)}</div>
    )

    const context: StoryContext<{ content: string }> = {
      args: { content: 'Hello' },
      argTypes: {},
      globals: {},
      id: '1',
      kind: 'Text',
      name: 'Default',
      viewMode: 'story',
    }

    // Compose: withTheme(withBorder(story))
    const story: StoryFn<{ content: string }> = (args) => <Text {...args} />
    const decorated = withTheme((_args, ctx) => withBorder(story, ctx), context)

    const canvas = createCanvas()
    const unmount = mount(decorated, canvas)
    expect(canvas.querySelector('.theme-dark')).toBeTruthy()
    expect(canvas.querySelector('.border')).toBeTruthy()
    expect(canvas.querySelector('span')!.textContent).toBe('Hello')
    unmount()
    canvas.remove()
  })
})

// ─── Fragment and multiple children ──────────────────────────────────────────

describe('Fragment stories', () => {
  it('renders a story returning a Fragment', () => {
    const canvas = createCanvas()
    renderToCanvas(
      makeRenderContext({
        storyFn: () => (
          <>
            <p>Line 1</p>
            <p>Line 2</p>
          </>
        ),
      }),
      canvas,
    )

    const paragraphs = canvas.querySelectorAll('p')
    expect(paragraphs.length).toBe(2)
    expect(paragraphs[0]!.textContent).toBe('Line 1')
    expect(paragraphs[1]!.textContent).toBe('Line 2')
    canvas.remove()
  })
})

// ─── Preview render function ─────────────────────────────────────────────────

describe('preview render', () => {
  it('renders a component with args', () => {
    function Badge(props: { text: string }) {
      return <span class="badge">{props.text}</span>
    }

    const canvas = createCanvas()
    const vnode = previewRender({ text: 'New' }, { component: Badge })
    const unmount = mount(vnode, canvas)

    expect(canvas.querySelector('.badge')!.textContent).toBe('New')
    unmount()
    canvas.remove()
  })

  it('throws when no component is provided', () => {
    expect(() => previewRender({ foo: 'bar' }, {})).toThrow(
      '[@pyreon/storybook] No component provided',
    )
  })

  it('throws when component is undefined', () => {
    expect(() => previewRender({ foo: 'bar' }, { component: undefined } as any)).toThrow(
      '[@pyreon/storybook] No component provided',
    )
  })
})

// ─── Decorator wrapping ─────────────────────────────────────────────────────

describe('decorator wrapping', () => {
  it('decorator modifies the rendered VNode structure', () => {
    function Badge(props: { text: string }) {
      return <span class="badge">{props.text}</span>
    }

    const withCard: DecoratorFn<{ text: string }> = (storyFn, ctx) => {
      return (
        <div class="card">
          <h3>Decorated</h3>
          {storyFn(ctx.args, ctx)}
        </div>
      )
    }

    const canvas = createCanvas()
    const context: StoryContext<{ text: string }> = {
      args: { text: 'Info' },
      argTypes: {},
      globals: {},
      id: '1',
      kind: 'Badge',
      name: 'Default',
      viewMode: 'story',
    }

    const decorated = withCard((args) => <Badge {...args} />, context)
    const unmount = mount(decorated, canvas)

    expect(canvas.querySelector('.card')).toBeTruthy()
    expect(canvas.querySelector('h3')!.textContent).toBe('Decorated')
    expect(canvas.querySelector('.badge')!.textContent).toBe('Info')
    unmount()
    canvas.remove()
  })
})

// ─── Component with no args ─────────────────────────────────────────────────

describe('component with no args', () => {
  it('renders a component without any props via renderToCanvas', () => {
    function Logo() {
      return <img src="/logo.png" alt="Logo" />
    }

    const canvas = createCanvas()
    renderToCanvas(
      makeRenderContext({
        storyFn: () => <Logo />,
        args: {},
      }),
      canvas,
    )

    expect(canvas.querySelector('img')).toBeTruthy()
    expect(canvas.querySelector('img')!.getAttribute('alt')).toBe('Logo')
    canvas.remove()
  })

  it('renders a component with no args via defaultRender', () => {
    function Divider() {
      return <hr class="divider" />
    }

    const canvas = createCanvas()
    const vnode = defaultRender(Divider, {})
    const unmount = mount(vnode, canvas)

    expect(canvas.querySelector('hr')).toBeTruthy()
    expect(canvas.querySelector('.divider')).toBeTruthy()
    unmount()
    canvas.remove()
  })

  it('preview render works with empty args', () => {
    function Spinner() {
      return <div class="spinner">Loading...</div>
    }

    const canvas = createCanvas()
    const vnode = previewRender({}, { component: Spinner })
    const unmount = mount(vnode, canvas)

    expect(canvas.querySelector('.spinner')!.textContent).toBe('Loading...')
    unmount()
    canvas.remove()
  })
})

// ─── Error handling ──────────────────────────────────────────────────────────

describe('error handling', () => {
  it('showError is called when storyFn itself throws', () => {
    const canvas = createCanvas()
    let errorShown: { title: string; description: string } | null = null

    renderToCanvas(
      {
        storyFn: () => {
          throw new Error('storyFn exploded')
        },
        storyContext: { args: {} },
        showMain: () => {
          /* noop */
        },
        showError: (err: { title: string; description: string }) => {
          errorShown = err
        },
        forceRemount: false,
      },
      canvas,
    )

    expect(errorShown).not.toBeNull()
    expect(errorShown!.description).toBe('storyFn exploded')
    canvas.remove()
  })

  it('showError receives string-coerced non-Error throws', () => {
    const canvas = createCanvas()
    let errorShown: { title: string; description: string } | null = null

    renderToCanvas(
      {
        storyFn: () => {
          throw 'raw string error'
        },
        storyContext: { args: {} },
        showMain: () => {
          /* noop */
        },
        showError: (err: { title: string; description: string }) => {
          errorShown = err
        },
        forceRemount: false,
      },
      canvas,
    )

    expect(errorShown).not.toBeNull()
    expect(errorShown!.description).toBe('raw string error')
    canvas.remove()
  })

  it('component that throws during setup is handled by the framework', () => {
    const canvas = createCanvas()

    function Broken(): never {
      throw new Error('Component exploded')
    }

    // Pyreon's mount catches component setup errors internally,
    // so renderToCanvas proceeds normally (showMain is called)
    let mainShown = false
    renderToCanvas(
      {
        storyFn: () => <Broken />,
        storyContext: { args: {} },
        showMain: () => {
          mainShown = true
        },
        showError: () => {
          /* noop */
        },
        forceRemount: false,
      },
      canvas,
    )

    // mount() catches the component error internally — renderToCanvas's
    // try/catch does not see it, so showMain is called
    expect(mainShown).toBe(true)
    canvas.remove()
  })
})

// ─── Re-render cleanup ──────────────────────────────────────────────────────

describe('re-render cleanup', () => {
  it('calling renderToCanvas twice cleans up previous mount', () => {
    const canvas = createCanvas()

    renderToCanvas(makeRenderContext({ storyFn: () => <div class="first">First</div> }), canvas)
    expect(canvas.querySelector('.first')).toBeTruthy()

    renderToCanvas(makeRenderContext({ storyFn: () => <div class="second">Second</div> }), canvas)

    // Previous content should be gone
    expect(canvas.querySelector('.first')).toBeNull()
    expect(canvas.querySelector('.second')).toBeTruthy()
    expect(canvas.textContent).toBe('Second')
    canvas.remove()
  })

  it('re-render disposes effects from previous story', () => {
    const canvas = createCanvas()
    let effectCount = 0

    const sig = signal(0)
    function ReactiveStory() {
      effect(() => {
        sig()
        effectCount++
      })
      return <div>Reactive</div>
    }

    renderToCanvas(makeRenderContext({ storyFn: () => <ReactiveStory /> }), canvas)

    const afterFirst = effectCount
    sig.set(1)
    expect(effectCount).toBe(afterFirst + 1)

    // Re-render with a different story
    renderToCanvas(makeRenderContext({ storyFn: () => <div>Static</div> }), canvas)

    const afterSecond = effectCount
    sig.set(2)
    sig.set(3)
    // Old effect should be disposed — count should not increase
    expect(effectCount).toBe(afterSecond)
    canvas.remove()
  })

  it('showMain is called on successful render', () => {
    const canvas = createCanvas()
    let mainShown = false

    renderToCanvas(
      {
        storyFn: () => <div>OK</div>,
        storyContext: { args: {} },
        showMain: () => {
          mainShown = true
        },
        showError: () => {
          /* noop */
        },
        forceRemount: false,
      },
      canvas,
    )

    expect(mainShown).toBe(true)
    canvas.remove()
  })
})

// ─── Missing component in context ───────────────────────────────────────────

describe('missing component in context', () => {
  it('preview render throws when context has no component', () => {
    expect(() => previewRender({ value: 1 }, {})).toThrow(
      '[@pyreon/storybook] No component provided',
    )
  })

  it('preview render throws when context.component is null', () => {
    expect(() => previewRender({ value: 1 }, { component: null } as any)).toThrow(
      '[@pyreon/storybook] No component provided',
    )
  })

  it('renderToCanvas works without component in storyContext when storyFn is provided', () => {
    const canvas = createCanvas()

    renderToCanvas(
      makeRenderContext({
        storyFn: () => <div>No component needed</div>,
      }),
      canvas,
    )

    expect(canvas.textContent).toBe('No component needed')
    canvas.remove()
  })
})
