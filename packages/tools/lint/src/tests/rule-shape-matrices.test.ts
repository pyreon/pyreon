/**
 * Shape matrices for three rules whose value is entirely in WHICH shapes they
 * recognise.
 *
 * A lint rule has two ways to be useless and they look identical from the
 * outside: it can miss the defect (silence reads as "clean"), and it can fire
 * on the corrected form (noise reads as "this rule is wrong", and the rule gets
 * turned off). The registry's fires-invariant proves each rule can do both once
 * — for ONE shape. What it cannot prove is the recognition SURFACE, and that is
 * the whole product here: a request-body rule that only knows `req.json()` is
 * silent on `ctx.request.body`, and every route written the other way is
 * unprotected while the dashboard says the rule is on.
 *
 * So each block below is a table: sources that MUST report, sources that MUST
 * NOT, and — the ones worth the most — the near-misses, where a rule that
 * matched on a substring or a name rather than a shape gets it wrong.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { allRules } from '../rules/index'
import { lintFile } from '../runner'
import type { LintConfig } from '../types'

const DEPS = ['@pyreon/core', '@pyreon/reactivity', '@pyreon/runtime-dom', '@pyreon/zero']

let root = ''
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'pyreon-shapes-'))
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({
      name: '@pyreon/shape-fixture',
      dependencies: Object.fromEntries(DEPS.map((d) => [d, '*'])),
    }),
  )
})
afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true })
})

/** Lint `source` at `file` with ONLY `ruleId` on, so no neighbour stands in. */
const run = (ruleId: string, file: string, source: string): number => {
  const abs = join(root, file)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, source)
  const config: LintConfig = { rules: { [ruleId]: 'error' } }
  return lintFile(abs, source, allRules, config).diagnostics.filter(
    (d) => d.ruleId === ruleId,
  ).length
}

// ─── pyreon/no-unvalidated-request-body ──────────────────────────────────────

describe('no-unvalidated-request-body recognises how a body is actually read', () => {
  const ID = 'pyreon/no-unvalidated-request-body'
  const FILE = 'src/routes/api/items.ts'
  const handler = (body: string) =>
    `export async function POST(req: Request, ctx: any) {\n  ${body}\n  return save(body)\n}`

  it('reports `await req.json()` — the control', () => {
    expect(run(ID, FILE, handler('const body = await req.json()'))).toBeGreaterThan(0)
  })

  it('reports a body read off a MEMBER receiver', () => {
    // `ctx.request.body` is how every framework that wraps the request exposes
    // it — Koa, Hono's context, an Express-style adapter. A rule that only
    // knows the bare identifier is silent on all of them.
    expect(run(ID, FILE, handler('const body = ctx.request.body'))).toBeGreaterThan(0)
  })

  it('reports `req.body` on a bare receiver', () => {
    expect(run(ID, FILE, handler('const body = req.body'))).toBeGreaterThan(0)
  })

  it('reports `request.formData()`', () => {
    expect(run(ID, FILE, handler('const body = await request.formData()'))).toBeGreaterThan(0)
  })

  it('is QUIET when a schema validates the read', () => {
    // The control for every report above: a rule that fires on the corrected
    // form is noise, and noise is what gets a rule switched off.
    expect(run(ID, FILE, handler('const body = schema.parse(await req.json())'))).toBe(0)
  })

  it('is quiet when the validator is a plain FUNCTION call', () => {
    // `validate(await req.json())` — not every codebase hangs its schema off an
    // object.
    expect(run(ID, FILE, handler('const body = validate(await req.json())'))).toBe(0)
  })

  it('is quiet when validation is NESTED inside the expression', () => {
    // The read is an argument several levels down. Searching only the top level
    // reports a body that is, in fact, validated.
    expect(
      run(ID, FILE, handler('const body = { data: schema.parse(await req.json()) }')),
    ).toBe(0)
  })

  it('is quiet when a LATER statement validates the binding', () => {
    // Read first, validate on the next line. Reporting here is the commonest
    // false positive a rule of this shape has.
    expect(
      run(
        ID,
        FILE,
        `export async function POST(req: Request) {\n  const body = await req.json()\n  const clean = schema.parse(body)\n  return save(clean)\n}`,
      ),
    ).toBe(0)
  })

  it('does NOT fire on a receiver that merely looks request-ish', () => {
    // `requestAnimationFrame`, `requester`, `requestId` — a rule matching on a
    // name substring reports code that has no request in it at all.
    expect(run(ID, FILE, handler('const body = requestId.body'))).toBe(0)
  })

  it('does NOT fire on an unrelated member read', () => {
    expect(run(ID, FILE, handler('const body = config.defaults.body'))).toBe(0)
  })
})

// ─── pyreon/content-visibility-needs-intrinsic-size ──────────────────────────

describe('content-visibility-needs-intrinsic-size reads every way CSS is written', () => {
  const ID = 'pyreon/content-visibility-needs-intrinsic-size'
  const FILE = 'src/a.tsx'

  it('reports the camelCase style-object form — the control', () => {
    expect(
      run(ID, FILE, `export const A = () => <div style={{ contentVisibility: 'auto' }} />`),
    ).toBeGreaterThan(0)
  })

  it('reports the KEBAB, string-literal key', () => {
    // `{ 'content-visibility': 'auto' }` is the form anyone writing CSS-first
    // reaches for, and it is a different AST node kind from the identifier key.
    expect(
      run(ID, FILE, `export const A = () => <div style={{ 'content-visibility': 'auto' }} />`),
    ).toBeGreaterThan(0)
  })

  it('reports a style STRING attribute', () => {
    expect(
      run(ID, FILE, `export const A = () => <div style="content-visibility: auto" />`),
    ).toBeGreaterThan(0)
  })

  it('reports a tagged-template CSS block', () => {
    // styler/rocketstyle themes are template literals, which is where most of
    // this repo's CSS lives.
    expect(
      run(
        ID,
        FILE,
        "export const S = css`\n  content-visibility: auto;\n  display: block;\n`",
      ),
    ).toBeGreaterThan(0)
  })

  it('is QUIET when the intrinsic size is present in the same object', () => {
    expect(
      run(
        ID,
        FILE,
        `export const A = () => <div style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 400px' }} />`,
      ),
    ).toBe(0)
  })

  it('is quiet when both are written kebab', () => {
    expect(
      run(
        ID,
        FILE,
        `export const A = () => <div style={{ 'content-visibility': 'auto', 'contain-intrinsic-size': 'auto 400px' }} />`,
      ),
    ).toBe(0)
  })

  it('is quiet for a template that declares both', () => {
    expect(
      run(
        ID,
        FILE,
        "export const S = css`\n  content-visibility: auto;\n  contain-intrinsic-size: auto 400px;\n`",
      ),
    ).toBe(0)
  })

  it('is quiet for `content-visibility: hidden`, which reserves nothing to shift', () => {
    // Only `auto` estimates a size it later corrects. `hidden` and `visible`
    // have no CLS to cause, so reporting them is pure noise.
    expect(
      run(ID, FILE, `export const A = () => <div style={{ contentVisibility: 'hidden' }} />`),
    ).toBe(0)
  })

  it('does not fire on a COMPUTED key it cannot read', () => {
    // `{ [prop]: 'auto' }` — the rule cannot know what `prop` is, and guessing
    // reports code that may be entirely unrelated.
    expect(
      run(ID, FILE, `export const A = () => <div style={{ [prop]: 'auto' }} />`),
    ).toBe(0)
  })

  it('does not fire on a NON-literal value it cannot read', () => {
    expect(
      run(ID, FILE, `export const A = () => <div style={{ contentVisibility: mode }} />`),
    ).toBe(0)
  })

  it('does not fire on an unrelated property', () => {
    expect(
      run(ID, FILE, `export const A = () => <div style={{ contain: 'layout' }} />`),
    ).toBe(0)
  })
})

// ─── pyreon/no-layout-thrash ─────────────────────────────────────────────────

describe('no-layout-thrash distinguishes a read-after-write from either alone', () => {
  const ID = 'pyreon/no-layout-thrash'
  const FILE = 'src/a.ts'
  const loop = (body: string) =>
    `export function run(els: HTMLElement[]) {\n  for (const el of els) {\n    ${body}\n  }\n}`

  it('reports a style write followed by a geometry read — the control', () => {
    expect(
      run(ID, FILE, loop("el.style.width = '10px'\n    const w = el.offsetWidth")),
    ).toBeGreaterThan(0)
  })

  it('reports a className write followed by a read', () => {
    // The write does not have to be `.style` — anything that invalidates
    // layout does, and `className` is the commonest of them.
    expect(
      run(ID, FILE, loop("el.className = 'wide'\n    const w = el.clientHeight")),
    ).toBeGreaterThan(0)
  })

  it('reports a setProperty write followed by a read', () => {
    expect(
      run(ID, FILE, loop("el.style.setProperty('--w', '10px')\n    const r = el.getBoundingClientRect()")),
    ).toBeGreaterThan(0)
  })

  it('reports a read via getComputedStyle', () => {
    expect(
      run(ID, FILE, loop("el.style.width = '10px'\n    const s = getComputedStyle(el).width")),
    ).toBeGreaterThan(0)
  })

  it('is QUIET when the loop only READS', () => {
    // Reading N times is one layout, not N. Reporting it would make the rule
    // fire on every measurement pass in the codebase.
    expect(run(ID, FILE, loop('const w = el.offsetWidth\n    total += w'))).toBe(0)
  })

  it('is quiet when the loop only WRITES', () => {
    // The batched shape the rule is telling people to write.
    expect(run(ID, FILE, loop("el.style.width = '10px'"))).toBe(0)
  })

  it('is quiet when the read comes BEFORE the write', () => {
    // Measure-then-mutate is the correct order and must not be reported, or
    // the rule cannot be satisfied at all.
    expect(
      run(ID, FILE, loop("const w = el.offsetWidth\n    el.style.width = w + 'px'")),
    ).toBe(0)
  })

  it('is quiet OUTSIDE a loop', () => {
    // One read-after-write is one reflow. The rule is about the per-iteration
    // multiplication, so a straight-line pair is not the defect.
    expect(
      run(
        ID,
        FILE,
        "export function run(el: HTMLElement) {\n  el.style.width = '10px'\n  const w = el.offsetWidth\n  return w\n}",
      ),
    ).toBe(0)
  })

  it('is quiet for a non-layout property read', () => {
    expect(
      run(ID, FILE, loop("el.style.width = '10px'\n    const id = el.dataset.id")),
    ).toBe(0)
  })
})
