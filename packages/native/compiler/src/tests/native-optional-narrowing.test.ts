// Optional narrowing on iOS + Android.
//
// TypeScript narrows an optional in the branch that proved it present:
//
//   books === undefined ? <Text>Loading</Text> : <Text>{books.length}</Text>
//   if (b.tags === undefined) return 0; return b.tags.length
//   sel() ? sel().title : 'none'
//
// Swift never narrows through a nil test (`books.count` on `[Book]?` is "must
// be unwrapped"), and Kotlin smart-casts only a STABLE value — not a
// `by mutableStateOf` signal, a `derivedStateOf` computed, or a `var` field of
// a data class, which is every emitted struct field. Before this, only a bare
// IDENTIFIER in a value ternary or a statement `if` narrowed on Swift; the
// view-position conditionals, the early-return guard, signal reads and member
// chains all failed to compile — on Swift, on Kotlin, or on both.
//
// Bisect-load-bearing: neutering `narrowingFor` (return null) fails the emit
// specs and both compile gates with "value of optional type … must be
// unwrapped" (swiftc) / "smart cast … is impossible" (kotlinc).

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  isSwiftUIAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const HEAD = `import { Stack, Text } from '@pyreon/primitives'
import { signal, computed } from '@pyreon/reactivity'
import type { VNodeChild } from '@pyreon/core'
type Book = { title: string; tags?: string[] | undefined; note?: string | undefined }
`
const swift = (src: string) => transform(HEAD + src, { target: 'swift' })
const kotlin = (src: string) => transform(HEAD + src, { target: 'kotlin' })

const SHELF = `function Shelf(props: { children: (d: Book[] | undefined) => VNodeChild }) { return props.children(undefined) }
`

describe('a local / parameter subject', () => {
  it('view ternary on a render-callback parameter → if let (Swift); smart cast (Kotlin)', () => {
    const src = `${SHELF}export function App() {
  return <Shelf>{(books) => books === undefined ? <Text>Loading</Text> : <Text>{books.length}</Text>}</Shelf>
}`
    const sw = swift(src).code
    expect(sw).toContain('if let books {')
    expect(sw).toContain('Text(verbatim: "\\(books.count)")')
    expect(kotlin(src).code).toContain('if (books == null) Text(text = "Loading") else Text(text = "${books.length}")')
  })

  it('`{x != null && <X/>}` → if let', () => {
    const src = `${SHELF}export function App() { return <Shelf>{(books) => books != null && <Text>{books.length}</Text>}</Shelf> }`
    expect(swift(src).code).toContain('if let books {\n')
  })

  it('early-return guard → guard let (Swift); Kotlin smart-casts the parameter', () => {
    const src = `export function App() {
  const lenOf = (b: Book | undefined): number => {
    if (b === undefined) return 0
    return b.title.length
  }
  return <Text>{lenOf(undefined)}</Text>
}`
    expect(swift(src).code).toContain('guard let b else {\n      return 0\n    }\n    return b.title.utf16.count')
    expect(kotlin(src).code).toContain('if (b == null) {')
  })
})

describe('a signal / computed subject', () => {
  const src = `export function App() {
  const sel = signal<Book | undefined>(undefined)
  const pick = computed(() => sel())
  return (
    <Stack>
      <Text>{sel() === undefined ? 'none' : sel().title}</Text>
      {sel() !== undefined && <Text>{sel().title}</Text>}
      {pick() === undefined ? <Text>none</Text> : <Text>{pick().title}</Text>}
    </Stack>
  )
}`
  it('Swift binds the property', () => {
    const sw = swift(src).code
    expect(sw).toContain('(sel.map { sel in sel.title } ?? "none")')
    expect(sw).toContain('if let sel {')
    expect(sw).toContain('if let pick {')
  })
  it('Kotlin binds the delegated property (it cannot smart-cast)', () => {
    const kt = kotlin(src).code
    expect(kt).toContain('when (val sel = sel) { null -> "none" else -> sel.title }')
    expect(kt).toContain('sel?.let { sel ->')
    expect(kt).toContain('when (val pick = pick) { null -> Text(text = "none") else -> Text(text = "${pick.title}") }')
  })
})

describe('a member-chain subject', () => {
  it('value, view and statement positions bind the field', () => {
    const src = `function View(props: { book: Book }) {
  const noteLen = (b: Book): number => {
    if (b.note) {
      return b.note.length
    }
    return 0
  }
  return (
    <Stack>
      <Text>{props.book.tags === undefined ? 0 : props.book.tags.length}</Text>
      {props.book.note === undefined ? <Text>none</Text> : <Text>{props.book.note}</Text>}
      <Text>{noteLen(props.book)}</Text>
    </Stack>
  )
}
export function App() { return <View book={{ title: 'a' }} /> }`
    const sw = swift(src).code
    expect(sw).toContain('(book.tags.map { tags in tags.count } ?? 0)')
    expect(sw).toContain('if let note = book.note {')
    // truthiness on a string also rejects '' — JS falsy
    expect(sw).toContain('if let note = b.note, !note.isEmpty {')
    const kt = kotlin(src).code
    expect(kt).toContain('when (val tags = book.tags) { null -> 0 else -> tags.length }')
    expect(kt).toContain('when (val note = b.note?.takeIf { it.isNotEmpty() }) {')
  })

  it('the member guard binds the field for the rest of the body', () => {
    const src = `export function App() {
  const tagCount = (b: Book): number => {
    if (b.tags === undefined) return 0
    return b.tags.length
  }
  return <Text>{tagCount({ title: 'a' })}</Text>
}`
    expect(swift(src).code).toContain('guard let tags = b.tags else {\n      return 0\n    }\n    return tags.count')
    expect(kotlin(src).code).toContain('val tags = b.tags ?: run {\n      return 0\n    }\n    return tags.length')
  })

  it('a binder that would shadow a name the branch already uses gets a suffix', () => {
    const src = `export function App() {
  const f = (b: Book, tags: number): number => (b.tags === undefined ? tags : b.tags.length + tags)
  return <Text>{f({ title: 'a' }, 1)}</Text>
}`
    expect(swift(src).code).toContain('b.tags.map { tagsValue in tagsValue.count + tags }')
  })
})

describe('JS truthiness is kept for strings', () => {
  it('`s ? s.length : -1` rejects the empty string, like the web', () => {
    const src = `export function App() {
  const f = (s: string | undefined): number => (s ? s.length : -1)
  return <Text>{f('')}</Text>
}`
    expect(swift(src).code).toContain('s.flatMap { $0.isEmpty ? nil : $0 }.map { s in s.utf16.count } ?? -1')
    expect(kotlin(src).code).toContain('when (val s = s?.takeIf { it.isNotEmpty() }) { null -> -1 else -> s.length }')
  })
})

describe('shapes that cannot be narrowed are NAMED', () => {
  it('a branch that WRITES the narrowed field', () => {
    const src = `export function App() {
  const add = (b: Book): number => {
    if (b.tags) {
      b.tags = [...b.tags, 'x']
      return b.tags.length
    }
    return 0
  }
  return <Text>{add({ title: 'a' })}</Text>
}`
    expect(swift(src).warnings.join('\n')).toContain('PMTC could not narrow it')
    expect(kotlin(src).warnings.join('\n')).toContain('PMTC could not narrow it')
  })
})

// ---------------------------------------------------------------------------

const BROAD = `${SHELF}
function BookView(props: { book: Book; maybe?: Book | undefined }) {
  return (
    <Stack>
      <Text>{props.book.tags === undefined ? 0 : props.book.tags.length}</Text>
      <Text>{props.book.tags ? props.book.tags.length : 0}</Text>
      {props.book.tags !== undefined && <Text>{props.book.tags.length}</Text>}
      {props.book.note === undefined ? <Text>no note</Text> : <Text>{props.book.note.length}</Text>}
      <Text>{props.maybe === undefined ? 'none' : props.maybe.title}</Text>
      {props.maybe ? <Text>{props.maybe.title}</Text> : <Text>none</Text>}
    </Stack>
  )
}
export function App() {
  const sel = signal<Book | undefined>(undefined)
  const pick = computed(() => sel())
  const lenOf = (b: Book | undefined): number => {
    if (b === undefined) return 0
    return b.title.length
  }
  const tagCount = (b: Book): number => {
    if (b.tags === undefined) return 0
    return b.tags.length
  }
  const noteLen = (b: Book): number => {
    if (b.note) {
      return b.note.length
    }
    return 0
  }
  const firstTag = (b: Book): string => {
    if (!b.tags) {
      return ''
    } else {
      return b.tags.join(',')
    }
  }
  const sLen = (s: string | undefined): number => (s === undefined ? 0 : s.length)
  const sTruthy = (s: string | undefined): number => (s ? s.length : -1)
  const clear = () => {
    const cur = sel()
    if (!cur) return
    sel.set({ title: cur.title })
  }
  return (
    <Stack>
      <Shelf>{(books) => books === undefined ? <Text>Loading</Text> : <Text>{\`\${books.length} books\`}</Text>}</Shelf>
      <Shelf>{(books) => books ? <Text>{books.length}</Text> : <Text>none</Text>}</Shelf>
      <Shelf>{(books) => books != null && <Text>{books.length}</Text>}</Shelf>
      <Text>{sel() === undefined ? 'none' : sel().title}</Text>
      <Text>{sel() ? sel().title.length : 0}</Text>
      {sel() !== undefined && <Text>{sel().title}</Text>}
      {pick() === undefined ? <Text>none</Text> : <Text>{pick().title}</Text>}
      <Text>{lenOf(sel())}</Text>
      <Text>{sLen('x')}</Text>
      <Text>{sTruthy('')}</Text>
      <Text>{noteLen({ title: 'a' })}</Text>
      <Text>{tagCount({ title: 'a' })}</Text>
      <Text>{firstTag({ title: 'a' })}</Text>
      <BookView book={{ title: 'a' }} />
    </Stack>
  )
}
`

describe('the emit compiles', () => {
  it('neither target warns on the broad fixture', () => {
    expect(swift(BROAD).warnings).toEqual([])
    expect(kotlin(BROAD).warnings).toEqual([])
  })

  it.skipIf(!isSwiftcAvailable())('Swift: against the stubs', () => {
    const r = validateSwiftWithStubs(swift(BROAD).code)
    expect(r.ok, r.error ?? '').toBe(true)
  }, 120_000)

  it.skipIf(!isKotlincAvailable())('Kotlin: on kotlinc', () => {
    const r = validateKotlin(kotlin(BROAD).code)
    expect(r.ok, r.error ?? '').toBe(true)
  }, 300_000)
})

describe.runIf(isSwiftUIAvailable())('the emit compiles against the real SDK + runtime', () => {
  it('BROAD fixture', () => {
    const REPO = resolve(import.meta.dirname, '../../../../..')
    const sources: string[] = []
    const walk = (dir: string): void => {
      let entries: string[]
      try {
        entries = readdirSync(dir)
      } catch {
        return
      }
      for (const e of entries) {
        if (e === 'node_modules' || e === 'lib' || e === '.build' || e === 'Package.swift') continue
        if (e.toLowerCase() === 'tests' || /Tests?\.swift$/.test(e)) continue
        const p = join(dir, e)
        if (statSync(p).isDirectory()) walk(p)
        else if (p.endsWith('.swift')) sources.push(p)
      }
    }
    for (const r of ['packages/fundamentals', 'packages/core', 'packages/native/runtime-swift', 'packages/native/router-swift']) {
      walk(join(REPO, r))
    }
    expect(sources.length).toBeGreaterThan(40)
    const dir = mkdtempSync(join(tmpdir(), 'pyreon-narrowing-'))
    try {
      const app = join(dir, 'Narrowing.swift')
      writeFileSync(app, `import SwiftUI\nimport Foundation\n${swift(BROAD).code}`, 'utf8')
      const sdk = execFileSync('xcrun', ['--sdk', 'iphonesimulator', '--show-sdk-path'], { encoding: 'utf8' }).trim()
      try {
        execFileSync(
          'xcrun',
          ['--sdk', 'iphonesimulator', 'swiftc', '-typecheck', '-target', 'arm64-apple-ios17.0-simulator', '-sdk', sdk, app, ...sources],
          { encoding: 'utf8', stdio: 'pipe' },
        )
      } catch (err) {
        const e = err as { stderr?: string | Buffer; stdout?: string | Buffer }
        const out = [e.stderr, e.stdout].map((x) => (typeof x === 'string' ? x : x?.toString('utf8')) ?? '').join('\n')
        expect.fail(`swiftc -typecheck failed:\n${out.split('\n').filter((l) => l.includes('error:')).slice(0, 12).join('\n')}`)
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 300_000)
})
