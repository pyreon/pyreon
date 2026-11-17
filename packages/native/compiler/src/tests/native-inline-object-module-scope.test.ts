// An inline object type OUTSIDE every component must become ONE named Codable struct / @Serializable data class on both
// targets, named after the binding that owns it — never a Swift labelled tuple or a Kotlin `Any`.
//
// Before: a module-scope `signal<{ x: number; y: number }>` was `var pt: (x: Int, y: Int) = __Obj0(x: 1, y: 2)` on
// Swift (a tuple annotation over a struct value, and not Codable) with NO warning, and `mutableStateOf<Any>` on Kotlin
// (every field read fails). A module `JSON.parse(raw) as { … }` decoded into a tuple on Swift (`(host: String, port:
// Int).self` is not Decodable) and into `Any` on Kotlin. A helper's `(p: { … })` parameter and `: { … }` return, a
// helper-body local, `Array<{ … }>` and nested shapes all failed the same way. Inside a component the emitters
// synthesize a struct named after the component; at module scope there was no name to give it.
//
// module-inline-object-types.ts now lifts every module-scope position into a declared struct at parse time, once, so
// both targets read the same name. Alongside: `const x: T = JSON.parse(s)` at module scope (and as a component const)
// decodes into `T` — it emitted `""` with no warning — and a module `computed` returning an object literal is typed
// as the literal's struct instead of `Any`.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'

const HEADER = `import { Stack, Text } from '@pyreon/primitives'
import { signal, computed } from '@pyreon/reactivity'
`

const file = (module: string, jsx: string): string =>
  `${HEADER}${module}\nexport function Page() {\n  return <Stack><Text>${jsx}</Text></Stack>\n}`

interface Site {
  src: string
  swift: string[]
  kotlin: string[]
}

const SITES: Record<string, Site> = {
  'const over an object literal (multi-field)': {
    src: file(
      `const config: { host: string; port: number } = { host: 'a', port: 1 }`,
      '{config.host}',
    ),
    swift: [
      'struct ConfigType: Codable {',
      'private let config: ConfigType = ConfigType(host: "a", port: 1)',
    ],
    kotlin: [
      'data class ConfigType(var host: String, var port: Long)',
      'private val config: ConfigType = ConfigType(',
    ],
  },
  'const over an object literal (one field)': {
    src: file(`const config: { host: string } = { host: 'a' }`, '{config.host}'),
    swift: [
      'struct ConfigType: Codable {\n  var host: String',
      'private let config: ConfigType = ConfigType(host: "a")',
    ],
    kotlin: [
      'data class ConfigType(var host: String)',
      'private val config: ConfigType = ConfigType(host = "a")',
    ],
  },
  '`let` binding': {
    src: file(
      `let config: { host: string; port: number } = { host: 'a', port: 1 }`,
      '{config.host}',
    ),
    swift: ['struct ConfigType: Codable {', 'private var config: ConfigType = ConfigType('],
    kotlin: ['data class ConfigType(', 'private var config: ConfigType = ConfigType('],
  },
  '`const x: { … } = JSON.parse(raw)` (was `= ""`, no warning)': {
    src: file(
      `const raw = '{"host":"a","port":1}'\nconst config: { host: string; port: number } = JSON.parse(raw)`,
      '{config.host}',
    ),
    swift: [
      'struct ConfigType: Codable {',
      'private let config: ConfigType = (try! PyreonJSON.parse(ConfigType.self, raw))',
    ],
    kotlin: [
      'data class ConfigType(',
      'private val config: ConfigType = PyreonJson.parse<ConfigType>(raw)',
    ],
  },
  '`JSON.parse(raw) as { … }`': {
    src: file(
      `const raw = '{"host":"a","port":1}'\nconst config = JSON.parse(raw) as { host: string; port: number }`,
      '{config.host}',
    ),
    swift: ['struct ConfigType: Codable {', 'PyreonJSON.parse(ConfigType.self, raw)'],
    kotlin: ['data class ConfigType(', 'PyreonJson.parse<ConfigType>(raw)'],
  },
  'signal<{ ok }> (one field)': {
    src: file(`const flag = signal<{ ok: boolean }>({ ok: true })`, `{flag().ok ? 'y' : 'n'}`),
    swift: ['struct FlagType: Codable {', 'var flag: FlagType = FlagType(ok: true)'],
    kotlin: [
      'data class FlagType(var ok: Boolean)',
      'var flag by mutableStateOf<FlagType>(FlagType(ok = true))',
    ],
  },
  'signal<{ x; y }> (was a silent Swift tuple)': {
    src: file(`const pt = signal<{ x: number; y: number }>({ x: 1, y: 2 })`, '{pt().x}'),
    swift: ['struct PtType: Codable {', 'var pt: PtType = PtType(x: 1, y: 2)'],
    kotlin: [
      'data class PtType(var x: Long, var y: Long)',
      'var pt by mutableStateOf<PtType>(PtType(x = 1L, y = 2L))',
    ],
  },
  'signal<{ … } | null>(null)': {
    src: file(
      `const user = signal<{ id: string; name: string } | null>(null)`,
      `{user()?.name ?? ''}`,
    ),
    swift: ['struct UserType: Codable {', 'var user: UserType? = nil'],
    kotlin: [
      'data class UserType(var id: String, var name: String)',
      'var user by mutableStateOf<UserType?>(null)',
    ],
  },
  'signal<{ … }[]>([])': {
    src: file(`const items = signal<{ id: string; done: boolean }[]>([])`, '{items().length}'),
    swift: ['struct ItemsType: Codable {', 'var items: [ItemsType] = []'],
    kotlin: [
      'data class ItemsType(var id: String, var done: Boolean)',
      'mutableStateOf<List<ItemsType>>(',
    ],
  },
  'signal({ x, y }) with no type argument': {
    src: file(`const pt = signal({ x: 1, y: 2 })`, '{pt().x}'),
    swift: ['struct PtType: Codable {', 'var pt: PtType = PtType(x: 1, y: 2)'],
    kotlin: ['data class PtType(', 'mutableStateOf<PtType>(PtType(x = 1L, y = 2L))'],
  },
  'Readonly<{ … }>': {
    src: file(`const pt: Readonly<{ x: number; y: number }> = { x: 1, y: 2 }`, '{pt.x}'),
    swift: ['struct PtType: Codable {', 'private let pt: PtType = PtType(x: 1, y: 2)'],
    kotlin: ['data class PtType(', 'private val pt: PtType = PtType(x = 1L, y = 2L)'],
  },
  'nested inline objects': {
    src: file(
      `const pt = signal<{ a: { b: number; c: string }; d: boolean }>({ a: { b: 1, c: 'x' }, d: true })`,
      '{pt().a.c}',
    ),
    swift: [
      'struct PtTypeA: Codable {',
      'struct PtType: Codable {\n  var a: PtTypeA',
      'PtType(a: PtTypeA(b: 1, c: "x"), d: true)',
    ],
    kotlin: [
      'data class PtTypeA(var b: Long, var c: String)',
      'data class PtType(var a: PtTypeA, var d: Boolean)',
    ],
  },
  '`{ … }[]` array annotation': {
    src: file(`const rows: { id: string; n: number }[] = [{ id: 'a', n: 1 }]`, '{rows.length}'),
    swift: [
      'struct RowsType: Codable {',
      'private let rows: [RowsType] = [RowsType(id: "a", n: 1)]',
    ],
    kotlin: [
      'data class RowsType(',
      'private val rows: List<RowsType> = listOf(RowsType(id = "a", n = 1L))',
    ],
  },
  '`Array<{ … }>` annotation (was a tuple array / `List<Any>`)': {
    src: file(
      `const rows: Array<{ id: string; n: number }> = [{ id: 'a', n: 1 }]`,
      '{rows.length}',
    ),
    swift: [
      'struct RowsType: Codable {',
      'private let rows: [RowsType] = [RowsType(id: "a", n: 1)]',
    ],
    kotlin: ['data class RowsType(', 'private val rows: List<RowsType> = listOf(RowsType('],
  },
  'helper function parameter': {
    src: file(
      'function fmt(p: { x: number; y: number }): string { return `${p.x},${p.y}` }',
      '{fmt({ x: 1, y: 2 })}',
    ),
    swift: [
      'struct FmtPType: Codable {',
      'func fmt(_ p: FmtPType) -> String',
      'fmt(FmtPType(x: 1, y: 2))',
    ],
    kotlin: [
      'data class FmtPType(',
      'fun fmt(p: FmtPType): String',
      'fmt(FmtPType(x = 1L, y = 2L))',
    ],
  },
  'arrow-const helper parameter': {
    src: file(
      'const fmt = (p: { x: number; y: number }): string => `${p.x}`',
      '{fmt({ x: 1, y: 2 })}',
    ),
    swift: ['struct FmtPType: Codable {', 'func fmt(_ p: FmtPType) -> String'],
    kotlin: ['data class FmtPType(', 'fun fmt(p: FmtPType): String'],
  },
  'helper return annotation (was a Swift tuple, a Kotlin warning)': {
    src: file('function mk(): { x: number; y: number } { return { x: 1, y: 2 } }', '{mk().x}'),
    swift: ['struct MkResult: Codable {', 'func mk() -> MkResult { MkResult(x: 1, y: 2) }'],
    kotlin: [
      'data class MkResult(var x: Long, var y: Long)',
      'fun mk(): MkResult = MkResult(x = 1L, y = 2L)',
    ],
  },
  'a helper-body local annotation': {
    src: file(
      'function count(n: number): number { const xs: { ok: boolean }[] = []; xs.push({ ok: n > 0 }); return xs.length }',
      '{count(1)}',
    ),
    swift: ['struct CountXsType: Codable {', 'var xs: [CountXsType] = []'],
    kotlin: [
      'data class CountXsType(var ok: Boolean)',
      'val xs: MutableList<CountXsType> = mutableListOf()',
    ],
  },
  'a helper-body `JSON.parse(…) as { … }`': {
    src: file(
      'function host(raw: string): string { try { const v = JSON.parse(raw) as { host: string }; return v.host } catch { return "" } }',
      `{host('{}')}`,
    ),
    swift: ['struct HostVType: Codable {', 'PyreonJSON.parse(HostVType.self, raw)'],
    kotlin: ['data class HostVType(var host: String)', 'PyreonJson.parse<HostVType>(raw)'],
  },
  'module computed over an object literal (was `Any`)': {
    src: file(`const base = signal(1)\nconst c = computed(() => ({ v: base(), w: 2 }))`, '{c().v}'),
    swift: ['var c: __Obj0 { (__Obj0('],
    kotlin: ['val c get() = (__Obj0('],
  },
}

const INLINE_WARNING = 'inline object type'

describe('module-scope inline object types become named structs', () => {
  for (const [name, site] of Object.entries(SITES)) {
    describe(name, () => {
      it('Swift: a named Codable struct, never a tuple or `Any`', () => {
        const r = transform(site.src, { target: 'swift' })
        expect(r.warnings.filter((w) => w.includes(INLINE_WARNING))).toEqual([])
        for (const s of site.swift) expect(r.code).toContain(s)
        // A labelled-tuple TYPE (`: (x: Int, …)` / `[(…)]` / `(…).self`) and an `Any`-typed binding are both gone.
        expect(r.code).not.toMatch(
          /:\s*\[?\((?:\w+): |\((?:\w+): [^)]*\)\.self|var \w+: Any\b|let \w+: Any\b/,
        )
      })
      it('Kotlin: a named data class, never `Any`', () => {
        const r = transform(site.src, { target: 'kotlin' })
        expect(r.warnings.filter((w) => w.includes(INLINE_WARNING))).toEqual([])
        for (const s of site.kotlin) expect(r.code).toContain(s)
        expect(r.code).not.toMatch(/<Any\??>|: Any\b|List<Any>/)
      })
      it.runIf(isSwiftcAvailable())('Swift typechecks', () => {
        const v = validateSwiftWithStubs(transform(site.src, { target: 'swift' }).code)
        expect(v.ok, v.error).toBe(true)
      })
      it.runIf(isKotlincAvailable())('Kotlin compiles', () => {
        const v = validateKotlin(transform(site.src, { target: 'kotlin' }).code)
        expect(v.ok, v.error).toBe(true)
      })
    })
  }
})

describe('naming', () => {
  const SRC = file(
    [
      'interface ConfigType { a: string }',
      'interface Point { x: number; y: number }',
      `const config: { host: string } = { host: 'a' }`,
      `const other: { host: string } = { host: 'b' }`,
      'const p: { x: number; y: number } = { x: 1, y: 2 }',
      'const q = signal<{ x: number; y: number }>({ x: 3, y: 4 })',
    ].join('\n'),
    '{config.host}{other.host}{p.x}{q().y}',
  )

  it.each(['swift', 'kotlin'] as const)(
    'a taken name gets a suffix, one shape is one type, and a declared shape is reused on %s',
    (target) => {
      const r = transform(SRC, { target })
      const decl =
        target === 'swift'
          ? (n: string) => `struct ${n}: Codable {`
          : (n: string) => `data class ${n}(`
      // `ConfigType` is the user's interface, so the lifted shape is `ConfigType2` — not a silent retype as the user's.
      expect(r.code).toContain(decl('ConfigType2'))
      // `other` has the same shape as `config`: the same type, not a second one.
      expect(r.code).not.toContain(decl('OtherType'))
      expect(r.code).toMatch(
        target === 'swift'
          ? /let other: ConfigType2 = ConfigType2\(/
          : /val other: ConfigType2 = ConfigType2\(/,
      )
      // `{ x; y }` IS the declared `Point`.
      expect(r.code).not.toContain(decl('PType'))
      expect(r.code).not.toContain(decl('QType'))
      expect(r.code).toMatch(
        target === 'swift' ? /let p: Point = Point\(/ : /val p: Point = Point\(/,
      )
      expect(r.code).toMatch(
        target === 'swift' ? /var q: Point = Point\(/ : /mutableStateOf<Point>\(Point\(/,
      )
    },
  )

  it.runIf(isSwiftcAvailable())('Swift typechecks', () => {
    const v = validateSwiftWithStubs(transform(SRC, { target: 'swift' }).code)
    expect(v.ok, v.error).toBe(true)
  })
  it.runIf(isKotlincAvailable())('Kotlin compiles', () => {
    const v = validateKotlin(transform(SRC, { target: 'kotlin' }).code)
    expect(v.ok, v.error).toBe(true)
  })

  it('a fractional initializer widens the lifted field to Double on both targets', () => {
    const src = file('const pt: { x: number; y: number } = { x: 1.5, y: 2 }', '{pt.x}')
    expect(transform(src, { target: 'swift' }).code).toContain(
      'struct PtType: Codable {\n  var x: Double\n  var y: Int',
    )
    expect(transform(src, { target: 'kotlin' }).code).toContain(
      'data class PtType(var x: Double, var y: Long)',
    )
  })
})

describe('module-scope `JSON.parse` with no type', () => {
  it.each(['swift', 'kotlin'] as const)(
    'is named by a warning on %s (it emitted `""` silently)',
    (target) => {
      const r = transform(file(`const raw = '{}'\nconst bad = JSON.parse(raw)`, 'x'), { target })
      expect(
        r.warnings.some((w) => w.includes('`JSON.parse(…)` has no type to decode into natively')),
      ).toBe(true)
    },
  )
})

// The decode itself, executed: a tuple is not `Decodable`, so this is the shape where "the right fields" was not enough.
// Swift runs the emitted struct through the real `JSONDecoder` / `JSONEncoder`. (Kotlin's `@Serializable` needs the
// serialization compiler plugin, which the headless kotlinc run does not load; its compile above is the Kotlin proof.)
describe('the lifted struct decodes and re-encodes (executed)', () => {
  const SRC = file(
    `const raw = '{"host":"a","port":8080,"tls":{"on":true}}'\nconst config = JSON.parse(raw) as { host: string; port: number; tls: { on: boolean } }`,
    '{config.host}',
  )

  function structDecl(code: string, name: string): string {
    const lines = code.split('\n')
    const start = lines.findIndex((l) => l.startsWith(`struct ${name}: Codable {`))
    if (start < 0) throw new Error(`struct ${name} not in emit`)
    const end = lines.findIndex((l, i) => i > start && l === '}')

    return lines.slice(start, end + 1).join('\n')
  }

  it.runIf(isSwiftcAvailable())('Swift: JSONDecoder round-trip through `ConfigType`', () => {
    const code = transform(SRC, { target: 'swift' }).code
    expect(code).toContain('PyreonJSON.parse(ConfigType.self, raw)')
    const decls = [structDecl(code, 'ConfigTypeTls'), structDecl(code, 'ConfigType')].join('\n\n')
    const dir = mkdtempSync(join(tmpdir(), 'pyreon-module-inline-'))
    const main = join(dir, 'main.swift')
    const bin = join(dir, 'prog')
    writeFileSync(
      main,
      `import Foundation\n${decls}\n` +
        'let c = try! JSONDecoder().decode(ConfigType.self, from: Data(#"{"host":"a","port":8080,"tls":{"on":true}}"#.utf8))\n' +
        'let back = try! JSONDecoder().decode(ConfigType.self, from: try! JSONEncoder().encode(c))\n' +
        'print("\\(back.host) \\(back.port) \\(back.tls.on)")\n',
    )
    execFileSync('swiftc', [main, '-o', bin], { stdio: 'pipe' })
    expect(execFileSync(bin, { encoding: 'utf8' }).trim()).toBe('a 8080 true')
  })

  it('Kotlin: both classes are @Serializable', () => {
    const code = transform(SRC, { target: 'kotlin' }).code
    expect(code).toContain('@Serializable\ndata class ConfigTypeTls(var on: Boolean)')
    expect(code).toContain(
      '@Serializable\ndata class ConfigType(var host: String, var port: Long, var tls: ConfigTypeTls)',
    )
    expect(code).toContain('PyreonJson.parse<ConfigType>(raw)')
  })
})
