/**
 * Generate `src/swift-reserved-names.ts`: every capitalised name the shipped Swift runtime sources, and the Swift emit
 * itself, spell BARE.
 *
 * An iOS app compiles each dependency's `native/swift/*.swift` INTO the app target, beside the generated code. A type
 * the app declares at module scope therefore shadows a bare name in those runtime files: an app model `Task` turned
 * `Task { … }` in `PyreonWebView.swift` into a call of the model's `init(from: Decoder)`, and `Error`, `Data`, `Color`,
 * `State`, `Group`, `Binding`, `Button`, `Identifiable`… break other files the same way. The base runtime and the
 * router are SwiftPM modules of their own, but the generated code names their types bare, so an app type named like
 * one of those shadows it in the generated file itself.
 *
 * The compiler emits a user type whose name is on this list with a trailing `_` (`swift-reserved-rename.ts`). The list
 * is a pure function of the runtime sources: `swift-reserved-names.test.ts` re-scans them and fails when the committed
 * file is stale, so a runtime file that starts spelling a new name bare cannot ship without the compiler reserving it.
 *
 * Run: `bun packages/native/compiler/scripts/gen-swift-reserved-names.ts`
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { SWIFT_UI_STUBS } from '../src/swift-stubs'

const REPO = resolve(import.meta.dirname, '../../../..')
const OUT = join(import.meta.dirname, '../src/swift-reserved-names.ts')

/** Roots that hold shipped Swift runtime source: every co-located `native/swift` and the two SwiftPM packages. */
const ROOTS = ['packages/fundamentals', 'packages/core', 'packages/native/runtime-swift', 'packages/native/router-swift']

/** Every shipped runtime Swift file (no tests, no SwiftPM manifest), sorted. */
export function shippedRuntimeSwift(repo: string = REPO): string[] {
  const out: string[] = []
  const walk = (dir: string): void => {
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const e of entries) {
      if (e === 'node_modules' || e === 'lib' || e === '.build' || e.startsWith('.') || e === 'Package.swift') continue
      if (e.toLowerCase() === 'tests' || /Tests?\.swift$/.test(e)) continue
      const p = join(dir, e)
      if (statSync(p).isDirectory()) walk(p)
      else if (p.endsWith('.swift')) out.push(p)
    }
  }
  for (const root of ROOTS) walk(join(repo, root))

  return out.sort()
}

/** An open string literal, and the paren depth of the interpolation open inside it (-1: none, so its text is skipped). */
interface OpenString {
  triple: boolean
  interp: number
}

/** The index after the comment starting at `i`, or `i` when none starts there. Block comments nest in Swift. */
function skipComment(src: string, i: number): number {
  if (src.startsWith('//', i)) {
    const nl = src.indexOf('\n', i)
    return nl < 0 ? src.length : nl
  }
  if (!src.startsWith('/*', i)) return i
  let depth = 0
  let j = i
  do {
    const step = src.startsWith('/*', j) ? 1 : src.startsWith('*/', j) ? -1 : 0
    depth += step
    j += step === 0 ? 1 : 2
  } while (depth > 0 && j < src.length)

  return j
}

/** One step inside a string literal's TEXT: what it emits and where it ends. */
function stepInText(src: string, i: number, strings: OpenString[]): { out: string; next: number } {
  const top = strings[strings.length - 1]!
  if (src.startsWith('\\(', i)) {
    top.interp = 0
    return { out: '(', next: i + 2 }
  }
  if (src[i] === '\\') return { out: '', next: i + 2 }
  const close = top.triple ? '"""' : '"'
  if (!src.startsWith(close, i)) return { out: '', next: i + 1 }
  strings.pop()

  return { out: '""', next: i + close.length }
}

/** Track the parens of the interpolation open in the innermost string, so its closing `)` resumes the text. */
function trackInterpolation(c: string, strings: OpenString[]): void {
  const top = strings[strings.length - 1]
  if (top === undefined) return
  if (c === '(') top.interp += 1
  else if (c === ')') top.interp -= 1
}

/** Swift source with comments and string-literal TEXT removed (interpolations are code and stay). */
export function swiftCode(src: string): string {
  let out = ''
  let i = 0
  const strings: OpenString[] = []
  while (i < src.length) {
    if (strings.length > 0 && strings[strings.length - 1]!.interp < 0) {
      const step = stepInText(src, i, strings)
      out += step.out
      i = step.next
      continue
    }
    const after = skipComment(src, i)
    if (after !== i) {
      out += ' '
      i = after
    } else if (src[i] === '"') {
      const triple = src.startsWith('"""', i)
      strings.push({ triple, interp: -1 })
      i += triple ? 3 : 1
    } else {
      trackInterpolation(src[i]!, strings)
      out += src[i]
      i += 1
    }
  }

  return out
}

/**
 * The capitalised identifiers `code` spells bare: not a member (`x.Foo`), not a compiler directive (`#Preview`), and
 * at least two characters (a one-letter name is a generic parameter, which shadows a module type rather than the other
 * way round). Over-approximate on purpose: a name reserved needlessly costs a `_` in the emit, a name missed costs a
 * build.
 */
export function bareCapitalised(code: string): Set<string> {
  const out = new Set<string>()
  for (const m of code.matchAll(/(?<![\w.$#`])[A-Z][A-Za-z0-9_]+\b/g)) out.add(m[0])

  return out
}

/**
 * Standard-library names the Swift EMIT spells that neither the runtime sources nor the stubs do (the stub gate runs
 * on a real Swift toolchain, so it never stubs the standard library). Found by diffing the golden corpus's emitted
 * names against the scan.
 */
const EMIT_STDLIB_NAMES = ['Result']

/**
 * The reserved set for a repo, sorted: the union over every shipped runtime Swift file, the SwiftUI / runtime surface
 * the stub gate models (`SWIFT_UI_STUBS` exists so every name the emit spells compiles on Linux, which makes it the
 * emit's own vocabulary: `TextField`, `ScrollView`, `Toggle`…), and `EMIT_STDLIB_NAMES`.
 */
export function scanReservedSwiftNames(repo: string = REPO): string[] {
  const names = new Set<string>(EMIT_STDLIB_NAMES)
  for (const file of shippedRuntimeSwift(repo)) {
    for (const n of bareCapitalised(swiftCode(readFileSync(file, 'utf8')))) names.add(n)
  }
  for (const n of bareCapitalised(swiftCode(SWIFT_UI_STUBS))) names.add(n)

  return [...names].sort()
}

/** The generated module's text for `names`. */
export function renderReservedSwiftNames(names: readonly string[]): string {
  const rows: string[] = []
  let row = ''
  for (const n of names) {
    const item = `'${n}',`
    if (row.length + item.length + 1 > 116) {
      rows.push(row)
      row = ''
    }
    row += row === '' ? item : ` ${item}`
  }
  if (row !== '') rows.push(row)

  return `// GENERATED by packages/native/compiler/scripts/gen-swift-reserved-names.ts — do not edit.
// Regenerate: bun packages/native/compiler/scripts/gen-swift-reserved-names.ts
//
// Every capitalised name the shipped runtime Swift files and the Swift emit spell bare. An app type with one of these
// names shadows it in the runtime sources an iOS app compiles into its own target, or in the generated file itself,
// so the Swift emit renames it (\`swift-reserved-rename.ts\`). Freshness: \`tests/swift-reserved-names.test.ts\`.

/** Names a top-level type in generated Swift must not take. */
export const SWIFT_RESERVED_NAMES: ReadonlySet<string> = new Set([
${rows.map((r) => `  ${r}`).join('\n')}
])
`
}

if (import.meta.main) {
  const files = shippedRuntimeSwift()
  const names = scanReservedSwiftNames()
  writeFileSync(OUT, renderReservedSwiftNames(names), 'utf8')
  console.log(`wrote ${names.length} names from ${files.length} files to ${relative(REPO, OUT)}`)
}
