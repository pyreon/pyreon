import { createRequire } from 'node:module'
import { transformJSX_JS } from '@pyreon/compiler'
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { transformSync } from 'esbuild'
import { parseSync } from 'oxc-parser'
import { mount } from '../index'
import { _tpl } from '../template'

type Backend = (source: string) => string
const backends: [string, Backend][] = [
  ['JavaScript', (source) => transformJSX_JS(source, 'calls.tsx').code],
]
try {
  const native = createRequire(import.meta.url)(
    '../../../compiler/native/pyreon-compiler.node',
  ) as {
    transformJsx: (source: string, filename: string, ssr: boolean, known: null) => { code: string }
  }
  backends.push(['Rust', (source) => native.transformJsx(source, 'calls.tsx', false, null).code])
} catch {
  // The JavaScript contract runs without the optional addon; Rust runs when built.
}

const calls = [
  '(() => { for (const count of [0]) {} count?.[method]?.(count + step) })()',
  '(() => { { const method = "ignored" } (count as typeof count)?.[method](count + step) })()',
  'new (class { run() { count?.set(count + step) } })().run()',
  'count.set(count + step)',
  'count?.set(count + step)',
  'count.set?.(count + step)',
  'count?.set?.(count + step)',
  'count["set"](count + step)',
  'count?.["set"](count + step)',
  'count[method](count + step)',
  'count?.[method]?.(count + step)',
  '(count as typeof count).set(count + step)',
  '(count.set as typeof count.set)(count + step)',
  '(count?.set)(count + step)',
  '(count?.[method])(count + step)',
  'count!.set(count + step)',
  'count.set(count?.() + step)',
  'count.set(count!() + step)',
  'count.set((count as typeof count)() + step)',
]

for (const [name, compile] of backends) {
  describe(`${name} compiled signal calls preserve the callable`, () => {
    for (const call of calls)
      it(call, ({ onTestFinished }) => {
        let state = signal(0)
        const source = `function App(props) {
        const count = signal(1)
        const method = signal('set')
        const step = props.step
        capture(count)
        return <button onClick={() => ${call}}>increment 😀</button>
      }`
        const output = compile(source)
        expect(parseSync('calls.tsx', output).errors, output).toEqual([])
        expect(output).toBe(transformJSX_JS(source, 'calls.tsx').code)
        const body = transformSync(output.replace(/^import.*$/gm, ''), { loader: 'tsx' }).code
        const App = new Function('signal', 'capture', '_tpl', `${body}; return App`)(
          signal,
          (value: typeof state) => {
            state = value
          },
          _tpl,
        )
        const container = document.createElement('div')
        document.body.appendChild(container)
        const unmount = mount(h(App, { step: 2 }), container)
        onTestFinished(() => {
          unmount()
          container.remove()
        })
        const button = container.querySelector('button')!
        button.click()
        expect(state()).toBe(3)
        button.click()
        expect(state()).toBe(5)
      })
  })
}
