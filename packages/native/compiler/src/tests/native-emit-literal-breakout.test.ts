// Differential breakout fuzz for emitted string literals (security).
//
// A string in shared .tsx source must stay TEXT on iOS and Android. Several
// native emit plugins spliced such strings without the central quoters
// (`swiftStr` / `kotlinStr`), so the text became Swift or Kotlin CODE:
//
//   - `@pyreon/validation`: `.regex()` / `.url({ protocol })` were written
//     into a Swift RAW string `#"…"#`, where `\#(…)` still interpolates —
//     arbitrary Swift from a regex, reachable from an untrusted OpenAPI
//     `pattern` through lathe's multiplatform output.
//   - Kotlin `$name` / `${…}` string templates via `JSON.stringify` (charts
//     theme/labels, flow node data / toolbars / FlowWebView HTML, url-state
//     defaults, rocketstyle / styled / token values).
//   - `@pyreon/dnd` `useDraggable({ data })` keys written raw into `"…"`.
//   - enum-case splices of free strings: the HTTP `method` (`.${m}`) and a
//     flow `<Handle position>` — now closed allow-lists.
//
// Each case below puts a payload carrying every breakout shape into ONE
// input of a fixed site, compiles through the real first-party compiler, and
// asserts the marker `pwn` never lands in CODE context of the emitted Swift
// or Kotlin (outside string text and comments). The scanner is a small
// lexer for both targets' string / raw-string / interpolation grammar.

import { describe, expect, it } from 'vitest'
import { emitKotlinStyleModifier, emitSwiftStyleModifier } from '../emit-style'
import { emitKotlinTokens, emitSwiftTokens } from '../emit-tokens'
import {
  emitKotlinRocketstyleModifier,
  emitSwiftRocketstyleModifier,
} from '../../../../ui-system/rocketstyle/src/native-plugin/emit-rocketstyle'
import { parseRocketstyle } from '../../../../ui-system/rocketstyle/src/native-plugin/parse-rocketstyle'
import { transform } from './first-party-plugins'

type Target = 'swift' | 'kotlin'

/**
 * Every place the marker `pwn(` or a `$pwn` template sits in CODE context.
 * Inputs only ever put the marker inside strings, keys and text, so any hit
 * is a breakout.
 */
export function codeHits(src: string, lang: Target): string[] {
  const hits: string[] = []
  type Mode = { k: 'code'; close: string | null; depth: number } | { k: 'str'; triple: boolean; hashes: number; raw: boolean }
  const st: Mode[] = [{ k: 'code', close: null, depth: 0 }]
  const at = (p: number) => src.slice(Math.max(0, p - 80), p + 12).replace(/\n/g, '⏎')
  let i = 0
  const n = src.length
  while (i < n) {
    const m = st[st.length - 1]!
    const c = src[i]!
    if (m.k === 'code') {
      if (src.startsWith('pwn(', i) && !/[A-Za-z0-9_$]/.test(src[i - 1] ?? '')) {
        hits.push(at(i))
        i += 3
        continue
      }
      if (src.startsWith('//', i)) {
        while (i < n && src[i] !== '\n') i++
        continue
      }
      if (src.startsWith('/*', i)) {
        const e = src.indexOf('*/', i + 2)
        i = e < 0 ? n : e + 2
        continue
      }
      if (lang === 'swift' && c === '#') {
        let h = 0
        while (src[i + h] === '#') h++
        if (src[i + h] === '"') {
          const triple = src.startsWith('"""', i + h)
          st.push({ k: 'str', triple, hashes: h, raw: false })
          i += h + (triple ? 3 : 1)
          continue
        }
      }
      if (c === '"') {
        const triple = src.startsWith('"""', i)
        st.push({ k: 'str', triple, hashes: 0, raw: lang === 'kotlin' && triple })
        i += triple ? 3 : 1
        continue
      }
      if (lang === 'kotlin' && c === "'") {
        let j = i + 1
        j += src[j] === '\\' ? 2 : 1
        while (j < n && src[j] !== "'") j++
        i = j + 1
        continue
      }
      if (m.close !== null) {
        const open = m.close === ')' ? '(' : '{'
        if (c === open) m.depth++
        else if (c === m.close) {
          if (m.depth === 0) {
            st.pop()
            i++
            continue
          }
          m.depth--
        }
      }
      i++
      continue
    }
    const term = '"'.repeat(m.triple ? 3 : 1) + '#'.repeat(m.hashes)
    if (src.startsWith(term, i)) {
      st.pop()
      i += term.length
      continue
    }
    if (!m.triple && c === '\n') {
      hits.push(`raw newline in a single-line string: ${at(i)}`)
      st.pop()
      i++
      continue
    }
    if (lang === 'swift') {
      const esc = '\\' + '#'.repeat(m.hashes)
      if (src.startsWith(esc + '(', i)) {
        st.push({ k: 'code', close: ')', depth: 0 })
        i += esc.length + 1
        continue
      }
      if (src.startsWith(esc, i)) {
        i += esc.length + 1
        continue
      }
    } else {
      if (!m.raw && c === '\\') {
        i += 2
        continue
      }
      if (c === '$' && src[i + 1] === '{') {
        st.push({ k: 'code', close: '}', depth: 0 })
        i += 2
        continue
      }
      if (c === '$' && /[A-Za-z_`]/.test(src[i + 1] ?? '')) {
        let j = i + 1
        while (j < n && /[A-Za-z0-9_]/.test(src[j]!)) j++
        if (src.slice(i + 1, j).includes('pwn')) hits.push(`$-template: ${at(i)}`)
        i = j
        continue
      }
    }
    i++
  }
  return hits
}

/**
 * Every breakout shape at once, as the TEXT of a JS string (the cases embed it
 * with `JSON.stringify`, so the .tsx source holds exactly this text): a quote
 * close, Swift `\(…)` and raw-string `\#(…)` interpolation, Kotlin `${…}` and
 * `$name` templates, a backslash, a comment close and a newline.
 */
const PAYLOAD = 'Q" + pwn() + "\\(pwn())\\#(pwn())${pwn()}$pwn \\ */ pwn() /* \n pwn()'
const S = JSON.stringify(PAYLOAD)

const run = (src: string, target: Target) => transform(src, { target, filename: 'App.tsx' })
const both = (src: string) => (['swift', 'kotlin'] as const).map((t) => [t, run(src, t)] as const)

function expectNoBreakout(src: string, mustReach: string = 'pwn'): void {
  for (const [target, r] of both(src)) {
    // The payload has to REACH the output for the check to mean anything.
    expect(r.code, `${target}: payload never reached the emit`).toContain(mustReach)
    expect(codeHits(r.code, target), target).toEqual([])
  }
}

describe('the breakout scanner itself (so a pass is not a blind scanner)', () => {
  it('flags each shape that IS a breakout', () => {
    expect(codeHits('let a = #"x\\#(pwn())"#', 'swift')).toHaveLength(1)
    expect(codeHits('let a = "x\\(pwn())"', 'swift')).toHaveLength(1)
    expect(codeHits('val a = "x${pwn()}"', 'kotlin')).toHaveLength(1)
    expect(codeHits('val a = "x$pwn"', 'kotlin')).toHaveLength(1)
    expect(codeHits('val a = "x" + pwn()', 'kotlin')).toHaveLength(1)
  })
  it('passes the same text when it is quoted', () => {
    expect(codeHits('let a = "x\\\\#(pwn()) \\\\(pwn())"', 'swift')).toEqual([])
    expect(codeHits('val a = "x\\${pwn()} \\$pwn"', 'kotlin')).toEqual([])
  })
})

describe('validation: .regex() / .url({ protocol }) (finding 1, HIGH)', () => {
  it('zod .regex() — a `\\#(…)` in the pattern stays inside the Swift string', () => {
    expectNoBreakout(`import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'
import { Text } from '@pyreon/primitives'
export const User = zodSchema(z.object({ slug: z.string().regex(/a\\#(pwn())b"c\${pwn()}d$pwn/) }))
export function App() { return <Text>x</Text> }`)
  })
  it('@pyreon/validate .url({ protocol }) and .regex()', () => {
    expectNoBreakout(`import { s } from '@pyreon/validate'
import { Text } from '@pyreon/primitives'
export const Form = s.object({ site: s.string().url({ protocol: /^h\\#(pwn())"\${pwn()}$/ }), slug: s.string().regex(/x\\#(pwn())$pwn/) })
export function App() { return <Text>x</Text> }`)
  })
  it('emits an ordinary escaped Swift string, never a raw `#"…"#` one', () => {
    const r = run(
      `import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'
import { Text } from '@pyreon/primitives'
export const User = zodSchema(z.object({ slug: z.string().regex(/^a\\#(pwn())$/) }))
export function App() { return <Text>x</Text> }`,
      'swift',
    )
    expect(r.code).toContain('range(of: "^a\\\\#(pwn())$"')
    expect(r.code).not.toContain('#"')
  })
})

describe('Kotlin string templates through JSON.stringify (finding 2)', () => {
  it('charts: theme palette / background strings', () => {
    expectNoBreakout(`import { PieChart } from '@pyreon/charts/engine'
interface Sl { label: string; v: number }
const SL: Sl[] = [{ label: 'a', v: 3 }]
export function Share() {
  return <PieChart data={SL} value={(d: Sl) => d.v} label={(d: Sl) => d.label} theme={{ background: ${S}, palette: [${S}, '#222222'] }} width={240} height={200} />
}`)
  })
  it('url-state: a string default', () => {
    expectNoBreakout(`import { useUrlState } from '@pyreon/url-state'
import { Stack, Text } from '@pyreon/primitives'
export function C() { const q = useUrlState('q', ${S}); return (<Stack><Text>{q()}</Text></Stack>) }`)
  })
  it('flow: node data strings and the FlowWebView background', () => {
    expectNoBreakout(`import { createFlow, Flow } from '@pyreon/flow'
export function Diagram() {
  const flow = createFlow({ nodes: [{ id: ${S}, type: 'default', position: { x: 0, y: 0 }, data: { label: ${S} } }], edges: [] })
  return <Flow instance={flow} />
}`)
    expectNoBreakout(`import { FlowWebView } from '@pyreon/flow/webview'
export function App(props: { graph: any }) { return <FlowWebView graph={props.graph} background={${S}} /> }`, 'Q')
  })
})

describe('dnd: useDraggable({ data }) keys (finding 3)', () => {
  it('a quoted key is a quoted string on both targets', () => {
    expectNoBreakout(`import { useDraggable } from '@pyreon/dnd'
import { Stack, Text } from '@pyreon/primitives'
export function App() {
  const { ref: dragRef } = useDraggable({ data: { ${S}: 'card', plain: 'x' } })
  return (<Stack><Text ref={dragRef}>a</Text></Stack>)
}`)
  })
})

describe('HTTP method is a closed allow-list (finding 4)', () => {
  const src = `import { useFetch } from '@pyreon/hooks'
import { Stack, Text } from '@pyreon/primitives'
interface Item { id: string }
export function P() {
  const p = useFetch<Item>('http://h/i', { method: 'POST, url: "x"); pwn(); _ = PyreonHttpRequest(method: .get' })
  return <Stack><Text>Id: {p.data()?.id ?? 'none'}</Text></Stack>
}`
  it.each(['swift', 'kotlin'] as const)('%s: an unknown method is refused with a warning and never spliced', (target) => {
    const r = run(src, target)
    expect(codeHits(r.code, target)).toEqual([])
    expect(r.code).not.toContain('pwn')
    expect(r.code).toContain(target === 'swift' ? 'method: .get' : 'PyreonHttpMethod.GET')
    expect(r.warnings.some((w) => w.includes('is not one the native HTTP runtime supports'))).toBe(true)
  })
  it.each(['swift', 'kotlin'] as const)('%s: a supported method still lowers as itself', (target) => {
    const r = run(src.replace(/method: '[^']*'/, "method: 'patch'"), target)
    expect(r.code).toContain(target === 'swift' ? 'method: .patch' : 'PyreonHttpMethod.PATCH')
    expect(r.warnings.some((w) => w.includes('is not one the native HTTP runtime supports'))).toBe(false)
  })
})

describe('flow <Handle position> is a closed allow-list (finding 5)', () => {
  const src = (position: string) => `import { createFlow, Flow, Handle, type NodeComponentProps } from '@pyreon/flow'
import { Stack } from '@pyreon/primitives'
function IconNode(props: NodeComponentProps) {
  return <Stack><Handle type={${S}} position=${position} /></Stack>
}
export function Diagram() {
  const flow = createFlow({ nodes: [{ id: 'a', type: 'icon', position: { x: 0, y: 0 } }], edges: [] })
  return <Flow instance={flow} nodeTypes={{ icon: IconNode }} />
}`
  it.each(['swift', 'kotlin'] as const)('%s: an unknown position is refused with a warning, never emitted', (target) => {
    const r = run(src(`{${JSON.stringify('right, offset: pwn()) ; pwn(')}}`), target)
    expect(codeHits(r.code, target)).toEqual([])
    expect(r.code).not.toContain('pwn')
    expect(r.warnings.some((w) => w.includes('top, right, bottom or left'))).toBe(true)
  })
  it.each(['swift', 'kotlin'] as const)('%s: a known position (and a payload `type`) lowers safely', (target) => {
    const r = run(src('"right"'), target)
    expect(codeHits(r.code, target)).toEqual([])
    expect(r.code).toContain(target === 'swift' ? 'position: .right' : 'PyreonFlowPosition.Right')
  })
})

describe('style / token / rocketstyle emitters (finding 6, latent)', () => {
  it('styled() values and the modifier source name', () => {
    const style = { name: 'Box', properties: [{ name: 'background-color', value: { kind: 'string' as const, value: PAYLOAD } }] }
    expect(emitSwiftStyleModifier(style) + emitKotlinStyleModifier(style)).toContain('pwn')
    expect(codeHits(emitSwiftStyleModifier(style), 'swift')).toEqual([])
    expect(codeHits(emitKotlinStyleModifier(style), 'kotlin')).toEqual([])
  })
  it('token values', () => {
    const theme = { groups: [{ name: 'color', entries: [{ name: 'primary', value: { kind: 'string' as const, value: PAYLOAD } }] }] }
    expect(codeHits(emitSwiftTokens(theme), 'swift')).toEqual([])
    expect(codeHits(emitKotlinTokens(theme), 'kotlin')).toEqual([])
  })
  it('rocketstyle theme strings, state names and a computed token key', () => {
    const { rocketstyles } = parseRocketstyle(`const Btn = el.states((t) => ({
  ${S}: { fontFamily: 'x' },
  primary: { fontFamily: ${S}, ${S}: 'x', color: t.color[${JSON.stringify('x; pwn(); y')}] },
}))`)
    const ir = rocketstyles[0]!
    const swift = emitSwiftRocketstyleModifier(ir)
    const kotlin = emitKotlinRocketstyleModifier(ir)
    expect(swift + kotlin).toContain('pwn')
    expect(codeHits(swift, 'swift')).toEqual([])
    expect(codeHits(kotlin, 'kotlin')).toEqual([])
  })
})
