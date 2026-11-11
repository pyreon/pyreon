// @vitest-environment happy-dom
/**
 * `migrateReactCode` must produce Pyreon that UPDATES, not just Pyreon that
 * parses. Every case here runs the migrated output through the whole chain:
 *
 *   1. no `manual` notes (the case is one the migrator claims to convert);
 *   2. both `validate` detector sets (`detectReactPatterns` +
 *      `detectPyreonPatterns`) report nothing;
 *   3. it TYPECHECKS against the real `@pyreon/*` types (a dangling `setCount`
 *      or `count + 1` on a signal is a type error);
 *   4. it compiles with the real compiler (`transformJSX`) and, mounted in a
 *      DOM, reacts to the interaction the React original reacted to.
 *
 * #4287: a plain useState counter migrated to `const count = signal(0)` but
 * kept `setCount(count + 1)` and `${count}` — a ReferenceError on click and a
 * signal stringified into the page.
 */
import * as pyreonCore from '@pyreon/core'
import * as pyreonReactivity from '@pyreon/reactivity'
import * as pyreonRuntimeDom from '@pyreon/runtime-dom'
import { query } from '@pyreon/test-utils'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { transformJSX } from '../jsx'
import { detectPyreonPatterns } from '../pyreon-intercept'
import { detectReactPatterns, migrateReactCode } from '../react-intercept'

const PKG_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

interface Case {
  name: string
  source: string
  /** Interact with the mounted component and assert the DOM reacted. */
  run: (root: HTMLElement, exports: Record<string, unknown>) => void | Promise<void>
  /** Export to mount (omit when the module mounts itself). */
  mount?: string
}

const click = (root: ParentNode, selector: string): void => query(root, selector).click()
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

const CASES: Case[] = [
  {
    name: 'useState counter (the reported shape)',
    source: `import { useState } from 'react'

export function Counter() {
  const [count, setCount] = useState(0)
  return <button title={\`clicked \${count}\`} onClick={() => setCount(count + 1)}>Count: {count}</button>
}
`,
    mount: 'Counter',
    run: (root) => {
      const btn = query(root, 'button')
      btn.click()
      btn.click()
      btn.click()
      expect(btn.textContent).toBe('Count: 3')
      expect(btn.getAttribute('title')).toBe('clicked 3')
    },
  },
  {
    name: 'useState: updater, lazy initializer, typed state, setter passed as a prop, onChange on a text input',
    source: `import { useState } from 'react'

export function Todo(props: { initial: string[] }) {
  const [items, setItems] = useState<string[]>(() => [...props.initial])
  const [text, setText] = useState('')
  const add = () => {
    setItems((prev) => [...prev, text])
    setText('')
  }
  return (
    <div>
      <input value={text} onChange={(e) => setText(e.currentTarget.value)} />
      <button class="add" onClick={add}>Add</button>
      <p class="count">{items.length} items</p>
      <p class="text">{text}</p>
      <Child onReset={setText} />
    </div>
  )
}

function Child(props: { onReset: (v: string) => void }) {
  return <button class="reset" onClick={() => props.onReset('reset')}>reset</button>
}

export function Mounted() {
  return <Todo initial={['a']} />
}
`,
    mount: 'Mounted',
    run: (root) => {
      const input = query(root, 'input')
      expect(query(root, '.count').textContent).toBe('1 items')
      input.value = 'b'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      expect(query(root, '.text').textContent).toBe('b')
      click(root, '.add')
      expect(query(root, '.count').textContent).toBe('2 items')
      expect(query(root, '.text').textContent).toBe('')
      click(root, '.reset')
      expect(query(root, '.text').textContent).toBe('reset')
    },
  },
  {
    name: 'useEffect with deps, useEffect([]) with cleanup, useLayoutEffect',
    source: `import { useEffect, useLayoutEffect, useState } from 'react'

export function Clock() {
  const [count, setCount] = useState(0)
  const [log, setLog] = useState('')
  useEffect(() => {
    document.body.dataset.mounted = 'yes'
    return () => {
      document.body.dataset.mounted = 'no'
    }
  }, [])
  useEffect(() => {
    document.title = \`Count: \${count}\`
  }, [count])
  useLayoutEffect(() => {
    setLog(\`rendered \${count}\`)
  }, [count])
  return <button onClick={() => setCount((c) => c + 1)}>{log}</button>
}
`,
    mount: 'Clock',
    run: (root) => {
      expect(document.body.dataset.mounted).toBe('yes')
      const btn = query(root, 'button')
      expect(btn.textContent).toBe('rendered 0')
      btn.click()
      btn.click()
      expect(document.title).toBe('Count: 2')
      expect(btn.textContent).toBe('rendered 2')
    },
  },
  {
    name: 'useMemo and useCallback',
    source: `import { useCallback, useMemo, useState } from 'react'

export function Totals() {
  const [price, setPrice] = useState(10)
  const [qty, setQty] = useState(2)
  const total = useMemo(() => price * qty, [price, qty])
  const double = useCallback(() => setQty(qty * 2), [qty])
  return (
    <div>
      <span class="total">{total}</span>
      <button class="double" onClick={double}>x2</button>
      <button class="inc" onClick={() => setPrice(price + 1)}>+1</button>
      <p class="size">{total > 30 ? 'big' : 'small'}</p>
    </div>
  )
}
`,
    mount: 'Totals',
    run: (root) => {
      expect(query(root, '.total').textContent).toBe('20')
      click(root, '.double')
      expect(query(root, '.total').textContent).toBe('40')
      expect(query(root, '.size').textContent).toBe('big')
      click(root, '.inc')
      expect(query(root, '.total').textContent).toBe('44')
    },
  },
  {
    name: 'useRef(null) as a DOM ref, useRef(value) as a mutable box, an effect that reads the DOM ref',
    source: `import { useEffect, useRef, useState } from 'react'

export function Focus() {
  const [n, setN] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  const clicks = useRef(0)
  useEffect(() => {
    box.current!.dataset.n = String(n)
  }, [n])
  return (
    <div ref={box}>
      <button onClick={() => { clicks.current += 1; setN(clicks.current) }}>go</button>
    </div>
  )
}
`,
    mount: 'Focus',
    run: (root) => {
      const div = query(root, 'div')
      expect(div.dataset.n).toBe('0')
      click(root, 'button')
      click(root, 'button')
      expect(div.dataset.n).toBe('2')
    },
  },
  {
    name: 'memo() and forwardRef() wrappers, className and htmlFor',
    source: `import { forwardRef, memo, useRef } from 'react'

export const Label = memo(function Label(props: { text: string }) {
  return <label htmlFor="name" className="label">{props.text}</label>
})

export const Input = forwardRef<HTMLInputElement, { name: string }>((props, ref) => (
  <input ref={ref} id={props.name} className="input" />
))

export function Form() {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div>
      <Label text="Name" />
      <Input name="name" ref={inputRef} />
      <button onClick={() => { inputRef.current!.value = 'via ref' }}>fill</button>
    </div>
  )
}
`,
    mount: 'Form',
    run: (root) => {
      expect(query(root, 'label').getAttribute('for')).toBe('name')
      expect(query(root, 'label').getAttribute('class')).toBe('label')
      expect(query(root, 'input').getAttribute('class')).toBe('input')
      click(root, 'button')
      expect(query(root, 'input').value).toBe('via ref')
    },
  },
  {
    name: 'useReducer with a named reducer, and with an inline reducer plus an init function',
    source: `import { useReducer } from 'react'

function reducer(state: number, action: 'inc' | 'dec') {
  return action === 'inc' ? state + 1 : state - 1
}

export function Stepper() {
  const [n, dispatch] = useReducer(reducer, 0)
  const [m, add] = useReducer((s: number, a: number) => s + a, 1, (x: number) => x * 10)
  return (
    <div>
      <button class="n" onClick={() => dispatch('inc')}>{n}</button>
      <button class="m" onClick={() => add(5)}>{m}</button>
    </div>
  )
}
`,
    mount: 'Stepper',
    run: (root) => {
      click(root, '.n')
      click(root, '.n')
      expect(query(root, '.n').textContent).toBe('2')
      expect(query(root, '.m').textContent).toBe('10')
      click(root, '.m')
      expect(query(root, '.m').textContent).toBe('15')
    },
  },
  {
    name: 'state read at setup: a derived const, a shadowing parameter, a conditional return',
    source: `import React, { useState } from 'react'

export function Derived(props: { step: number }) {
  const [count, setCount] = React.useState(0)
  const bump = (count: number) => count + props.step
  const doubled = count * 2
  const summary = \`double: \${doubled}\`
  return count > 1 ? (
    <p class="done">{summary}</p>
  ) : (
    <button onClick={() => setCount(bump(count))}>{summary}</button>
  )
}

export function Mounted() {
  return <Derived step={1} />
}
`,
    mount: 'Mounted',
    run: (root) => {
      expect(query(root, 'button').textContent).toBe('double: 0')
      click(root, 'button')
      expect(query(root, 'button').textContent).toBe('double: 2')
      click(root, 'button')
      expect(query(root, '.done').textContent).toBe('double: 4')
    },
  },
  {
    name: 'createContext / useContext / Fragment, and createRoot(el).render(app)',
    source: `import { createContext, Fragment, useContext } from 'react'
import { createRoot } from 'react-dom/client'

const Theme = createContext('light')

function Badge() {
  const theme = useContext(Theme)
  return <Fragment><span className={theme}>badge</span></Fragment>
}

createRoot(document.getElementById('app')!).render(<Badge />)
`,
    run: (root) => {
      expect(query(root, 'span').getAttribute('class')).toBe('light')
    },
  },
]

// ── harness ───────────────────────────────────────────────────────────────────

const MODULES: Record<string, unknown> = {
  '@pyreon/core': pyreonCore,
  '@pyreon/reactivity': pyreonReactivity,
  '@pyreon/runtime-dom': pyreonRuntimeDom,
}

/** transformJSX (pass 1) → TypeScript JSX lowering to h() + CJS (pass 2) → evaluate. */
function evaluate(code: string): Record<string, unknown> {
  const compiled = transformJSX(code, 'migrated.tsx').code
  const cjs = ts.transpileModule(compiled, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.React,
      jsxFactory: '__h',
      jsxFragmentFactory: '__Fragment',
    },
    fileName: 'migrated.tsx',
  }).outputText
  const exports: Record<string, unknown> = {}
  const require = (id: string): unknown => {
    const mod = MODULES[id]
    if (!mod) throw new Error(`unexpected import ${id}`)
    return mod
  }
  new Function('require', 'exports', '__h', '__Fragment', cjs)(
    require,
    exports,
    pyreonCore.h,
    pyreonCore.Fragment,
  )
  return exports
}

/** Typecheck every migrated module against the real @pyreon/* types, in one program. */
function typecheck(files: Map<string, string>): Map<string, string[]> {
  const configPath = join(PKG_DIR, 'tsconfig.json')
  const parsed = ts.getParsedCommandLineOfConfigFile(
    configPath,
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: () => {},
    },
  )!
  const options: ts.CompilerOptions = {
    ...parsed.options,
    lib: ['lib.esnext.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
    jsx: ts.JsxEmit.ReactJSX,
    jsxImportSource: '@pyreon/core',
    noEmit: true,
    types: [],
    noUnusedLocals: false,
    noUnusedParameters: false,
  }
  const host = ts.createCompilerHost(options)
  const getSourceFile = host.getSourceFile.bind(host)
  host.getSourceFile = (fileName, lang, ...rest) => {
    const virtual = files.get(fileName)
    if (virtual !== undefined)
      return ts.createSourceFile(fileName, virtual, lang, true, ts.ScriptKind.TSX)
    return getSourceFile(fileName, lang, ...rest)
  }
  const fileExists = host.fileExists.bind(host)
  host.fileExists = (f) => files.has(f) || fileExists(f)
  const program = ts.createProgram([...files.keys()], options, host)
  const out = new Map<string, string[]>()
  for (const fileName of files.keys()) {
    const sf = program.getSourceFile(fileName)!
    const errors = [
      ...program.getSyntacticDiagnostics(sf),
      ...program.getSemanticDiagnostics(sf),
    ].map((d) => {
      const { line } = sf.getLineAndCharacterOfPosition(d.start ?? 0)
      return `L${line + 1}: ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`
    })
    out.set(fileName, errors)
  }
  return out
}

const migrated = CASES.map((c) => ({ ...c, result: migrateReactCode(c.source, 'input.tsx') }))
let typeErrors: Map<string, string[]>
const fileOf = (i: number): string => join(PKG_DIR, 'src', 'tests', `__migrated_${i}__.tsx`)

beforeAll(() => {
  typeErrors = typecheck(new Map(migrated.map((m, i) => [fileOf(i), m.result.code])))
}, 120_000)

describe('migrateReactCode — the output is Pyreon that updates', () => {
  migrated.forEach((m, i) => {
    describe(m.name, () => {
      it('converts every pattern (no manual notes)', () => {
        expect(m.result.manual, m.result.code).toEqual([])
      })

      it('passes both validate detector sets', () => {
        const findings = [
          ...detectReactPatterns(m.result.code, 'out.tsx'),
          ...detectPyreonPatterns(m.result.code, 'out.tsx'),
        ].map((d) => `${d.code}@${d.line}: ${d.message}`)
        expect(findings, m.result.code).toEqual([])
      })

      it('typechecks against the real @pyreon/* types', () => {
        expect(typeErrors.get(fileOf(i)), m.result.code).toEqual([])
      })

      it('compiles and reacts like the React original', async () => {
        document.body.innerHTML = '<div id="app"></div>'
        const root = document.getElementById('app')!
        const exports = evaluate(m.result.code)
        let unmount: (() => void) | undefined
        if (m.mount) {
          unmount = pyreonRuntimeDom.mount(
            pyreonCore.h(exports[m.mount] as pyreonCore.ComponentFn, {}),
            root,
          )
        }
        await flush()
        await m.run(root, exports)
        unmount?.()
      })
    })
  })
})
