import { describe, expect, it } from 'vitest'
import {
  detectPyreonPatterns,
  hasPyreonPatterns,
  type PyreonDiagnosticCode,
} from '../pyreon-intercept'

// Same contract as `react-prefilter-contract.test.ts`, for the Pyreon
// detectors (#4304's class: a pre-filter that drifts from its detectors
// silently skips files in `pyreon check` / doctor). One fixture per code —
// a `Record` over the union, so a new code needs a fixture here — and each
// must be EMITTED by `detectPyreonPatterns` and pass `hasPyreonPatterns`.

const FIXTURES: Record<PyreonDiagnosticCode, string> = {
  'for-missing-by': `export const L = (p) => <For each={p.items}>{(i) => <li>{i}</li>}</For>`,
  'for-with-key': `export const L = (p) => <For each={p.items} key={(i) => i.id}>{(i) => <li>{i}</li>}</For>`,
  'props-destructured': `export const A = ({ name }) => <div>{name}</div>`,
  'props-destructured-body': `export function A(props) { const { name } = props; return <div>{name}</div> }`,
  'process-dev-gate': `if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') warn()`,
  'empty-theme': `export const B = Button.theme({})`,
  'raw-add-event-listener': `export function A() { window.addEventListener('resize', onResize); return <div /> }`,
  'raw-remove-event-listener': `export function A() { window.removeEventListener('resize', onResize); return <div /> }`,
  'date-math-random-id': `export const id = \`\${Date.now()}-\${Math.random()}\``,
  'on-click-undefined': `export const A = () => <button onClick={undefined}>x</button>`,
  'signal-write-as-call': `const count = signal(0)\nexport const inc = () => count(5)`,
  'static-return-null-conditional': `const c = signal(false)\nfunction C(props) { if (c()) return null\n  return <div /> }`,
  'static-early-return-conditional': `const l = signal(false)\nfunction C(props) { if (l()) return <Skeleton />\n  return <div /> }`,
  'as-unknown-as-vnodechild': `const c = x as unknown as VNodeChild`,
  'island-never-with-registry-entry': `const W = island(() => import('./w'), { name: 'W', hydrate: 'never' })\nhydrateIslands({ W: () => import('./w') })`,
  'query-options-as-function': `const q = useQuery({ queryKey: ['user', id()], queryFn: fetchUser })`,
  'accessor-uncalled-in-template': `const width = signal(10)\nconst s = \`w=\${width}%\`\n`,
  'accessor-uncalled-in-condition': `const width = signal(10)\nif (width) { obj.width() }\n`,
  'charts-legacy-import': `import { useChart } from '@pyreon/charts'\nexport const c = useChart(() => ({}))\n`,
  'for-stale-item-field': `const todos = signal([])\nconst toggle = (id) => todos.set(todos().map((t) => (t.id === id ? { ...t, done: !t.done } : t)))\nexport const L = () => <For each={todos} by={(t) => t.id}>{(t) => <li>{t.done ? 'y' : 'n'}</li>}</For>\n`,
  'plain-mode': `'use plain'\nimport { state } from '@pyreon/core/plain'\nlet cfg = state.raw({ open: false })\nexport const t = () => { cfg.open = true }\n`,
}

describe('Pyreon detector ↔ pre-filter contract', () => {
  for (const [code, src] of Object.entries(FIXTURES) as [PyreonDiagnosticCode, string][]) {
    it(`${code}: emitted by the detector, and passes the pre-filter`, () => {
      expect(detectPyreonPatterns(src, 'fixture.tsx').map((d) => d.code)).toContain(code)
      expect(hasPyreonPatterns(src)).toBe(true)
    })
  }
})
