import { createRequire } from 'node:module'
import { transformJSX_JS } from '@pyreon/compiler'
import { h, _rp } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { transformSync } from 'esbuild'
import { parseSync } from 'oxc-parser'
import { mount } from '../index'
import { _tpl } from '../template'

type Backend = (source: string) => string
const backends: [string, Backend][] = [
  ['JavaScript', (source) => transformJSX_JS(source, 'scope.tsx').code],
]
try {
  const native = createRequire(import.meta.url)(
    '../../../compiler/native/pyreon-compiler.node',
  ) as {
    transformJsx: (source: string, filename: string, ssr: boolean, known: null) => { code: string }
  }
  backends.push(['Rust', (source) => native.transformJsx(source, 'scope.tsx', false, null).code])
} catch {
  // JavaScript remains covered without the optional addon.
}

const expressions: [string, unknown][] = [
  ['((value = sig) => { var sig = 1; return value })()', 3],
  [
    '(() => { class C { static value; static { {var sig = 1} C.value = sig + 1 } } return C.value + sig })()',
    5,
  ],

  ['(() => { switch (sig) { case 3: const sig = 1; return sig + 1 } return 99 })()', 2],
  [
    '(() => { switch (0) { case 0: const sig = 1; if (sig !== 1) throw Error() } return sig + 1 })()',
    4,
  ],
  ['(function({value = sig} = {}) { return value })()', 3],
  ['(({value = sig} = {}) => value)()', 3],
  ['(() => { const {value = sig} = {}; return value })()', 3],
  ['(() => { for (const {value = sig} of [{}]) return value })()', 3],
  ['new (class { read({value = sig} = {}) { return value } })().read()', 3],

  ['(function sig() { return typeof sig })()', 'function'],
  ['(() => { for (const sig of [1]) {} return sig + 1 })()', 4],
  [
    '(() => { for (const {sig} of [{sig: 1}]) { if (sig !== 1) throw Error() } return sig + 1 })()',
    4,
  ],
  ['(() => { { const sig = 1; if (sig !== 1) throw Error() } return sig + 1 })()', 4],
  ['(() => { { const {sig} = {sig: 1}; if (sig !== 1) throw Error() } return sig + 1 })()', 4],
  [
    '(() => { try { throw {sig: 1} } catch ({sig}) { if (sig !== 1) throw Error() } return sig + 1 })()',
    4,
  ],
  ['(() => { for (var sig of [1]) {} return sig + 1 })()', 2],
  ['(() => { { var sig = 1 } return sig + 1 })()', 2],
  ['(() => { class C { get value() { return sig + 1 } } return new C().value })()', 4],
  ['new (class { value = sig + 1 })().value', 4],
  ['new (class { sig() { return sig + 1 } })().sig()', 4],
  ['new (class sig { value = typeof sig })().value', 'function'],
  ['(() => { class C { static value; static { C.value = sig + 1 } } return C.value })()', 4],
  [
    '(() => { class C { static value; static { const sig = 1; C.value = sig + 1 } } return C.value + sig })()',
    5,
  ],
]

for (const [name, compile] of backends) {
  describe(`${name} compiled expression scopes`, () => {
    for (const [expression, expected] of expressions) {
      it(expression, ({ onTestFinished }) => {
        const source = `function App() { const sig = signal(3); return <button onClick={() => capture(${expression})}>read 😀</button> }`
        const output = compile(source)
        expect(parseSync('scope.tsx', output).errors, output).toEqual([])
        const body = transformSync(output.replace(/^import.*$/gm, ''), { loader: 'tsx' }).code
        let result: unknown
        const App = new Function('signal', 'capture', '_tpl', `${body}; return App`)(
          signal,
          (value: unknown) => {
            result = value
          },
          _tpl,
        )
        const container = document.createElement('div')
        document.body.appendChild(container)
        const unmount = mount(h(App, {}), container)
        onTestFinished(() => {
          unmount()
          container.remove()
        })
        container.querySelector('button')!.click()
        expect(result).toBe(expected)
        expect(output).toBe(transformJSX_JS(source, 'scope.tsx').code)
      })
    }
    it('computed object keys read the current prop through the alias', ({ onTestFinished }) => {
      const source = `function App(props) { const alias = props.label; return <button onClick={() => capture(Object.keys({[alias]: true})[0])}>read</button> }`
      const output = compile(source)
      const body = transformSync(output.replace(/^import.*$/gm, ''), { loader: 'tsx' }).code
      let result: unknown
      const label = signal('first')
      const App = new Function('capture', '_tpl', `${body}; return App`)((value: unknown) => {
        result = value
      }, _tpl)
      const container = document.createElement('div')
      document.body.appendChild(container)
      const unmount = mount(h(App, { label: _rp(() => label()) }), container)
      onTestFinished(() => {
        unmount()
        container.remove()
      })
      container.querySelector('button')!.click()
      expect(result).toBe('first')
      label.set('second')
      container.querySelector('button')!.click()
      expect(result).toBe('second')
      expect(output).toBe(transformJSX_JS(source, 'scope.tsx').code)
    })
  })
}
