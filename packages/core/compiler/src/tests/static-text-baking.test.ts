import { transformJSX } from '../jsx'

const t = (code: string) => transformJSX(code, 'input.tsx').code
const hasBind = (out: string) => /\b_bindText\(|\b_bind\(/.test(out)

// ── Static-text baking contract (perf-correctness regression gate) ──────────
//
// The compiler bakes a provably-static `{expr}` child straight into the
// `_tpl()` HTML and emits NO `_bind`/`_bindText` for it. The Reactivity
// Lens's `static-text` kind is a faithful RECORD of exactly this codegen
// branch — it is NOT an independent oracle the emitter could disagree
// with. So "the analysis proves static but codegen still binds" is
// structurally impossible; the only thing that can erode this is an
// `isDynamic` PRECISION regression that starts treating a static shape as
// dynamic (a silent per-mount allocation + subscription leak with no
// other guard) OR — the inverse correctness bug — under-wrapping a truly
// reactive shape.
//
// This suite is self-discriminating, which IS its bisect proof: it
// asserts BOTH regimes against the SAME `isDynamic` decision. An
// over-broad regression fails the "baked" half; an under-broad
// (correctness) regression fails the "reactive" half. Both halves are
// demonstrated reachable by the empirical probe that motivated this gate
// (every static shape baked; the unknown-call / signal / prop shapes
// bound) — neither half passes vacuously.

describe('static-text baking — provably-static children are baked, never _bind', () => {
  const STATIC: [string, string][] = [
    ['module-const string ref', `const N='hi'; export const C=()=> <div>{N}</div>`],
    ['string literal', `export const C=()=> <div>{'hi'}</div>`],
    ['number literal', `export const C=()=> <div>{42}</div>`],
    ['static ternary on a module const', `const F=false; export const C=()=> <div>{F ? 'a' : 'b'}</div>`],
    ['template literal interpolating only a const', `const N='x'; export const C=()=> <div>{\`v-\${N}\`}</div>`],
    ['module-const array .length', `const A=[1,2,3]; export const C=()=> <div>{A.length}</div>`],
    ['pure built-in call (Math.max)', `export const C=()=> <div>{Math.max(1,2)}</div>`],
    ['const string concat', `const A='a',B='b'; export const C=()=> <div>{A+B}</div>`],
  ]
  for (const [name, src] of STATIC) {
    test(`bakes (no _bind): ${name}`, () => {
      const out = t(src)
      expect(out).toContain('_tpl(')
      expect(hasBind(out)).toBe(false)
    })
  }
})

describe('static-text baking — genuinely-reactive / unprovable children DO bind (discriminator)', () => {
  const REACTIVE: [string, string][] = [
    [
      'signal read',
      `import {signal} from '@pyreon/reactivity'; const s=signal(0); export const C=()=> <div>{s()}</div>`,
    ],
    ['prop access', `export const C=(props:any)=> <div>{props.x}</div>`],
    [
      'unknown local call (conservatively reactive — correct: cannot prove signal-free)',
      `function f(){return 'z'} export const C=()=> <div>{f()}</div>`,
    ],
  ]
  for (const [name, src] of REACTIVE) {
    test(`binds: ${name}`, () => {
      expect(hasBind(t(src))).toBe(true)
    })
  }
})

// ── <For>/render-callback item params are NOT reactive props ────────────────
//
// `<For each={rows}>{(row) => <td>{String(row.id)}</td>}</For>` — `row` is a
// runtime ITEM the framework passes per row, NOT reactive component props.
// A bare property read (`row.id`) can never be reactive in Pyreon (reactivity
// is via signal CALLS, `row.label()`), so it must be baked static (one
// `textContent =`), NOT wrapped in a per-row `_bind()` renderEffect.
//
// Regression for the misclassification where the render-callback's first
// param was registered as component props (because the callback returns JSX),
// making every `row.id` look reactive → a wasted renderEffect + disposer per
// row (1000-10000 of them in a real list; retained until unmount).
//
// Self-discriminating: the STATIC half asserts the bare-property read bakes;
// the REACTIVE half asserts a signal-valued item property (`row.label()`)
// STILL binds. Reverting the `maybeRegisterComponentProps` JSX-child-callback
// skip fails the STATIC half (`row.id` re-acquires a `_bind`); a real
// component (first param IS props) must keep its reactive binding.
describe('<For> render-callback item params: bare property reads bake static', () => {
  test('bakes bare item-property read (no _bind)', () => {
    const out = t(
      `export const C=()=> <table><tbody><For each={rows} by={(r)=>r.id}>{(row)=> <tr><td>{String(row.id)}</td></tr>}</For></tbody></table>`,
    )
    expect(out).toContain('_tpl(')
    expect(out).toContain('textContent = String(row.id)')
    expect(/_bind\(\(\) => \{[^}]*String\(row\.id\)/.test(out)).toBe(false)
  })

  test('signal-valued item property STILL binds (discriminator)', () => {
    const out = t(
      `export const C=()=> <table><tbody><For each={rows} by={(r)=>r.id}>{(row)=> <tr><td>{() => row.label()}</td></tr>}</For></tbody></table>`,
    )
    expect(out).toContain('_bindText(row.label')
  })

  test('mixed row: id static, label reactive, both in one row', () => {
    const out = t(
      `export const C=()=> <For each={rows} by={(r)=>r.id}>{(row)=> <tr><td>{String(row.id)}</td><td>{() => row.label()}</td></tr>}</For>`,
    )
    expect(out).toContain('textContent = String(row.id)')
    expect(out).toContain('_bindText(row.label')
  })

  test('real component (first param IS props) keeps reactive binding', () => {
    // A genuine component — `props.id` must STAY reactive (not a For callback).
    const out = t(`export const Row=(props:any)=> <tr><td>{String(props.id)}</td></tr>`)
    expect(hasBind(out)).toBe(true)
  })
})
