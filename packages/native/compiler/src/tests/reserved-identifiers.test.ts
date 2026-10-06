// Reserved words as user identifiers (issue #3783).
//
// `operator`, `where`, `class`, `in`, `init`, … are legal TypeScript / Zod /
// JSON / OpenAPI property names and legal locals, parameters and function
// names. They are RESERVED in Swift and/or Kotlin, so an emitter that writes a
// user name verbatim produces a file the toolchain rejects — and does so with
// ZERO warnings from PMTC (a clean `warnings: []` is what the issue's repro
// printed beside an invalid struct).
//
// The first instance found was `zodSchema(z.object({ operator, where }))`, but
// the defect was never the two words and never the zod path: every emitter that
// spells a user name had to remember `swiftIdent`/`kotlinMember`, and the zod
// schema, store, model, feature, enum-case, `<For>` item-parameter and
// `<For by>` key emitters each had not. So this file locks the CLASS, three ways:
//
//   1. The keyword tables are checked against the REAL parsers (the tables were
//      incomplete: `precedencegroup` and `await` failed in swiftc and were
//      unlisted).
//   2. A matrix of every emit shape that spells a user name, run through the
//      real swiftc typecheck and kotlinc, with EVERY keyword at once.
//   3. The wire format: a backticked Swift property must keep its JSON key
//      (a real encode/decode round trip), and a Swift `@Observable` class —
//      which cannot take a backticked property at all — must still compile.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  kotlinEnumEntry,
  kotlinIdent,
  kotlinMember,
  localBase,
  swiftIdent,
  swiftObservableIdent,
  withObservableMembers,
} from '../identifier-safety'
import { transform } from './first-party-plugins'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

// ── word lists ──────────────────────────────────────────────────────────────

/** Every Swift keyword + contextual word that could plausibly be a user name. */
const SWIFT_CANDIDATES = (
  'associatedtype class deinit enum extension fileprivate func import init inout internal let open operator ' +
  'private precedencegroup protocol public rethrows static struct subscript typealias var break case catch ' +
  'continue default defer do else fallthrough for guard if in repeat return throw switch where while Any as ' +
  'await false is nil self Self super throws true try Type Protocol async some any each macro consume copy ' +
  'borrowing consuming discard actor isolated nonisolated indirect lazy mutating nonmutating optional override ' +
  'required convenience dynamic final weak unowned willSet didSet get set left right none prefix postfix infix ' +
  'package sending unsafe'
).split(' ')

/** Kotlin HARD keywords + the soft/modifier words (which must stay UNescaped). */
const KOTLIN_HARD = (
  'as break class continue do else false for fun if in interface is null object package return super this ' +
  'throw true try typealias typeof val var when while'
).split(' ')
const KOTLIN_SOFT = (
  'by catch constructor delegate dynamic field file finally get import init param property receiver set ' +
  'setparam value where abstract actual annotation companion const crossinline data enum expect external final ' +
  'infix inline inner internal lateinit noinline open operator out override private protected public reified ' +
  'sealed suspend tailrec vararg it'
).split(' ')

/** The words a probe source uses as FIELD names (legal in TS/JSON/Zod for all). */
const FIELD_WORDS = [
  ...new Set(
    [...SWIFT_CANDIDATES, ...KOTLIN_HARD].filter(
      // `Any`/`Self`/`Type`/`Protocol` differ from `any`/`self`/`type`… only by
      // case, which collides on the JVM (`getAny()`), so a single struct cannot
      // carry both — a probe artifact, not an emit defect.
      (w) => w !== 'Any' && w !== 'Self' && w !== 'Type' && w !== 'Protocol',
    ),
  ),
]

/** TypeScript reserved words cannot be a local/param/function name. */
const TS_RESERVED = new Set(
  (
    'break case catch class const continue debugger default delete do else enum export extends false finally for ' +
    'function if import in instanceof new null return super switch this throw true try typeof var void while with ' +
    'let static implements interface package private protected public yield await'
  ).split(' '),
)
// `self` / `init` are legal TS names but Swift gives them instance meaning (a
// function called `self` cannot be CALLED as `` `self`(1) ``) — a documented
// residual, so the LOCAL matrix leaves them out and `Any`/`Self`/`Type`/`Protocol`
// differ only by case from another word on the JVM (`getSelf` clash).
const LOCAL_WORDS = FIELD_WORDS.filter((w) => !TS_RESERVED.has(w) && w !== 'self' && w !== 'init')

// ── 1. helpers ──────────────────────────────────────────────────────────────

describe('reserved identifiers — helper policy', () => {
  it('escapes the Swift words swiftc itself rejects that the table used to miss', () => {
    // Found by probing swiftc: both fail as an unescaped identifier.
    expect(swiftIdent('precedencegroup')).toBe('`precedencegroup`')
    expect(swiftIdent('await')).toBe('`await`')
    expect(swiftIdent('operator')).toBe('`operator`')
    expect(swiftIdent('where')).toBe('`where`')
  })

  it('leaves contextual words that parse as identifiers alone', () => {
    for (const w of ['some', 'any', 'Type', 'get', 'set', 'lazy', 'left']) {
      expect(swiftIdent(w)).toBe(w)
    }
  })

  it('kotlinMember escapes hard keywords but not Kotlin soft keywords', () => {
    for (const w of KOTLIN_HARD) expect(kotlinMember(w)).toBe('`' + w + '`')
    for (const w of ['operator', 'where', 'data', 'value', 'it']) expect(kotlinMember(w)).toBe(w)
    expect(kotlinIdent('in')).toBe('`in`')
  })

  it('an enum ENTRY also escapes the soft keywords that open a member declaration', () => {
    expect(kotlinEnumEntry('init')).toBe('`init`')
    expect(kotlinEnumEntry('constructor')).toBe('`constructor`')
    expect(kotlinEnumEntry('where')).toBe('where')
    expect(kotlinEnumEntry('class')).toBe('`class`')
  })

  it('localBase is an identifier base that is never keyword-escaped', () => {
    expect(localBase('where')).toBe('where')
    expect(localBase('my-key')).toBe('myKey')
    expect(localBase('has space')).toBe('has_space')
  })

  it('@Observable members take a trailing underscore, scoped and restored', () => {
    expect(swiftObservableIdent('where')).toBe('where_')
    expect(swiftObservableIdent('count')).toBe('count')
    expect(swiftIdent('where')).toBe('`where`')
    const inside = withObservableMembers(['where'], () => [swiftIdent('where'), swiftIdent('class')])
    expect(inside).toEqual(['where_', '`class`']) // only the store's own members
    expect(swiftIdent('where')).toBe('`where`') // restored, not reset
    // Nesting composes and unwinds.
    withObservableMembers(['a'], () => {
      withObservableMembers(['where'], () => expect(swiftIdent('where')).toBe('where_'))
      expect(swiftIdent('where')).toBe('`where`')
    })
  })

  it('restores the observable scope even when the body throws', () => {
    expect(() =>
      withObservableMembers(['where'], () => {
        throw new Error('boom')
      }),
    ).toThrow('boom')
    expect(swiftIdent('where')).toBe('`where`')
  })
})

// ── 2. the keyword tables vs the REAL parsers ───────────────────────────────

function lineErrors(output: string, file: string): number[] {
  const out = new Set<number>()
  for (const m of output.matchAll(new RegExp(`${file.replace(/[.]/g, '\\.')}:(\\d+):\\d+: error`, 'g'))) {
    out.add(Number(m[1]))
  }
  return [...out]
}

describe('reserved identifiers — keyword tables match the real toolchains', () => {
  it.skipIf(!isSwiftcAvailable())(
    'every Swift word that fails as an unescaped identifier is escaped by swiftIdent',
    () => {
      const dir = mkdtempSync(join(tmpdir(), 'pyreon-kw-swift-'))
      const file = join(dir, 'raw.swift')
      // One word per line, unescaped, as a property, a local AND a closure
      // parameter (`{ async in … }` parses `async` as an effect, not a name).
      writeFileSync(
        file,
        SWIFT_CANDIDATES.map((w) => `struct S_${w} { var ${w}: Int = 0 }; func f_${w}() { let ${w} = 1; _ = ${w}; let _: (Int) -> Int = { ${w} in ${w} } }`).join('\n'),
      )
      let out = ''
      try {
        execFileSync('swiftc', ['-parse', file], { stdio: 'pipe' })
      } catch (e) {
        out = String((e as { stderr?: Buffer }).stderr ?? '')
      }
      const failing = lineErrors(out, 'raw.swift').map((n) => SWIFT_CANDIDATES[n - 1]!)
      expect(failing.length).toBeGreaterThan(40) // the probe really ran
      const unescaped = failing.filter((w) => swiftIdent(w) === w)
      expect(unescaped).toEqual([])

      // …and the ESCAPED form of every candidate parses (escaping never over-reaches).
      const esc = join(dir, 'esc.swift')
      writeFileSync(
        esc,
        SWIFT_CANDIDATES.map((w) => `struct S_${w} { var ${swiftIdent(w)}: Int = 0 }; func f_${w}() { let ${swiftIdent(w)} = 1; _ = ${swiftIdent(w)}; let _: (Int) -> Int = { ${swiftIdent(w)} in ${swiftIdent(w)} } }`).join('\n'),
      )
      expect(() => execFileSync('swiftc', ['-parse', esc], { stdio: 'pipe' })).not.toThrow()
    },
    120_000,
  )

  it.skipIf(!isKotlincAvailable())(
    'kotlinMember escapes exactly the hard keywords kotlinc rejects',
    () => {
      const dir = mkdtempSync(join(tmpdir(), 'pyreon-kw-kt-'))
      const file = join(dir, 'raw.kt')
      const words = [...KOTLIN_HARD, ...KOTLIN_SOFT]
      writeFileSync(file, words.map((w, i) => `data class C${i}(val ${w}: Int = 0)`).join('\n'))
      let out = ''
      try {
        execFileSync('kotlinc', [file, '-d', join(dir, 'out')], { stdio: 'pipe' })
      } catch (e) {
        out = String((e as { stderr?: Buffer }).stderr ?? '')
      }
      const failing = lineErrors(out, 'raw.kt').map((n) => words[n - 1]!)
      expect(failing.sort()).toEqual([...KOTLIN_HARD].sort())
      expect(failing.filter((w) => kotlinMember(w) === w)).toEqual([])
    },
    180_000,
  )
})

// ── 3. emit-shape matrix through the REAL toolchains ────────────────────────

const lines = (ws: readonly string[], f: (w: string) => string, sep = '\n') => ws.map(f).join(sep)
const texts = (ws: readonly string[], e: (w: string) => string) => ws.map((w) => `<Text>{${e(w)}}</Text>`).join('')

const ZOD_HEAD = `import { z } from 'zod'\nimport { zodSchema } from '@pyreon/validation'\n`

const SHAPES: Record<string, string> = {
  // The issue's repro, widened to every keyword.
  zodSchema: `${ZOD_HEAD}export const S = zodSchema(z.object({\n${lines(FIELD_WORDS, (w) => `  ${w}: z.string(),`)}\n}))\n`,
  zodOptional: `${ZOD_HEAD}export const S = zodSchema(z.object({\n${lines(FIELD_WORDS, (w) => `  ${w}: z.string().optional(),`)}\n}))\n`,
  zodConstraints: `${ZOD_HEAD}export const S = zodSchema(z.object({\n${lines(FIELD_WORDS, (w) => `  ${w}: z.string().min(2).max(9),`)}\n}))\n`,
  zodNested: `${ZOD_HEAD}export const S = zodSchema(z.object({\n${lines(FIELD_WORDS, (w) => `  ${w}: z.object({ ${w}: z.string() }),`)}\n}))\n`,
  zodArrayOfObjects: `${ZOD_HEAD}export const S = zodSchema(z.object({\n${lines(FIELD_WORDS, (w) => `  ${w}: z.array(z.object({ ${w}: z.number() })),`)}\n}))\n`,
  // Variant LITERALS become enum cases / sealed-class names; the discriminator
  // KEY is itself a keyword.
  zodDiscriminated: `${ZOD_HEAD}export const S = zodSchema(z.discriminatedUnion('where', [\n${lines(FIELD_WORDS.slice(0, 40), (w) => `  z.object({ where: z.literal('${w}'), ${w}: z.string() }),`)}\n]))\n`,
  zodDiscriminatorKeyword: `${ZOD_HEAD}export const S = zodSchema(z.discriminatedUnion('operator', [\n  z.object({ operator: z.literal('a'), x: z.string() }),\n  z.object({ operator: z.literal('b'), x: z.string() }),\n]))\n`,
  validateInline: `import { s } from '@pyreon/validate'\nexport function App() {\n  const r = s.object({ ${lines(FIELD_WORDS, (w) => `${w}: s.string()`, ', ')} }).safeParse({ ${lines(FIELD_WORDS, (w) => `${w}: 'x'`, ', ')} })\n  return <Text>{r.success ? 'y' : 'n'}</Text>\n}\n`,
  featureSchema: `import { defineFeature } from '@pyreon/feature'\nexport const Todo = defineFeature({ name: 'todo', schema: { ${lines(FIELD_WORDS, (w) => `${w}: 'string'`, ', ')} } })\n`,
  // type alias / interface / inline literal structs: declaration, literal, access.
  typeAlias: `type Row = {\n${lines(FIELD_WORDS, (w) => `  ${w}: string`, ';\n')}\n}\nexport function App() {\n  const rows = signal<Row[]>([{ ${lines(FIELD_WORDS, (w) => `${w}: 'x'`, ', ')} }])\n  return <Stack><For each={rows()} by={(r) => r.where}>{(r) => <Stack>${texts(FIELD_WORDS, (w) => `r.${w}`)}</Stack>}</For></Stack>\n}\n`,
  interfaceStruct: `interface Row {\n${lines(FIELD_WORDS, (w) => `  ${w}: string`, ';\n')}\n}\nexport function App() {\n  const r: Row = { ${lines(FIELD_WORDS, (w) => `${w}: 'x'`, ', ')} }\n  return <Stack>${texts(FIELD_WORDS, (w) => `r.${w}`)}</Stack>\n}\n`,
  inlineObject: `export function App() {\n  const o = signal({ ${lines(FIELD_WORDS, (w) => `${w}: 1`, ', ')} })\n  return <Stack>${texts(FIELD_WORDS, (w) => `o().${w}`)}</Stack>\n}\n`,
  destructure: `type Row = { ${lines(FIELD_WORDS.slice(0, 30), (w) => `${w}: string`, '; ')} }\nexport function App() {\n  const r: Row = { ${lines(FIELD_WORDS.slice(0, 30), (w) => `${w}: 'x'`, ', ')} }\n  const { ${lines(FIELD_WORDS.slice(0, 30), (w) => `${w}: v_${w}`, ', ')} } = r\n  return <Stack>${texts(FIELD_WORDS.slice(0, 30), (w) => `v_${w}`)}</Stack>\n}\n`,
  // Names that are not struct fields.
  localConsts: `export function App() {\n${lines(LOCAL_WORDS, (w) => `  const ${w} = 1`)}\n  return <Stack>${texts(LOCAL_WORDS, (w) => w)}</Stack>\n}\n`,
  localSignals: `export function App() {\n${lines(LOCAL_WORDS, (w) => `  const ${w} = signal(1)`)}\n  return <Stack>${texts(LOCAL_WORDS, (w) => `${w}()`)}</Stack>\n}\n`,
  handlerLocals: `export function App() {\n  const go = () => {\n${lines(LOCAL_WORDS, (w) => `    const ${w} = 1`)}\n    console.log(${LOCAL_WORDS[0]})\n  }\n  return <Button onPress={go}>x</Button>\n}\n`,
  componentProps: `export function C(props: { ${lines(FIELD_WORDS, (w) => `${w}: string`, '; ')} }) {\n  return <Stack>${texts(FIELD_WORDS, (w) => `props.${w}`)}</Stack>\n}\nexport function App() {\n  return <C ${lines(FIELD_WORDS, (w) => `${w}="x"`, ' ')} />\n}\n`,
  componentPropsDestructured: `export function C({ ${LOCAL_WORDS.join(', ')} }: { ${lines(LOCAL_WORDS, (w) => `${w}: string`, '; ')} }) {\n  return <Stack>${texts(LOCAL_WORDS, (w) => w)}</Stack>\n}\nexport function App() {\n  return <C ${lines(LOCAL_WORDS, (w) => `${w}="x"`, ' ')} />\n}\n`,
  functionParams: `function f(${lines(LOCAL_WORDS, (w) => `${w}: number`, ', ')}) {\n  return [${LOCAL_WORDS.join(', ')}].length\n}\nexport function App() {\n  return <Text>{f(${lines(LOCAL_WORDS, () => '1', ', ')})}</Text>\n}\n`,
  functionNames: `${lines(LOCAL_WORDS, (w) => `function ${w}(n: number) { return n + 1 }`)}\nexport function App() {\n  return <Stack>${texts(LOCAL_WORDS, (w) => `${w}(1)`)}</Stack>\n}\n`,
  arrowNames: `${lines(LOCAL_WORDS, (w) => `const ${w} = (n: number) => n + 1`)}\nexport function App() {\n  return <Stack>${texts(LOCAL_WORDS, (w) => `${w}(1)`)}</Stack>\n}\n`,
  lambdaParams: `export function App() {\n  const xs = signal([1, 2, 3])\n  return <Stack>${texts(LOCAL_WORDS, (w) => `xs().filter((${w}) => ${w} > 1).length`)}</Stack>\n}\n`,
  sortParams: `export function App() {\n  const xs = signal([3, 1, 2])\n  return <Stack>${texts(LOCAL_WORDS, (w) => `xs().slice().sort((${w}, b) => ${w} - b).length`)}</Stack>\n}\n`,
  mapIndexParams: `export function App() {\n  const xs = signal(['a', 'b'])\n  return <Stack>${texts(LOCAL_WORDS, (w) => `xs().map((${w}, i) => ${w} + i).length`)}</Stack>\n}\n`,
  // `<For>` — the item PARAMETER and the `by` key path are both user names.
  forItemParam: `export function App() {\n  const xs = signal([{ id: 1, name: 'a' }])\n  return <Stack>${lines(LOCAL_WORDS, (w) => `<For each={xs()} by={(${w}) => ${w}.id}>{(${w}) => <Text>{${w}.name}</Text>}</For>`, '')}</Stack>\n}\n`,
  forKeyPath: `type R = { ${lines(FIELD_WORDS.slice(0, 40), (w) => `${w}: string`, '; ')} }\nexport function App() {\n  const xs = signal<R[]>([])\n  return <Stack>${lines(FIELD_WORDS.slice(0, 40), (w) => `<For each={xs()} by={(r) => r.${w}}>{(r) => <Text>{r.${w}}</Text>}</For>`, '')}</Stack>\n}\n`,
  // String-literal unions become enum cases / entries.
  stringUnion: `type K = ${lines(FIELD_WORDS, (w) => `'${w}'`, ' | ')}\nexport function App() {\n  const k = signal<K>('where')\n  return <Text>{k()}</Text>\n}\n`,
  // `defineStore` / `model` become @Observable singletons on Swift.
  store: `import { defineStore } from '@pyreon/store'\nconst useS = defineStore('s', () => {\n${lines(LOCAL_WORDS, (w) => `  const ${w} = signal(1)`)}\n  const total = computed(() => ${LOCAL_WORDS.slice(0, 3).map((w) => `${w}()`).join(' + ')})\n  const bump = () => { ${LOCAL_WORDS.slice(0, 3).map((w) => `${w}.set(${w}() + 1)`).join('; ')} }\n  return { ${LOCAL_WORDS.join(', ')}, total, bump }\n})\nexport function App() {\n  return <Stack>${texts(LOCAL_WORDS, (w) => `useS().store.${w}()`)}<Text>{useS().store.total()}</Text><Button onPress={() => { ${lines(LOCAL_WORDS, (w) => `useS().store.${w}.set(2)`, '; ')}; useS().store.bump() }}>go</Button></Stack>\n}\n`,
  model: `import { model } from '@pyreon/state-tree'\nconst m = model({ state: { ${lines(LOCAL_WORDS, (w) => `${w}: 1`, ', ')} } })\n  .views((self) => ({ ${LOCAL_WORDS.slice(0, 5).map((w) => `v_${w}: () => self.${w}() + 1`).join(', ')} }))\n  .actions((self) => ({ ${LOCAL_WORDS.slice(0, 5).map((w) => `a_${w}: () => self.${w}.set(5)`).join(', ')}, bump: () => self.operator.set(self.operator() + 1) }))\n  .create()\nexport function App() {\n  return <Stack>${texts(LOCAL_WORDS, (w) => `m.${w}()`)}<Text>{m.v_${LOCAL_WORDS[0]}()}</Text><Button onPress={() => m.bump()}>go</Button></Stack>\n}\n`,
}

function failure(v: { ok: boolean; error?: string }): string {
  return v.ok ? '' : (v.error ?? '').split('\n').filter((l) => /error/.test(l)).slice(0, 3).join(' | ').replace(/\/[^\s|]*\//g, '')
}

describe('reserved identifiers — every emit shape compiles on the real toolchains', () => {
  for (const [name, src] of Object.entries(SHAPES)) {
    it.skipIf(!isSwiftcAvailable())(`Swift (swiftc typecheck): ${name}`, () => {
      const { code } = transform(src, { target: 'swift', filename: 'P.tsx' })
      expect(failure(validateSwiftWithStubs(code))).toBe('')
    }, 120_000)

    it.skipIf(!isKotlincAvailable())(`Kotlin (kotlinc): ${name}`, () => {
      const { code } = transform(src, { target: 'kotlin', filename: 'P.tsx' })
      expect(failure(validateKotlin(code))).toBe('')
    }, 180_000)
  }
})

// ── 4. emit shape: the specific spellings ───────────────────────────────────

describe('reserved identifiers — spelling', () => {
  const zod = `${ZOD_HEAD}export const Filter = zodSchema(z.object({ operator: z.string(), where: z.string().optional() }))\n`

  it('the issue repro: zodSchema fields are backticked in Swift and unescaped in Kotlin', () => {
    const swift = transform(zod, { target: 'swift', filename: 'E.tsx' })
    expect(swift.warnings).toEqual([])
    expect(swift.code).toContain('var `operator`: String = ""')
    expect(swift.code).toContain('var `where`: String? = nil')
    expect(swift.code).toContain('result.`operator` = operatorVal')
    // The JSON keys the parser reads are the ORIGINAL strings.
    expect(swift.code).toContain('input["operator"]')
    expect(swift.code).not.toContain('CodingKeys') // a keyword needs no key remap

    const kotlin = transform(zod, { target: 'kotlin', filename: 'E.tsx' })
    // `operator` / `where` are Kotlin soft keywords — legal as-is.
    expect(kotlin.code).toContain('var operator: String = ""')
    expect(kotlin.code).toContain('operator = operatorVal')
  })

  it('a hard Kotlin keyword is backticked in the declaration AND the constructor argument', () => {
    const src = `${ZOD_HEAD}export const S = zodSchema(z.object({ in: z.string(), class: z.number() }))\n`
    const kotlin = transform(src, { target: 'kotlin', filename: 'E.tsx' }).code
    expect(kotlin).toContain('var `in`: String = ""')
    expect(kotlin).toContain('`in` = inVal')
    expect(kotlin).toContain('`class` = classVal')
  })

  it('a NON-identifier zod key still round-trips its JSON key via CodingKeys', () => {
    const src = `${ZOD_HEAD}export const S = zodSchema(z.object({ 'my-key': z.string(), where: z.string() }))\n`
    const swift = transform(src, { target: 'swift', filename: 'E.tsx' }).code
    expect(swift).toContain('case myKey = "my-key"')
    expect(swift).toContain('case `where`')
  })

  it('a discriminated-union variant whose literal is a keyword becomes a backticked enum case', () => {
    const src = `${ZOD_HEAD}export const S = zodSchema(z.discriminatedUnion('kind', [\n  z.object({ kind: z.literal('class'), a: z.string() }),\n  z.object({ kind: z.literal('default'), b: z.string() }),\n]))\n`
    const swift = transform(src, { target: 'swift', filename: 'E.tsx' }).code
    expect(swift).toContain('case `class`(')
    expect(swift).toContain('return .`default`(')
  })

  it('a store field named after a keyword is `name_` on Swift (the @Observable macro rejects backticks) and backticked on Kotlin', () => {
    const src = `import { defineStore } from '@pyreon/store'\nconst useS = defineStore('s', () => {\n  const where = signal(1)\n  const total = computed(() => where() + 1)\n  const bump = () => where.set(where() + 1)\n  return { where, total, bump }\n})\nexport function App() {\n  return <Stack><Text>{useS().store.where()}</Text><Button onPress={() => useS().store.where.set(2)}>go</Button></Stack>\n}\n`
    const swift = transform(src, { target: 'swift', filename: 'S.tsx' }).code
    expect(swift).toContain('var where_: Int = 1')
    expect(swift).toContain('where_ + 1')
    expect(swift).toContain('PyreonStore_s.shared.where_')
    expect(swift).not.toContain('`where`')
    const kotlin = transform(src, { target: 'kotlin', filename: 'S.tsx' }).code
    expect(kotlin).toContain('var where by mutableStateOf')
  })

  it('<For> item parameter and key path are escaped', () => {
    const src = `type R = { id: number; class: string }\nexport function App() {\n  const xs = signal<R[]>([])\n  return <Stack><For each={xs()} by={(r) => r.class}>{(operator) => <Text>{operator.id}</Text>}</For></Stack>\n}\n`
    const swift = transform(src, { target: 'swift', filename: 'F.tsx' }).code
    expect(swift).toContain('id: \\.`class`) { `operator` in')
    const kotlin = transform(src, { target: 'kotlin', filename: 'F.tsx' }).code
    expect(kotlin).toContain('key = { it.`class` }) { operator ->')
  })

  it('a string-union value `init` is a backticked Kotlin enum entry (init/constructor open a member declaration)', () => {
    const src = `type K = 'init' | 'constructor' | 'where'\nexport function App() {\n  const k = signal<K>('init')\n  return <Text>{k()}</Text>\n}\n`
    const kotlin = transform(src, { target: 'kotlin', filename: 'U.tsx' }).code
    expect(kotlin).toContain('enum class K { `init`, `constructor`, where }')
  })
})

// ── 5. the wire format survives the backtick ────────────────────────────────

describe('reserved identifiers — Codable keeps the JSON key', () => {
  it.skipIf(!isSwiftcAvailable())(
    'a zodSchema struct with keyword fields encodes and decodes the ORIGINAL keys (real swiftc, executed)',
    () => {
      const src = `${ZOD_HEAD}export const S = zodSchema(z.object({ operator: z.string(), where: z.string(), class: z.string(), in: z.string(), 'my-key': z.string() }))\n`
      const { code } = transform(src, { target: 'swift', filename: 'W.tsx' })
      // Compile the EMITTED struct (alone — it depends on nothing but the two
      // runtime error types, supplied here) into a program that round-trips it.
      const decl = code.slice(code.indexOf('struct PyreonZodSchema_S'), code.indexOf('let S = '))
      const dir = mkdtempSync(join(tmpdir(), 'pyreon-kw-codable-'))
      const file = join(dir, 'main.swift')
      writeFileSync(
        file,
        `import Foundation
enum PyreonSchemaError: Error { case missingOrWrongType(field: String, expected: String); case constraintViolation(field: String, rule: String); case unknown }
${decl}
var s = PyreonZodSchema_S()
s.\`operator\` = "o"; s.\`where\` = "w"; s.\`class\` = "c"; s.\`in\` = "i"; s.myKey = "m"
let data = try JSONEncoder().encode(s)
let keys = (try JSONSerialization.jsonObject(with: data) as! [String: Any]).keys.sorted().joined(separator: ",")
print(keys)
let back = try JSONDecoder().decode(PyreonZodSchema_S.self, from: Data(#"{"operator":"O","where":"W","class":"C","in":"I","my-key":"M"}"#.utf8))
print(back.\`operator\`, back.\`where\`, back.\`class\`, back.\`in\`, back.myKey)
`,
      )
      const bin = join(dir, 'prog')
      execFileSync('swiftc', [file, '-o', bin], { stdio: 'pipe' })
      const out = execFileSync(bin, { encoding: 'utf8' }).trim().split('\n')
      expect(out[0]).toBe('class,in,my-key,operator,where')
      expect(out[1]).toBe('O W C I M')
    },
    120_000,
  )
})
