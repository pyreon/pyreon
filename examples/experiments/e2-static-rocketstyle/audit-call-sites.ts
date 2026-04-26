#!/usr/bin/env bun
/**
 * Audit % of rocketstyle component call sites in real apps that have
 * literal-only dimension props (and would therefore be statically
 * resolvable by a future @pyreon/compiler pass).
 *
 * Walks every `*.tsx` file under `examples/`, parses each JSX opening
 * element via `oxc-parser`, and for any call site whose tag name matches
 * a known rocketstyle component (the 67 exports of `@pyreon/ui-components`),
 * classifies its state/size/variant props as:
 *
 *   - `literal`: state="primary", size="large" (string literal)
 *   - `dynamic`: state={signal()}, size={cond ? 'a' : 'b'}, ...spread
 *
 * A call site is "statically resolvable" if EVERY dimension prop it
 * provides is literal. (Components with no dimension props are also
 * resolvable by definition — nothing to merge dynamically.)
 *
 * Reports:
 *   - per-component: total / resolvable / dynamic counts
 *   - codebase-wide: % resolvable, breakdown by reason for falling through
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSync } from 'oxc-parser'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '../../..')

// ── Discover rocketstyle component names ─────────────────────────────────────

const COMPONENTS_DIR = resolve(REPO_ROOT, 'packages/ui/components/src/components')
const ROCKETSTYLE_NAMES = new Set<string>(readdirSync(COMPONENTS_DIR))

// Dimension props rocketstyle components consume.
const DIMENSION_PROPS = new Set<string>(['state', 'size', 'variant', 'theme', 'mode'])

// ── Walk examples/ for .tsx files ────────────────────────────────────────────

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === 'lib') continue
    const p = join(dir, entry)
    const s = statSync(p)
    if (s.isDirectory()) walk(p, out)
    else if (entry.endsWith('.tsx')) out.push(p)
  }
}

const files: string[] = []
walk(resolve(REPO_ROOT, 'examples'), files)

// ── Classify each call site ──────────────────────────────────────────────────

interface CallSite {
  component: string
  file: string
  line: number
  resolvable: boolean
  reason: string
  dimensionProps: Record<string, 'literal' | 'dynamic-expr' | 'spread'>
}

const sites: CallSite[] = []

for (const file of files) {
  const source = readFileSync(file, 'utf8')
  let ast: ReturnType<typeof parseSync>
  try {
    ast = parseSync(file, source)
  } catch {
    continue
  }

  walkAst(ast.program, (node) => {
    if (!node || typeof node !== 'object') return
    if ((node as { type?: string }).type !== 'JSXOpeningElement') return
    const elName = (node as { name?: { type?: string; name?: string } }).name
    if (!elName || elName.type !== 'JSXIdentifier') return
    const tagName = elName.name
    if (!tagName || !ROCKETSTYLE_NAMES.has(tagName)) return

    const attrs = (node as { attributes?: Array<unknown> }).attributes ?? []
    const dimensionProps: Record<string, 'literal' | 'dynamic-expr' | 'spread'> = {}
    let hasSpread = false
    let hasDynamicDim = false

    for (const a of attrs) {
      const att = a as {
        type?: string
        name?: { name?: string }
        value?: { type?: string; expression?: { type?: string } }
      }
      if (att.type === 'JSXSpreadAttribute') {
        hasSpread = true
        continue
      }
      if (att.type !== 'JSXAttribute') continue
      const key = att.name?.name
      if (!key || !DIMENSION_PROPS.has(key)) continue

      // Empty value (boolean attribute, no value) — counts as literal `true`.
      if (att.value === undefined) {
        dimensionProps[key] = 'literal'
        continue
      }
      // String literal: state="primary"
      if (att.value.type === 'Literal') {
        dimensionProps[key] = 'literal'
        continue
      }
      // Expression container: state={...}
      if (att.value.type === 'JSXExpressionContainer') {
        const expr = att.value.expression
        if (expr?.type === 'Literal' || expr?.type === 'StringLiteral') {
          dimensionProps[key] = 'literal'
        } else {
          dimensionProps[key] = 'dynamic-expr'
          hasDynamicDim = true
        }
        continue
      }
      dimensionProps[key] = 'dynamic-expr'
      hasDynamicDim = true
    }

    let reason = 'literal-or-no-dimensions'
    let resolvable = true
    if (hasSpread) {
      resolvable = false
      reason = 'jsx-spread'
    } else if (hasDynamicDim) {
      resolvable = false
      reason = 'dynamic-dimension-prop'
    }

    sites.push({
      component: tagName,
      file: file.replace(`${REPO_ROOT}/`, ''),
      line: (node as { start?: number; loc?: { start?: { line?: number } } }).loc?.start?.line ?? 0,
      resolvable,
      reason,
      dimensionProps,
    })
  })
}

function walkAst(node: unknown, fn: (n: unknown) => void): void {
  if (!node || typeof node !== 'object') return
  fn(node)
  for (const key of Object.keys(node)) {
    if (key === 'parent' || key === 'loc' || key === 'range') continue
    const v = (node as Record<string, unknown>)[key]
    if (Array.isArray(v)) for (const item of v) walkAst(item, fn)
    else if (v && typeof v === 'object') walkAst(v, fn)
  }
}

// ── Report ───────────────────────────────────────────────────────────────────

const total = sites.length
const resolvable = sites.filter((s) => s.resolvable).length
const dynamic = total - resolvable

const byReason: Record<string, number> = {}
for (const s of sites) {
  if (!s.resolvable) byReason[s.reason] = (byReason[s.reason] ?? 0) + 1
}

const byComponent: Map<string, { total: number; resolvable: number }> = new Map()
for (const s of sites) {
  const e = byComponent.get(s.component) ?? { total: 0, resolvable: 0 }
  e.total++
  if (s.resolvable) e.resolvable++
  byComponent.set(s.component, e)
}

const sortedComponents = [...byComponent.entries()]
  .filter(([, v]) => v.total >= 5) // signal threshold: drop noise
  .sort((a, b) => b[1].total - a[1].total)

console.log(`# Rocketstyle call-site audit\n`)
console.log(`Scanned: ${files.length} .tsx files under examples/`)
console.log(`Total call sites: ${total}`)
console.log(`Statically resolvable: ${resolvable} (${((resolvable / total) * 100).toFixed(1)}%)`)
console.log(`Dynamic: ${dynamic} (${((dynamic / total) * 100).toFixed(1)}%)\n`)

console.log(`## Why dynamic\n`)
for (const [reason, count] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) {
  console.log(`- ${reason}: ${count} (${((count / total) * 100).toFixed(1)}%)`)
}

console.log(`\n## Top components by call-site count (≥5 sites)\n`)
console.log(`| Component | Total | Resolvable | % |`)
console.log(`| --- | ---: | ---: | ---: |`)
for (const [name, { total: t, resolvable: r }] of sortedComponents) {
  console.log(`| ${name} | ${t} | ${r} | ${((r / t) * 100).toFixed(0)}% |`)
}

// Dump sample dynamic call sites for spot-check
console.log(`\n## Sample dynamic call sites (first 15)\n`)
const dyn = sites.filter((s) => !s.resolvable).slice(0, 15)
for (const s of dyn) {
  console.log(
    `- ${s.component} @ ${s.file}:${s.line} — ${s.reason}, props=${JSON.stringify(s.dimensionProps)}`,
  )
}
