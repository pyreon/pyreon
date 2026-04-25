import { transformJSX } from '../jsx'

const t = (code: string) => transformJSX(code, 'input.tsx').code

describe('T0.2 — chain depth stress test', () => {
  for (const depth of [4, 5, 10, 20, 50]) {
    test(`depth ${depth} chain compiles without crashing`, () => {
      const lines = ['const v0 = props.x']
      for (let i = 1; i <= depth; i++) lines.push(`const v${i} = v${i - 1} + 1`)
      const code = `function Comp(props) { ${lines.join('; ')}; return <div>{v${depth}}</div> }`
      const result = t(code)
      expect(result).toContain('props.x')
      expect(result).toContain('_bind')
    })
  }
})
