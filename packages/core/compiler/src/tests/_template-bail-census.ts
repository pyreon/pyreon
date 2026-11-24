/**
 * Template-bail census — how many DOM elements a corpus still leaves to the
 * runtime `jsx()` / `h()` path after the client compile, and where they sit.
 *
 * Every lowercase JSX element left in the client output becomes a `jsx('tag')`
 * call at runtime: a VNode allocation and a generic mount instead of a cloned
 * template. Each one is bucketed by its position in the OUTPUT:
 *
 *   in-template       inside a `_tpl(…)` bind. Since template holes are walked
 *                     (`clientWalksHole`), what is left here bailed for a reason
 *                     of its own (a key, a self-closing root, a spread) or sits
 *                     in a hole that stays a slice (SVG/MathML content, an
 *                     attribute value).
 *   root:<reason>     a root the template pass attempted and bailed on:
 *                     `self-closing`, `keyed`, `spread`, or `other` (in the
 *                     example corpus, almost always a component child that is
 *                     not in a trailing run).
 *   child-of-h        a child element of an element that stayed on `h()`; it
 *                     bailed for its own reason.
 *   expr-under-h      inside an expression child of an `h()` element or
 *                     component — sliced by `wrap()`, never visited.
 *   attr-value        inside an attribute value (render props, `fallback`).
 *
 * Not a test file (underscore prefix): `template-hole-walk.test.ts` locks the
 * numbers and `scripts/template-bail-census.ts` prints them.
 */
import { lstatSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseSync } from 'oxc-parser'

type N = any // ESTree node from oxc-parser — untyped, as in jsx.ts

export interface CensusResult {
  files: number
  compiled: number
  total: number
  buckets: Record<string, number>
}

export type ClientTransform = (code: string, filename: string) => string

/**
 * A project directory whose own `package.json` declares no `@pyreon/*` package
 * is another framework's code (the React, Vue, Solid, Svelte and Preact arms of
 * `examples/real-bench/app/arms`, the rival meta-framework apps of
 * `examples/stacks-bench/apps`). Pyreon's compiler never sees it, so counting it
 * would charge Pyreon's emit with JSX written for another runtime.
 */
function isOtherFrameworkProject(dir: string): boolean {
  let raw: string
  try {
    raw = readFileSync(join(dir, 'package.json'), 'utf8')
  } catch {
    return false
  }
  const pkg = JSON.parse(raw) as Record<string, Record<string, string> | undefined>
  const deps = [pkg.dependencies, pkg.devDependencies, pkg.peerDependencies].flatMap((d) =>
    Object.keys(d ?? {}),
  )

  return !deps.some((name) => name.startsWith('@pyreon/'))
}

/** Every Pyreon `.tsx` under `dir`, skipping dependencies, build output, tests and other frameworks' projects. */
export function collectTsx(dir: string, out: string[] = []): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  if (isOtherFrameworkProject(dir)) return out
  for (const e of entries) {
    if (e === 'node_modules' || e === 'dist' || e === 'lib' || e.startsWith('.')) continue
    if (e === 'tests' || e === '__tests__') continue
    const p = join(dir, e)
    const st = lstatSync(p)
    if (st.isSymbolicLink()) continue
    if (st.isDirectory()) collectTsx(p, out)
    else if (e.endsWith('.tsx') && !/\.(test|spec)\.tsx$/.test(e)) out.push(p)
  }

  return out
}

const tagOf = (n: N): string => {
  const name = n.openingElement?.name
  return name?.type === 'JSXIdentifier' ? (name.name as string) : ''
}

const isTplCall = (n: N): boolean =>
  n.type === 'CallExpression' && n.callee?.type === 'Identifier' && n.callee.name === '_tpl'

function rootReason(n: N): string {
  const opening = n.openingElement
  if (opening.selfClosing) return 'root:self-closing'
  const attrs: N[] = opening.attributes ?? []
  if (attrs.some((a) => a.type === 'JSXAttribute' && a.name?.name === 'key')) return 'root:keyed'
  if (attrs.some((a) => a.type === 'JSXSpreadAttribute')) return 'root:spread'

  return 'root:other'
}

function bucketOf(anc: N[], n: N): string {
  if (anc.some(isTplCall)) return 'in-template'
  const parent = anc[anc.length - 1]
  if (parent && (parent.type === 'JSXElement' || parent.type === 'JSXFragment')) return 'child-of-h'
  for (let i = anc.length - 1; i >= 0; i--) {
    const a = anc[i]
    if (a.type === 'JSXAttribute') return 'attr-value'
    if (a.type === 'JSXExpressionContainer') return 'expr-under-h'
  }

  return rootReason(n)
}

/** Count the DOM elements `transform` leaves to `jsx()` across `files`. */
export function templateBailCensus(files: string[], transform: ClientTransform): CensusResult {
  const buckets: Record<string, number> = {}
  let compiled = 0
  let total = 0
  for (const file of files) {
    let out: string
    try {
      out = transform(readFileSync(file, 'utf8'), file)
    } catch {
      continue
    }
    let program: N
    try {
      program = parseSync('census.tsx', out, { sourceType: 'module', lang: 'tsx' }).program
    } catch {
      continue
    }
    compiled++
    const visit = (node: N, anc: N[]): void => {
      if (!node || typeof node !== 'object') return
      if (Array.isArray(node)) {
        for (const c of node) visit(c, anc)
        return
      }
      if (typeof node.type !== 'string') return
      if (node.type === 'JSXElement' && /^[a-z]/.test(tagOf(node))) {
        total++
        const b = bucketOf(anc, node)
        buckets[b] = (buckets[b] ?? 0) + 1
      }
      anc.push(node)
      for (const key of Object.keys(node)) {
        const v = node[key]
        if (v && typeof v === 'object') visit(v, anc)
      }
      anc.pop()
    }
    visit(program, [])
  }

  return { files: files.length, compiled, total, buckets }
}
