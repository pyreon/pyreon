#!/usr/bin/env bun
/**
 * HOLE-FREE TEMPLATE census — how much of a codebase's compiled template
 * surface has no dynamic holes at all?
 *
 * WHY THIS EXISTS. A recurring optimization idea is that hydration should be
 * able to claim a fully-static compiled subtree in O(1) instead of verifying it
 * node by node: the compiler knows at emit time which templates have no holes,
 * so the argument goes that the per-node work for those is pure overhead. This
 * probe is what that idea has to clear FIRST, and on every page measured so far
 * it does not clear it. The census is kept so the next attempt starts from a
 * number rather than from the intuition, which is badly wrong here.
 *
 * WHAT "HOLE-FREE" MEANS, precisely. The compiler lowers a fully-static element
 * subtree to `_tpl(html, () => null)` — a binder that is ALREADY a no-op. A
 * template with any dynamic content instead emits `(__root) => { … }`. So the
 * classification is exact and needs no heuristic: zero params + a literal
 * `null` body. Note the consequence — for a hole-free template the BIND side of
 * hydration is already free; the only remaining per-node work is the adoption
 * VERIFY (`hydration-plan.ts:matchDomAgainstTemplate`), which is what makes
 * adopting a server node safe rather than merely fast.
 *
 * THE TRAP THIS PROBE EXISTS TO AVOID. This census is DECLARATION-weighted: it
 * counts each `_tpl` call site once. Runtime cost is INSTANCE-weighted, and the
 * two differ by more than an order of magnitude, because repetition and
 * staticness are anti-correlated — a template is hole-free exactly when it
 * carries no data, and a subtree carrying no data has no reason to repeat.
 * Measured 2026-08:
 *
 *                              declaration-weighted   instances per template
 *                              (share of elements)    hole-free   bound
 *   docs landing page              ~34% (band)           1.1        4.6
 *   docs /docs/router                0.6%               1.0       17.8
 *   app-page hydration bench         0.0%               —       2996.0
 *
 * On the docs landing page, 76% of the hole-free elements are ONE decorative
 * hero SVG rendered once. So read the percentage below as an UPPER BOUND that
 * a real page will not reach, and instance-weight before acting on it.
 *
 * HOW TO GET THE INSTANCE-WEIGHTED NUMBER. There is no committed runtime
 * counter for this (deliberately — it is a retired hypothesis, not worth a
 * branch in the `_tpl` hot path). Reproduce it with a temporary hook: add to
 * the top of `_tpl` in `packages/core/runtime-dom/src/template.ts`
 *
 *     ;(globalThis as never as { __tplCensus__?: (h: string, hf: boolean) => void })
 *       .__tplCensus__?.(html, bind.length === 0)
 *
 * rebuild `@pyreon/runtime-dom`, arm `globalThis.__tplCensus__` from a
 * Playwright `addInitScript`, load the page, and revert. `bind.length === 0`
 * is the same exact classification this probe makes statically; both were run
 * against the app-page bench and agreed (0%).
 *
 * USAGE
 *   bun probe-holefree-census.ts ../../docs/src ../../examples/ui-showcase/src
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { parseSync } from 'oxc-parser'
import { transformJSX } from '@pyreon/compiler'

interface Tpl {
  file: string
  html: string
  holeFree: boolean
  elements: number
}

/** Count element open-tags in a template's static HTML. */
function countElements(html: string): number {
  let n = 0
  let i = 0
  while (i < html.length) {
    const lt = html.indexOf('<', i)
    if (lt === -1) break
    const gt = html.indexOf('>', lt)
    if (gt === -1) break
    const tag = html.slice(lt + 1, gt)
    if (!tag.startsWith('/') && !tag.startsWith('!')) n++
    i = gt + 1
  }
  return n
}

function walkAst(node: unknown, visit: (n: Record<string, unknown>) => void): void {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const c of node) walkAst(c, visit)
    return
  }
  const n = node as Record<string, unknown>
  if (typeof n.type === 'string') visit(n)
  for (const k of Object.keys(n)) {
    if (k === 'type' || k === 'start' || k === 'end') continue
    walkAst(n[k], visit)
  }
}

let parseFailures = 0

function collectTpls(code: string, file: string): Tpl[] {
  const out: Tpl[] = []
  let ast: ReturnType<typeof parseSync>
  try {
    // Parse as TSX. The emit PRESERVES TypeScript annotations (jsx: preserve,
    // types not stripped), so parsing it as `.js` fails on every typed file —
    // and a silently-swallowed parse failure reports a confident, wrong ZERO.
    ast = parseSync(file.endsWith('.tsx') ? file : `${file}.tsx`, code, { sourceType: 'module' })
  } catch (e) {
    parseFailures++
    console.error(`   ! parse THREW for ${file}: ${(e as Error).message}`)
    return out
  }
  if (ast.errors?.length) {
    parseFailures++
    console.error(`   ! parse errors in ${file}: ${ast.errors[0]?.message}`)
    return out
  }
  walkAst(ast.program, (n) => {
    if (n.type !== 'CallExpression') return
    const callee = n.callee as Record<string, unknown> | undefined
    if (!callee || callee.type !== 'Identifier' || callee.name !== '_tpl') return
    const args = n.arguments as Record<string, unknown>[] | undefined
    const a0 = args?.[0]
    if (!a0 || a0.type !== 'Literal' || typeof a0.value !== 'string') return
    const bind = args?.[1]
    // hole-free ⟺ the compiler emitted its no-op binder `() => null`
    let holeFree = bind === undefined
    if (bind !== undefined && bind.type === 'ArrowFunctionExpression') {
      const params = bind.params as unknown[] | undefined
      const body = bind.body as Record<string, unknown> | undefined
      holeFree =
        (params?.length ?? 0) === 0 && body?.type === 'Literal' && body.value === null
    }
    out.push({
      file,
      html: a0.value as string,
      holeFree,
      elements: countElements(a0.value as string),
    })
  })
  return out
}

function* sourceFiles(dir: string): Generator<string> {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const e of entries) {
    if (e === 'node_modules' || e === 'lib' || e === 'dist' || e === '.git') continue
    const p = join(dir, e)
    let st: ReturnType<typeof statSync>
    try {
      st = statSync(p)
    } catch {
      continue
    }
    if (st.isDirectory()) yield* sourceFiles(p)
    else if (/\.(tsx|jsx)$/.test(e)) yield p
  }
}

const roots = process.argv.slice(2)
if (roots.length === 0) {
  console.error('usage: probe-holefree-census.ts <dir>…')
  process.exit(1)
}

for (const root of roots) {
  parseFailures = 0
  const tpls: Tpl[] = []
  let scanned = 0
  let transformFailures = 0

  for (const f of sourceFiles(root)) {
    scanned++
    let src: string
    try {
      src = readFileSync(f, 'utf8')
    } catch {
      continue
    }
    if (!/<[A-Za-z]/.test(src)) continue
    let emitted: string
    try {
      const r = transformJSX(src, f, {})
      emitted = typeof r === 'string' ? r : r.code
    } catch (e) {
      transformFailures++
      console.error(`   ! transform failed for ${f}: ${(e as Error).message}`)
      continue
    }
    tpls.push(...collectTpls(emitted, relative(root, f)))
  }

  const hf = tpls.filter((t) => t.holeFree)
  const bd = tpls.filter((t) => !t.holeFree)
  const els = (xs: Tpl[]) => xs.reduce((a, t) => a + t.elements, 0)
  const hfEl = els(hf)
  const total = hfEl + els(bd)

  console.log(`\n══ ${root}`)
  console.log(
    `   files ${scanned}  (transform failed ${transformFailures}, parse failed ${parseFailures})`,
  )
  console.log(`   templates ${tpls.length}  (hole-free ${hf.length}, bound ${bd.length})`)
  console.log(`   elements in templates ${total}`)
  if (total > 0) {
    console.log(
      `     hole-free ${hfEl} (${((hfEl / total) * 100).toFixed(1)}%)` +
        `   — DECLARATION-weighted, an upper bound; see the header`,
    )
  }
  const big = [...hf].sort((a, b) => b.elements - a.elements).slice(0, 5)
  if (big.length) {
    console.log('   largest hole-free templates:')
    for (const t of big) {
      console.log(`     ${String(t.elements).padStart(4)} el  ${t.file}  ${t.html.slice(0, 56)}…`)
    }
  }
}
