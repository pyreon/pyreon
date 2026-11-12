// Keeps the "a string from the source became code in the emitted Swift/Kotlin"
// class closed.
//
// Every string literal an emitter writes goes through ONE quoting path:
// `swiftStr` / `kotlinStr` (`../string-literals.ts`, exported to plugins via
// `@pyreon/native-compiler/plugin-api`, and as `ctx.stringLiteral`).
// `JSON.stringify` is NOT a target quoter: it leaves Kotlin's `$` / `${…}`
// string templates live, and a Swift raw string (`#"…"#`) still interpolates
// `\#(…)`. Both shapes shipped in plugin emitters and let text from a shared
// .tsx file (or an OpenAPI spec lathe generated it from) run as native code.
//
// This scan fails on any NEW `JSON.stringify(` in an emitter source that is
// not listed below with the reason it never reaches emitted code as a string
// literal. If you are here because it failed: quote with `swiftStr` /
// `kotlinStr` / `ctx.stringLiteral` instead, or — if the value really is JSON
// data, a structural key or diagnostic text — add it to ALLOWED with why.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const PACKAGES = join(import.meta.dirname, '../../../..')

/** Every emitter source: each package's `src/native-plugin/**` plus the native compiler's own `src/**`. */
function emitterSources(): string[] {
  const out: string[] = []
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) {
        if (name === 'tests' || name === '__tests__' || name === 'fixtures' || name === 'node_modules') continue
        walk(p)
      } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !name.endsWith('.d.ts')) out.push(p)
    }
  }
  for (const layer of readdirSync(PACKAGES)) {
    const layerDir = join(PACKAGES, layer)
    if (!statSync(layerDir).isDirectory()) continue
    for (const pkg of readdirSync(layerDir)) {
      const plugin = join(layerDir, pkg, 'src', 'native-plugin')
      try {
        if (statSync(plugin).isDirectory()) walk(plugin)
      } catch {
        // no native plugin in this package
      }
    }
  }
  walk(join(PACKAGES, 'native', 'compiler', 'src'))
  return out
}

/** A bare `JSON.stringify(` call (not `PyreonJSON.stringify(`), outside a line comment. */
const CALL = /(?<![\w.])JSON\.stringify\(/

const DIAGNOSTIC = 'diagnostic text — quotes a value inside a warning message, never emitted code'
const STRUCTURAL = 'structural key / deep-equality over IR — never emitted'
const JSON_DATA = 'JSON DATA that is itself quoted by the target quoter at emit'

/** file (relative to packages/) → [a substring of the allowed line, why it is not an emitted literal]. */
const ALLOWED: Record<string, readonly (readonly [string, string])[]> = {
  'native/compiler/src/string-literals.ts': [
    ['if (typeof v !== \'string\') return JSON.stringify(v)', 'the quoters themselves: a number / boolean / null literal is spelled the same in JSON, Swift and Kotlin'],
  ],
  'native/compiler/src/expr-utils.ts': [
    ['pushStatic(output, JSON.stringify(v))', `${JSON_DATA} (buildJsonLiteralParts builds the JSON text a hosted page reads)`],
    ['pushStatic(output, `${JSON.stringify(e.fields[i]!.name)}:`)', `${JSON_DATA} (an object key inside that JSON text)`],
    ['const key = JSON.stringify(', STRUCTURAL],
  ],
  'native/compiler/src/registry-lookup.ts': [
    ['persists under the key ${JSON.stringify(key)}', DIAGNOSTIC],
    ['const key = JSON.stringify([d.plugin, d.type])', STRUCTURAL],
  ],
  'native/compiler/src/optional-narrowing.ts': [
    ['const key = JSON.stringify(n.subject)', STRUCTURAL],
    ['if (JSON.stringify(unparen(x)) === key)', STRUCTURAL],
  ],
  'native/compiler/src/emit-swift.ts': [
    ['const before = JSON.stringify(cur)', STRUCTURAL],
    ['if (JSON.stringify(cur) === before)', STRUCTURAL],
  ],
  'native/compiler/src/emit-kotlin.ts': [
    ['.test(JSON.stringify(stmts))', STRUCTURAL],
    ['const hasReturn = JSON.stringify(e.stmts)', STRUCTURAL],
  ],
  'native/compiler/src/infer-type.ts': [
    ['JSON.stringify(elemType) !== JSON.stringify(t)', STRUCTURAL],
    ['const first = JSON.stringify(types[0])', STRUCTURAL],
    ['types.every((t) => JSON.stringify(t) === first)', STRUCTURAL],
  ],
  'native/compiler/src/parse.ts': [
    ['return JSON.stringify(t.fields)', STRUCTURAL],
    ['a second tab named ${JSON.stringify(name)}', DIAGNOSTIC],
  ],
  'native/compiler/src/render-slots.ts': [['return JSON.stringify([...fields].sort(', STRUCTURAL]],
  'native/compiler/src/validate-cache.ts': [
    ['JSON.stringify(verdict)', 'the on-disk verdict cache file, not emitted code'],
    ['JSON.stringify(value)', 'the on-disk probe cache file, not emitted code'],
  ],
  'native/compiler/src/ts-enum-desugar.ts': [['raw: JSON.stringify(value)', 'the `raw` of a synthesized JS ESTree Literal, read back as JS, not emitted'],],
  'native/compiler/src/date-field-shape.ts': [['${name}=${JSON.stringify(stat)}>', DIAGNOSTIC]],
  'native/compiler/src/intl-options.ts': [['${key}: ${JSON.stringify(v.value)}', DIAGNOSTIC]],
  'native/compiler/src/jsx-slot-attrs.ts': [['`the literal ${JSON.stringify(v.value)}`', DIAGNOSTIC]],
  'native/compiler/src/plugin-scope.ts': [['ctx.deferred key ${JSON.stringify(key)}', DIAGNOSTIC]],
  'native/compiler/src/navigation-lowering.ts': [
    ['<Tab value=${JSON.stringify(', DIAGNOSTIC],
    ['<Tab icon=${JSON.stringify(iconName)}>', DIAGNOSTIC],
    ['.map((n) => JSON.stringify(n))', DIAGNOSTIC],
    ['tab ${JSON.stringify(tab.name)} has root ${JSON.stringify(tab.root)}', DIAGNOSTIC],
  ],
  'native/compiler/src/parse-theme.ts': [['skipped key ${JSON.stringify(name)}', DIAGNOSTIC]],
  'native/compiler/src/request-headers.ts': [
    ['method ${JSON.stringify(method)} is not one', DIAGNOSTIC],
    ['(\\`JSON.stringify(value)\\`)', DIAGNOSTIC],
  ],
  'native/compiler/src/verbatim-call-warning.ts': [['`JSON.stringify(x)` and a typed', DIAGNOSTIC]],
  'ui-system/rocketstyle/src/native-plugin/parse-rocketstyle.ts': [
    ['value ${JSON.stringify(valueName)} — it becomes', DIAGNOSTIC],
    ['property ${JSON.stringify(propName)} — not a CSS', DIAGNOSTIC],
  ],
  'fundamentals/dnd/src/native-plugin/drag-drop.ts': [['JSON.stringify(source) !== JSON.stringify(type)', STRUCTURAL]],
  'fundamentals/flow/src/native-plugin/lowering.ts': [['return [JSON.stringify(type), type]', STRUCTURAL]],
  'fundamentals/flow/src/native-plugin/webview-host.generated.ts': [
    ['DEFAULT_FLOW_WEBVIEW_HOST_HTML = ', 'the hosted page\'s own JavaScript inside a generated HTML string, quoted by the target quoter at emit'],
  ],
  'fundamentals/form/src/native-plugin/emit.ts': [['JSON.stringify(callback.body).includes(', STRUCTURAL]],
  'fundamentals/hooks/src/native-plugin/stateful-emit.ts': [['JSON.stringify(payload.fn.body).includes(', STRUCTURAL]],
  'fundamentals/hooks/src/native-plugin/stateful-recognize.ts': [['JSON.stringify(body).includes(', STRUCTURAL]],
  'fundamentals/http/src/native-plugin/endpoint.ts': [
    ["typeof item === 'object' ? JSON.stringify(item)", `${JSON_DATA} (a query-param value, held as a literal IR string)`],
    ["typeof lit.value === 'object' ? JSON.stringify(lit.value)", `${JSON_DATA} (a query-param value, held as a literal IR string)`],
    ['body = JSON.stringify(literal.value)', `${JSON_DATA} (the request body the web's \`json:\` option sends)`],
  ],
  'fundamentals/url-state/src/native-plugin/plugin.ts': [
    ['useUrlState(${JSON.stringify(key)}, …)', DIAGNOSTIC],
    ['useUrlState(${JSON.stringify(key)}, …, options)', DIAGNOSTIC],
  ],
}

function scan(): { unlisted: string[]; unused: string[] } {
  const used = new Set<string>()
  const unlisted: string[] = []
  for (const file of emitterSources()) {
    const rel = relative(PACKAGES, file).split('\\').join('/')
    const lines = readFileSync(file, 'utf8').split('\n')
    lines.forEach((line, i) => {
      const t = line.trimStart()
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return
      if (!CALL.test(line)) return
      const hit = (ALLOWED[rel] ?? []).find(([needle]) => line.includes(needle))
      if (hit) used.add(`${rel}::${hit[0]}`)
      else unlisted.push(`${rel}:${i + 1}: ${t.slice(0, 160)}`)
    })
  }
  const unused = Object.entries(ALLOWED).flatMap(([rel, entries]) =>
    entries.filter(([needle]) => !used.has(`${rel}::${needle}`)).map(([needle]) => `${rel} :: ${needle}`),
  )
  return { unlisted, unused }
}

describe('emitter sources quote every Swift/Kotlin string literal through swiftStr / kotlinStr', () => {
  const { unlisted, unused } = scan()

  it('scans the plugin emitters, not an empty set', () => {
    const files = emitterSources().map((f) => relative(PACKAGES, f))
    expect(files.some((f) => f.includes('validation/src/native-plugin/swift.ts'))).toBe(true)
    expect(files.some((f) => f.includes('flow/src/native-plugin/kotlin-hosts.ts'))).toBe(true)
    expect(files.some((f) => f.includes('native/compiler/src/emit-kotlin.ts'))).toBe(true)
  })

  it('no JSON.stringify builds emitted source outside the allow-list', () => {
    expect(unlisted).toEqual([])
  })

  it('every allow-list entry still matches a line (no stale exemptions)', () => {
    expect(unused).toEqual([])
  })

  it('no emitter writes a Swift raw string `#"…"#` (it interpolates `\\#(…)`)', () => {
    const raw: string[] = []
    for (const file of emitterSources()) {
      const rel = relative(PACKAGES, file).split('\\').join('/')
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          const t = line.trimStart()
          if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return
          // `#"${` — a raw string whose body is spliced from a value.
          if (line.includes('#"${')) raw.push(`${rel}:${i + 1}: ${t.slice(0, 160)}`)
        })
    }
    expect(raw).toEqual([])
  })
})
