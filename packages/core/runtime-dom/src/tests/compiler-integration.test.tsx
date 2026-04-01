/**
 * Compiler Integration Tests
 *
 * Full pipeline: source code -> transformJSX -> runtime mount -> signal change -> DOM verification.
 *
 * The compiler emits code referencing _tpl, _bind, _bindText, _bindDirect, _rp, h.
 * We strip the import lines from compiler output, inject dependencies via Function
 * constructor, execute, mount the result, and assert DOM state.
 */
import { transformJSX } from '@pyreon/compiler'
import { Fragment, h, _rp, makeReactiveProps } from '@pyreon/core'
import { _bind, signal } from '@pyreon/reactivity'
import { _tpl, _bindText, _bindDirect, _applyProps } from '../template'
import { mountChild } from '../mount'
import { mount } from '../index'

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Strip import lines from compiler output — we pass deps via Function args. */
function stripImports(code: string): string {
  return code.replace(/^import\s+.*$/gm, '').trim()
}

/** Runtime deps that the compiler output references. */
const RUNTIME_DEPS = {
  _tpl,
  _bind,
  _bindText,
  _bindDirect,
  _applyProps,
  _rp,
  h,
  Fragment,
  signal,
  document,
} as const

const DEP_NAMES = Object.keys(RUNTIME_DEPS)
const DEP_VALUES = Object.values(RUNTIME_DEPS)

/**
 * Compile JSX source and execute it, returning the resulting NativeItem or VNode.
 * For component definitions, pass the component source and call it separately.
 */
function compileExpression(source: string) {
  const result = transformJSX(source, 'test.tsx')
  const body = stripImports(result.code)
  return { body, code: result.code }
}

/**
 * Compile a standalone JSX expression (not a component), execute it,
 * mount it into a container, and return { container, cleanup, code }.
 */
function compileAndMount(
  source: string,
  globals: Record<string, unknown> = {},
) {
  const { body, code } = compileExpression(source)

  const globalNames = Object.keys(globals)
  const globalValues = Object.values(globals)

  // The body is an expression (e.g. _tpl(...)) — wrap in return
  const fn = new Function(
    ...DEP_NAMES,
    ...globalNames,
    `return ${body}`,
  )

  const result = fn(...DEP_VALUES, ...globalValues)
  const container = document.createElement('div')
  document.body.appendChild(container)
  const cleanup = mountChild(result, container)

  return { container, cleanup, code }
}

/**
 * Compile a component definition, extract the component function,
 * mount it with given props, and return { container, cleanup, code }.
 */
function compileComponent(
  source: string,
  props: Record<string, unknown> = {},
  globals: Record<string, unknown> = {},
) {
  const { body, code } = compileExpression(source)

  const globalNames = Object.keys(globals)
  const globalValues = Object.values(globals)

  // Component defs are statements like `const Comp = (props) => _tpl(...)`.
  // We execute the body then return the named component.
  // Extract the component name from the source.
  const nameMatch = body.match(/^const\s+(\w+)\s*=/)
  if (!nameMatch) throw new Error('Could not find component name in compiled output')
  const compName = nameMatch[1]

  const fn = new Function(
    ...DEP_NAMES,
    ...globalNames,
    `${body}\nreturn ${compName}`,
  )

  const Component = fn(...DEP_VALUES, ...globalValues)

  // Build reactive props (same as what the runtime does when mounting h(Comp, props))
  const container = document.createElement('div')
  document.body.appendChild(container)

  const vnode = h(Component, props)
  const cleanup = mountChild(vnode, container)

  return { container, cleanup, code }
}

function createContainer(): HTMLDivElement {
  const el = document.createElement('div')
  document.body.appendChild(el)
  return el
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('compiler integration — signal text reactivity', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('signal() in text — _bindText updates DOM on signal.set', () => {
    const count = signal(0)
    const { container } = compileAndMount(
      '<div>{count()}</div>',
      { count },
    )

    expect(container.querySelector('div')!.textContent).toBe('0')

    count.set(42)
    expect(container.querySelector('div')!.textContent).toBe('42')

    count.set(-1)
    expect(container.querySelector('div')!.textContent).toBe('-1')
  })

  it('two independent signals — changing one does not affect the other', () => {
    const a = signal('hello')
    const b = signal('world')
    const { container } = compileAndMount(
      '<div><span>{a()}</span><span>{b()}</span></div>',
      { a, b },
    )

    const spans = container.querySelectorAll('span')
    expect(spans[0]!.textContent).toBe('hello')
    expect(spans[1]!.textContent).toBe('world')

    a.set('changed')
    expect(spans[0]!.textContent).toBe('changed')
    expect(spans[1]!.textContent).toBe('world')

    b.set('updated')
    expect(spans[0]!.textContent).toBe('changed')
    expect(spans[1]!.textContent).toBe('updated')
  })
})

describe('compiler integration — props reactivity', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('props.name in text — reactive via _bind', () => {
    const name = signal('Alice')
    const { container } = compileComponent(
      'const Comp = (props) => <div>{props.name}</div>',
      { name: _rp(() => name()) },
    )

    expect(container.querySelector('div')!.textContent).toBe('Alice')

    name.set('Bob')
    expect(container.querySelector('div')!.textContent).toBe('Bob')
  })

  it('const x = props.y ?? "def" — compiler inlines props.y, reactive', () => {
    const y = signal<string | undefined>(undefined)
    const { container } = compileComponent(
      'const Comp = (props) => { const x = props.y ?? "def"; return <div>{x}</div> }',
      { y: _rp(() => y()) },
    )

    // Initially undefined, so ?? "def" should produce "def"
    expect(container.querySelector('div')!.textContent).toBe('def')

    y.set('custom')
    expect(container.querySelector('div')!.textContent).toBe('custom')

    y.set(undefined)
    expect(container.querySelector('div')!.textContent).toBe('def')
  })

  it('multiple uses of same const derived from props — both update', () => {
    const y = signal('A')
    const { container } = compileComponent(
      'const Comp = (props) => { const x = props.y; return <div><span>{x}</span><p>{x}</p></div> }',
      { y: _rp(() => y()) },
    )

    expect(container.querySelector('span')!.textContent).toBe('A')
    expect(container.querySelector('p')!.textContent).toBe('A')

    y.set('B')
    expect(container.querySelector('span')!.textContent).toBe('B')
    expect(container.querySelector('p')!.textContent).toBe('B')
  })

  it('let x = props.y — NOT reactive (let is mutable, unsafe to inline)', () => {
    const y = signal('initial')
    const { container } = compileComponent(
      'const Comp = (props) => { let x = props.y; return <div>{x}</div> }',
      { y: _rp(() => y()) },
    )

    // Initial value captured at component creation time
    expect(container.querySelector('div')!.textContent).toBe('initial')

    // Signal change should NOT update — let variables are not inlined
    y.set('changed')
    expect(container.querySelector('div')!.textContent).toBe('initial')
  })
})

describe('compiler integration — class attribute reactivity', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('class={cls()} — _bindDirect updates className on signal change', () => {
    const cls = signal('active')
    const { container } = compileAndMount(
      '<div class={cls()}></div>',
      { cls },
    )

    expect(container.querySelector('div')!.className).toBe('active')

    cls.set('inactive')
    expect(container.querySelector('div')!.className).toBe('inactive')

    cls.set('')
    expect(container.querySelector('div')!.className).toBe('')
  })
})

describe('compiler integration — static content', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('purely static JSX — no bindings, renders correctly', () => {
    const { container, code } = compileAndMount(
      '<div class="box"><span>hello</span></div>',
    )

    expect(container.querySelector('div')!.className).toBe('box')
    expect(container.querySelector('span')!.textContent).toBe('hello')
    // Verify the compiler output has no reactive bindings
    expect(code).toContain('() => null')
  })
})

describe('compiler integration — SVG', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('SVG element renders correctly via _tpl', () => {
    const { container } = compileAndMount(
      '<svg><circle cx="50" cy="50" r="40"></circle></svg>',
    )

    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    const circle = container.querySelector('circle')
    expect(circle).not.toBeNull()
    expect(circle!.getAttribute('cx')).toBe('50')
    expect(circle!.getAttribute('cy')).toBe('50')
    expect(circle!.getAttribute('r')).toBe('40')
  })
})

describe('compiler integration — component element with _rp', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('component prop wrapped with _rp — reactive when signal changes', () => {
    const name = signal('Alice')
    let mountCount = 0

    const MyComponent = (props: { name: string }) => {
      mountCount++
      return h('span', null, () => props.name)
    }

    // The compiler emits: <MyComponent name={_rp(() => count())} />
    // which is equivalent to h(MyComponent, { name: _rp(() => name()) })
    const container = createContainer()
    mount(h(MyComponent, { name: _rp(() => name()) }), container)

    expect(mountCount).toBe(1)
    expect(container.querySelector('span')!.textContent).toBe('Alice')

    name.set('Bob')
    expect(mountCount).toBe(1) // no remount
    expect(container.querySelector('span')!.textContent).toBe('Bob')
  })
})

describe('compiler integration — compiler output structure', () => {
  it('signal in text emits _bindText import and call', () => {
    const { code } = transformJSX('<div>{count()}</div>', 'test.tsx')
    expect(code).toContain('import { _tpl, _bindText } from "@pyreon/runtime-dom"')
    expect(code).toContain('_bindText(count,')
  })

  it('props.name emits _bind import from @pyreon/reactivity', () => {
    const { code } = transformJSX(
      'const Comp = (props) => <div>{props.name}</div>',
      'test.tsx',
    )
    expect(code).toContain('import { _bind } from "@pyreon/reactivity"')
    expect(code).toContain('_bind(() => { __t0.data = props.name })')
  })

  it('class={cls()} emits _bindDirect', () => {
    const { code } = transformJSX('<div class={cls()}></div>', 'test.tsx')
    expect(code).toContain('_bindDirect(cls,')
    expect(code).toContain('__root.className')
  })

  it('component reactive prop emits _rp wrapping', () => {
    const { code } = transformJSX('<Button label={getText()} />', 'test.tsx')
    expect(code).toContain('_rp(() => getText())')
  })

  it('const from props gets inlined back to props.y in JSX', () => {
    const { code } = transformJSX(
      'const Comp = (props) => { const x = props.y; return <div>{x}</div> }',
      'test.tsx',
    )
    // Compiler inlines: const x = props.y → uses props.y directly in _bind
    expect(code).toContain('__t0.data = (props.y)')
  })

  it('let from props does NOT get inlined — uses captured value', () => {
    const { code } = transformJSX(
      'const Comp = (props) => { let x = props.y; return <div>{x}</div> }',
      'test.tsx',
    )
    // let is not inlined — uses static textContent assignment
    expect(code).toContain('__root.textContent = x')
    expect(code).not.toContain('_bind')
  })

  it('static JSX emits _tpl with null bind function', () => {
    const { code } = transformJSX(
      '<div class="box"><span>hello</span></div>',
      'test.tsx',
    )
    expect(code).toContain('() => null')
    expect(code).not.toContain('_bind')
    expect(code).not.toContain('_bindText')
  })
})

// ─── Additional edge cases ──────────────────────────────────────────────────

describe('compiler integration — prop-derived with defaults', () => {
  afterEach(() => { document.body.innerHTML = '' })

  it('props.x ?? default — starts with default, updates when set', () => {
    const x = signal<string | undefined>(undefined)
    const { container } = compileComponent(
      'const Comp = (props) => { const label = props.x ?? "fallback"; return <span>{label}</span> }',
      { x: _rp(() => x()) },
    )
    expect(container.querySelector('span')!.textContent).toBe('fallback')
    x.set('real')
    expect(container.querySelector('span')!.textContent).toBe('real')
    x.set(undefined)
    expect(container.querySelector('span')!.textContent).toBe('fallback')
  })

  it('props.x || default — falsy fallback works', () => {
    const x = signal('')
    const { container } = compileComponent(
      'const Comp = (props) => { const v = props.x || "empty"; return <span>{v}</span> }',
      { x: _rp(() => x()) },
    )
    expect(container.querySelector('span')!.textContent).toBe('empty')
    x.set('filled')
    expect(container.querySelector('span')!.textContent).toBe('filled')
  })
})

describe('compiler integration — ternary and expressions', () => {
  afterEach(() => { document.body.innerHTML = '' })

  it('ternary with signal — updates on change', () => {
    const on = signal(true)
    const { container } = compileAndMount(
      '<div>{on() ? "yes" : "no"}</div>',
      { on },
    )
    expect(container.querySelector('div')!.textContent).toBe('yes')
    on.set(false)
    expect(container.querySelector('div')!.textContent).toBe('no')
  })

  it('template literal with signal', () => {
    const name = signal('world')
    const { container } = compileAndMount(
      '<div>{`hello ${name()}`}</div>',
      { name },
    )
    expect(container.querySelector('div')!.textContent).toBe('hello world')
    name.set('Pyreon')
    expect(container.querySelector('div')!.textContent).toBe('hello Pyreon')
  })

  it('arithmetic with signal', () => {
    const n = signal(5)
    const { container } = compileAndMount(
      '<div>{n() * 2 + 1}</div>',
      { n },
    )
    expect(container.querySelector('div')!.textContent).toBe('11')
    n.set(10)
    expect(container.querySelector('div')!.textContent).toBe('21')
  })
})

describe('compiler integration — multiple attributes', () => {
  afterEach(() => { document.body.innerHTML = '' })

  it('reactive class + static id', () => {
    const cls = signal('a')
    const { container } = compileAndMount(
      '<div id="fixed" class={cls()}></div>',
      { cls },
    )
    const div = container.querySelector('div')!
    expect(div.id).toBe('fixed')
    expect(div.className).toBe('a')
    cls.set('b')
    expect(div.id).toBe('fixed')
    expect(div.className).toBe('b')
  })

  it('reactive style string', () => {
    const color = signal('red')
    const { container } = compileAndMount(
      '<div style={`color: ${color()}`}></div>',
      { color },
    )
    expect(container.querySelector('div')!.style.color).toBe('red')
    color.set('blue')
    expect(container.querySelector('div')!.style.color).toBe('blue')
  })
})

describe('compiler integration — prop-derived in attributes', () => {
  afterEach(() => { document.body.innerHTML = '' })

  it('const cls = props.class ?? "default" on class attr', () => {
    const c = signal<string | undefined>(undefined)
    const { container } = compileComponent(
      'const Comp = (props) => { const cls = props.class ?? "default"; return <div class={cls}></div> }',
      { class: _rp(() => c()) },
    )
    expect(container.querySelector('div')!.className).toBe('default')
    c.set('custom')
    expect(container.querySelector('div')!.className).toBe('custom')
  })
})

describe('compiler integration — no false inlining', () => {
  it('.map callback param not treated as props', () => {
    const { code } = transformJSX(
      'function App(props) { return <div>{items.map((item) => { const name = item.name; return <span>{name}</span> })}</div> }',
      'test.tsx',
    )
    // item.name should NOT be inlined — item is a callback param, not props
    expect(code).not.toContain('(item.name)')
  })

  it('property access obj.x where x is also a prop-derived var', () => {
    const { code } = transformJSX(
      'const Comp = (props) => { const x = props.x; return <div>{other.x}</div> }',
      'test.tsx',
    )
    // other.x should stay as other.x — not replaced with (props.x)
    // sliceExpr only replaces standalone identifiers, not property access
    expect(code).not.toContain('other.(props.x)')
  })
})
