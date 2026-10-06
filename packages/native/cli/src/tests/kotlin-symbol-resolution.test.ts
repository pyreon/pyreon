/**
 * Every androidx symbol the Kotlin emit can produce resolves to an import in
 * the file the CLI actually writes.
 *
 * ## Why
 *
 * `conditionalKotlinImports` is a hand-kept list of predicates over emitted
 * text, and the kotlinc validate gate CANNOT check it: it concatenates its
 * stubs into one compilation unit, so a symbol resolves with or without an
 * import. Only a real `gradle assembleDebug` notices, a CI round later. That
 * is how `.clickable {`, `rememberSaveable`, `Color(` and (#3843)
 * `KeyboardType.Uri` each shipped missing an import, one symbol at a time.
 * Fixing a symbol is the SHAPE; this is the class: it needs no Android SDK.
 *
 * ## What it does
 *
 * 1. Compile a corpus to Kotlin: the compiler fixtures, every native example
 *    source, and a MATRIX derived from `@pyreon/primitives`' own prop types
 *    (every primitive x every literal-union prop value), because an example
 *    that never uses `<Field kind="url">` never exercises its import.
 * 2. Assemble each file the way `build()` does (header + conditional imports).
 * 3. Extract every capitalized identifier (and every Modifier-chain member).
 *    Each must be: declared in the corpus/runtime sources, Kotlin stdlib, or
 *    CLASSIFIED below with the package it lives in — and that package must be
 *    star-imported by the header or the symbol imported explicitly.
 *
 * TOTAL over the emit's capitalized identifiers: a symbol the emitter starts
 * producing that nobody classified FAILS here, rather than defaulting to
 * "probably fine". The registry's package claims are written from the androidx
 * public API (no SDK is available to this test); a wrong claim shows up as a
 * real-build failure, which is the thing this gate exists to make rarer.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { transform } from '@pyreon/native-compiler'
import { describe, expect, it } from 'vitest'
import { conditionalKotlinImports, importHeader } from '../build'

const REPO = join(__dirname, '../../../../..')

// ── androidx / third-party symbols, by the package they live in ───────────
const REGISTRY: Record<string, string[]> = {
  'androidx.compose.runtime': [
    'Composable', 'CompositionLocalProvider', 'DisposableEffect', 'LaunchedEffect', 'SideEffect', 'State', 'MutableState',
    'ProvidableCompositionLocal', 'Stable', 'Immutable',
  ],
  'androidx.compose.foundation.layout': [
    'Column', 'Row', 'Box', 'BoxWithConstraints', 'Spacer', 'Arrangement', 'PaddingValues', 'ColumnScope', 'RowScope', 'BoxScope', 'FlowRow', 'FlowColumn',
  ],
  'androidx.compose.foundation.lazy': ['LazyColumn', 'LazyRow'],
  'androidx.compose.foundation.text': ['KeyboardOptions', 'KeyboardActions', 'BasicTextField'],
  'androidx.compose.material': [
    'Text', 'Button', 'MaterialTheme', 'Switch', 'Icon', 'TextField', 'Card', 'Surface', 'Divider', 'CircularProgressIndicator', 'Typography',
    'OutlinedButton', 'TextButton', 'ButtonDefaults',
  ],
  'androidx.compose.ui': ['Modifier', 'Alignment'],
  'androidx.compose.ui.unit': ['Dp', 'TextUnit', 'IntOffset', 'DpOffset'],
  'androidx.compose.ui.text.input': ['ImeAction', 'KeyboardType', 'PasswordVisualTransformation', 'VisualTransformation'],
  'androidx.compose.ui.text.font': ['FontWeight', 'FontStyle'],
  'androidx.compose.ui.text.style': ['TextAlign', 'TextOverflow'],
  'androidx.compose.ui.graphics': ['Color'],
  'androidx.compose.ui.layout': ['ContentScale'],
  'androidx.compose.ui.window': ['Dialog'],
  'androidx.compose.ui.focus': ['FocusRequester'],
  'androidx.compose.ui.input.key': ['Key', 'KeyEventType'],
  'androidx.compose.ui.semantics': ['Role'],
  'androidx.compose.ui.platform': ['LocalContext', 'LocalDensity', 'LocalConfiguration', 'LocalHapticFeedback'],
  'androidx.compose.foundation': ['Image', 'BorderStroke'],
  'androidx.compose.foundation.shape': ['RoundedCornerShape'],
  'androidx.compose.animation': ['AnimatedVisibility'],
  'androidx.compose.animation.core': ['LinearEasing', 'FastOutSlowInEasing', 'FastOutLinearInEasing', 'LinearOutSlowInEasing'],
  'androidx.compose.material.icons': ['Icons'],
  'androidx.activity.result.contract': ['ActivityResultContracts'],
  'android.content.res': ['Configuration'],
  'kotlinx.serialization': ['Serializable'],
  'kotlinx.serialization.json': ['Json'],
  'kotlinx.coroutines': ['Dispatchers'],
  'coil.compose': ['AsyncImage'],
}

// Modifier-chain members (lowercase) by package. Total over any `.name(` or
// `.name {` on a line that builds a Modifier.
const MODIFIER_MEMBERS: Record<string, string[]> = {
  'androidx.compose.foundation.layout': [
    'padding', 'fillMaxWidth', 'fillMaxHeight', 'fillMaxSize', 'size', 'width', 'height', 'offset', 'weight', 'wrapContentSize',
    'widthIn', 'heightIn', 'sizeIn', 'aspectRatio',
  ],
  'androidx.compose.ui.platform': ['testTag'],
  'androidx.compose.foundation': ['background', 'border', 'clickable', 'combinedClickable', 'verticalScroll', 'horizontalScroll', 'focusable'],
  'androidx.compose.ui.draw': ['clip', 'alpha'],
  'androidx.compose.ui.semantics': ['semantics', 'clearAndSetSemantics'],
  'androidx.compose.ui.focus': ['focusRequester'],
  'androidx.compose.ui.input.key': ['onPreviewKeyEvent'],
  'androidx.compose.ui.input.pointer': ['pointerInput'],
  'androidx.compose.animation': ['animateContentSize'],
}

// Lowercase TOP-LEVEL functions (no receiver) and extension calls (`.name`) the
// emit produces outside Modifier chains. Presence-driven: if the emit contains
// one, its import must resolve. (Capitalized symbols and Modifier members are
// TOTAL; this half is a registry of the ones known to live outside the header.)
const TOP_LEVEL: Record<string, string[]> = {
  'androidx.compose.foundation': ['rememberScrollState', 'isSystemInDarkTheme'],
  'androidx.compose.ui.res': ['painterResource'],
  'androidx.activity.compose': ['rememberLauncherForActivityResult'],
  'androidx.compose.runtime.saveable': ['rememberSaveable'],
  'androidx.compose.animation.core': ['tween'],
  'androidx.compose.animation': ['fadeIn', 'fadeOut'],
  'kotlinx.coroutines': ['withContext', 'delay'],
}
const EXTENSION_CALLS: Record<string, string[]> = {
  'kotlinx.coroutines': ['launch'],
  'kotlinx.serialization': ['encodeToString'],
  'androidx.compose.ui.input.pointer': ['positionChange'],
}

/** Kotlin / JVM names visible without an import. */
const AUTO = new Set(
  `String Int Long Double Float Boolean Unit Any Nothing Char Byte Short Number Array IntArray List MutableList Map MutableMap Set MutableSet
   Pair Triple Collection Iterable Sequence Result Regex Comparator Comparable Enum Throwable Exception Error RuntimeException
   IllegalStateException IllegalArgumentException NumberFormatException StringBuilder Math System Throws Suppress OptIn JvmInline
   Volatile Synchronized Deprecated Lazy Function Runnable Thread Integer Object Class Override`.split(/\s+/),
)

// ── declarations: runtime sources + the emitted corpus itself ─────────────
function walk(dir: string, ext: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === 'build' || e === 'lib') continue
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, ext, out)
    else if (p.endsWith(ext) && !p.endsWith(`.test${ext}`)) out.push(p)
  }
  return out
}

const DECL = /\b(?:class|object|interface|typealias|fun|val|var)\s+(?:<[^>]*>\s*)?(?:[\w.<>?,\s]*\.)?([A-Za-z_]\w*)/g
function declaredNames(code: string): Set<string> {
  const out = new Set<string>()
  for (const m of code.matchAll(DECL)) out.add(m[1]!)
  return out
}

const runtimeDecls = new Set<string>()
for (const root of ['packages/native', 'packages/fundamentals', 'packages/core']) {
  for (const f of walk(join(REPO, root), '.kt')) {
    if (!/\/(?:runtime-kotlin|router-kotlin)\/|\/native\/kotlin\//.test(f)) continue
    for (const n of declaredNames(readFileSync(f, 'utf8'))) runtimeDecls.add(n)
  }
}

// ── corpus ────────────────────────────────────────────────────────────────
interface Group {
  name: string
  sources: { file: string; code: string }[]
}

function sourceGroups(): Group[] {
  const groups: Group[] = [
    {
      name: 'compiler fixtures',
      sources: walk(join(REPO, 'packages/native/compiler/src/fixtures'), '.tsx').map((file) => ({ file, code: readFileSync(file, 'utf8') })),
    },
  ]
  for (const d of readdirSync(join(REPO, 'examples')).filter((x) => x.startsWith('native-'))) {
    try {
      const files = walk(join(REPO, 'examples', d, 'src'), '.tsx')
      if (files.length) groups.push({ name: d, sources: files.map((file) => ({ file, code: readFileSync(file, 'utf8') })) })
    } catch {
      // not every native example has a src/ (the *-ios/*-android hosts)
    }
  }
  return groups
}

/** `export type X = 'a' | 'b'` (possibly multi-line) and `export type X = 0 | 1 | 'xs'`. */
function typeAliases(text: string): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const m of text.matchAll(/export type (\w+) =((?:\s*\|?\s*(?:'[^']*'|\d+))+)\s*(?:\n\n|\n\/|\n(?:export|\/\*\*))/g)) {
    out.set(m[1]!, [...m[2]!.matchAll(/'[^']*'|\d+/g)].map((x) => x[0]))
  }
  return out
}

/** Primitive x literal-prop-value matrix, derived from the primitives' own prop types. */
function primitiveMatrix(): Group {
  const dir = join(REPO, 'packages/core/primitives/src/types')
  const texts = readdirSync(dir).filter((f) => f.endsWith('.ts')).map((f) => readFileSync(join(dir, f), 'utf8'))
  const all = texts.join('\n\n')
  const aliases = typeAliases(all)
  const colorKeys = [...(/interface ColorTokens \{([^}]*)\}/.exec(all)?.[1] ?? '').matchAll(/(\w+): true/g)].map((m) => `'${m[1]}'`)
  aliases.set('ColorToken', colorKeys)

  const bodies = new Map<string, string>()
  for (const m of all.matchAll(/export (?:interface|type) (\w+?)(?:Props)?\b[^{=]*\{([\s\S]*?)\n\}/g)) bodies.set(m[1]!, m[2]!)

  const propValues = (body: string): [string, string[]][] => {
    const found: [string, string[]][] = []
    for (const m of body.matchAll(/^\s{2}(\w+)\??:\s*([^\n;]+)$/gm)) {
      const parts = m[2]!.split('|').map((x) => x.trim())
      const values: string[] = []
      for (const part of parts) {
        if (/^'[^']*'$|^\d+$/.test(part)) values.push(part)
        else if (aliases.has(part)) values.push(...aliases.get(part)!)
        else {
          values.length = 0
          break
        }
      }
      if (values.length) found.push([m[1]!, values])
    }
    return found
  }

  const shared = ['BaseLayout', 'Accessibility'].flatMap((n) => propValues(bodies.get(n) ?? ''))
  const primitives = ['Stack', 'Inline', 'Layer', 'Scroll', 'Spacer', 'Text', 'Heading', 'Image', 'Icon', 'Button', 'Press', 'Link', 'Field', 'Toggle', 'Modal', 'Transition', 'Video', 'Audio']
  const cases: string[] = []
  let n = 0
  const attrFor = (name: string, v: string) => (v.startsWith("'") ? `${name}=${v.replace(/'/g, '"')}` : `${name}={${v}}`)
  const required: Record<string, string> = {
    Image: 'src="https://x.test/a.png" alt="a"',
    Video: 'src="https://x.test/a.mp4"',
    Audio: 'src="https://x.test/a.mp3"',
    Link: 'to="/x"',
    Field: 'value="" onChangeText={() => {}}',
    Toggle: 'value={true} onChange={() => {}}',
    Modal: 'open={true} onClose={() => {}}',
    Press: 'onPress={() => {}}',
    Button: 'onPress={() => {}}',
    Transition: 'show={true}',
    Icon: 'name="check"',
  }
  for (const prim of primitives) {
    const own = propValues(bodies.get(prim) ?? '')
    for (const [prop, values] of [...own, ...shared]) {
      for (const v of values) {
        cases.push(`export function M${n++}() { return <${prim} ${required[prim] ?? ''} ${attrFor(prop, v)}>x</${prim}> }`)
      }
    }
  }
  // Behavioural prop combinations the literal matrix cannot express.
  const extra = [
    '<Field value="" onChangeText={() => {}} onSubmit={() => {}} kind="email" />',
    '<Field value="" onChangeText={() => {}} kind={dyn()} />',
    '<Field value="" onChangeText={() => {}} kind="password" placeholder="p" disabled />',
    '<Press onPress={() => {}} onLongPress={() => {}}><Text>x</Text></Press>',
    '<Text truncate size="lg" weight="bold" color="primary">x</Text>',
    '<Icon name="check" color="primary" />',
    // Inline `style` lowers through style-to-native: typography, box, border, opacity.
    ...['left', 'center', 'right'].map((a) => `<Text style={{ textAlign: '${a}', fontSize: 14, fontStyle: 'italic', fontWeight: 600, color: '#336699' }}>x</Text>`),
    '<Stack style={{ backgroundColor: "#eee", borderRadius: 8, borderWidth: 1, borderColor: "#333", opacity: 0.5, padding: 8 }}><Text>x</Text></Stack>',
  ]
  extra.forEach((x, i) => cases.push(`export function X${i}() { return ${x} }`))
  const header = `import { signal } from '@pyreon/reactivity'\nimport { ${primitives.join(', ')} } from '@pyreon/primitives'\nconst dyn = signal<'text' | 'url'>('url')\n`
  // One source per case, so a transform failure/bail isolates to one.
  return { name: 'primitive prop matrix', sources: cases.map((c, i) => ({ file: `matrix-${i}.tsx`, code: `${header}${c}\n` })) }
}

// ── analysis ──────────────────────────────────────────────────────────────
/**
 * Drop comments and string LITERAL text but keep code inside `${…}`
 * interpolations: `"${i18n.t("k", mapOf("n" to "x"))}"` has nested quotes, and
 * a regex that ends the string at the first inner quote leaves literal words
 * ("Vit") looking like symbols, while dropping the whole string would hide a
 * symbol referenced inside an interpolation.
 */
function stripLiteralsAndComments(code: string): string {
  let out = ''
  let i = 0
  const scanString = (): void => {
    i++ // opening quote
    while (i < code.length && code[i] !== '"') {
      if (code[i] === '\\') i += 2
      else if (code[i] === '$' && code[i + 1] === '{') {
        i += 2
        let depth = 1
        out += ' '
        while (i < code.length && depth > 0) {
          const c = code[i]!
          if (c === '"') scanString()
          else {
            if (c === '{') depth++
            else if (c === '}') depth--
            if (depth > 0) out += c
            i++
          }
        }
        out += ' '
      } else i++
    }
    i++ // closing quote
  }
  while (i < code.length) {
    const c = code[i]!
    if (c === '/' && code[i + 1] === '/') while (i < code.length && code[i] !== '\n') i++
    else if (c === '/' && code[i + 1] === '*') {
      i += 2
      while (i < code.length && !(code[i] === '*' && code[i + 1] === '/')) i++
      i += 2
    } else if (c === '"') {
      out += '""'
      scanString()
    } else if (c === "'" && code[i + 2] === "'") {
      out += "''"
      i += 3
    } else {
      out += c
      i++
    }
  }
  return out
}

interface Finding {
  where: string
  symbol: string
  problem: string
}

function covers(header: string, pkg: string, symbol: string): boolean {
  const stars = [...header.matchAll(/^import ([\w.]+)\.\*$/gm)].map((m) => m[1]!)
  if (stars.includes(pkg)) return true
  return new RegExp(`^import ${pkg.replace(/\./g, '\\.')}\\.${symbol}$`, 'm').test(header)
}

function analyse(group: Group): { findings: Finding[]; compiled: number; symbols: Set<string> } {
  const findings: Finding[] = []
  const symbols = new Set<string>()
  const emitted: { file: string; code: string }[] = []
  for (const s of group.sources) {
    try {
      emitted.push({ file: s.file, code: transform(s.code, { target: 'kotlin', filename: s.file }).code })
    } catch {
      // A source the compiler rejects emits nothing; nothing to resolve.
    }
  }
  const declared = new Set<string>()
  for (const e of emitted) for (const n of declaredNames(e.code)) declared.add(n)
  // `useNativeModule('Name')` names an APP-provided Kotlin class, not an androidx one.
  for (const s of group.sources) for (const m of s.code.matchAll(/useNativeModule[\s\S]{0,200}?\(\s*'(\w+)'\s*\)/g)) declared.add(m[1]!)

  const byName = new Map<string, string>()
  for (const [pkg, names] of Object.entries(REGISTRY)) for (const n of names) byName.set(n, pkg)
  const modByName = new Map<string, string>()
  for (const [pkg, names] of Object.entries(MODIFIER_MEMBERS)) for (const n of names) modByName.set(n, pkg)

  const topByName = new Map<string, string>()
  for (const [pkg, names] of Object.entries(TOP_LEVEL)) for (const n of names) topByName.set(n, pkg)
  const extByName = new Map<string, string>()
  for (const [pkg, names] of Object.entries(EXTENSION_CALLS)) for (const n of names) extByName.set(n, pkg)

  for (const e of emitted) {
    const header = importHeader('kotlin') + conditionalKotlinImports(e.code)
    const code = stripLiteralsAndComments(e.code)
    const here = `${group.name}: ${e.file.split('/').slice(-2).join('/')}`

    for (const m of code.matchAll(/(?<![.\w])([A-Z][A-Za-z0-9_]*)\b/g)) {
      const sym = m[1]!
      if (sym.length === 1 || /^[A-Z0-9_]+$/.test(sym) || AUTO.has(sym) || declared.has(sym) || runtimeDecls.has(sym)) continue
      const pkg = byName.get(sym)
      if (!pkg) {
        findings.push({ where: here, symbol: sym, problem: 'unclassified — declare it, or add it to REGISTRY with the package it lives in' })
        continue
      }
      symbols.add(sym)
      if (!covers(header, pkg, sym)) findings.push({ where: here, symbol: sym, problem: `needs an import from ${pkg}` })
    }

    for (const m of code.matchAll(/(?<![.\w])([a-z]\w*)\s*[({]/g)) {
      const pkg = topByName.get(m[1]!)
      if (!pkg || declared.has(m[1]!)) continue
      symbols.add(m[1]!)
      if (!covers(header, pkg, m[1]!)) findings.push({ where: here, symbol: m[1]!, problem: `needs an import from ${pkg}` })
    }
    for (const m of code.matchAll(/\.([a-z]\w*)\s*[({]/g)) {
      const pkg = extByName.get(m[1]!)
      if (!pkg) continue
      symbols.add(`.${m[1]}`)
      if (!covers(header, pkg, m[1]!)) findings.push({ where: here, symbol: `.${m[1]}`, problem: `needs an import from ${pkg}` })
    }

    for (const line of code.split('\n')) {
      if (!/\bModifier\b/.test(line) && !/^\s*\./.test(line)) continue
      for (const m of line.matchAll(/\.([a-z]\w*)\s*[({]/g)) {
        const mem = m[1]!
        const pkg = modByName.get(mem)
        if (!pkg) continue
        symbols.add(`.${mem}`)
        if (!covers(header, pkg, mem)) findings.push({ where: here, symbol: `.${mem}`, problem: `needs an import from ${pkg}` })
      }
    }
  }
  return { findings, compiled: emitted.length, symbols }
}

describe('Kotlin emit — every androidx symbol resolves to an import', () => {
  const groups = [...sourceGroups(), primitiveMatrix()]

  it('builds a real corpus (a vacuous corpus would pass everything)', () => {
    const matrix = groups[groups.length - 1]!
    expect(groups.length).toBeGreaterThan(5)
    expect(matrix.sources.length).toBeGreaterThan(60)
    // The matrix must reach the shape that motivated this (#3843).
    expect(matrix.sources.some((s) => s.code.includes('kind="url"'))).toBe(true)
  })

  it('the corpus exercises the symbols this gate exists to guard', () => {
    const seen = new Set<string>()
    for (const g of groups) for (const s of analyse(g).symbols) seen.add(s)
    for (const must of ['KeyboardType', 'KeyboardOptions', 'ImeAction', 'Color', 'FontWeight', 'TextAlign', '.clickable', 'ContentScale', 'RoundedCornerShape']) {
      expect(seen, `corpus never produced ${must}`).toContain(must)
    }
  })

  for (const group of groups) {
    it(`${group.name}`, () => {
      const { findings, compiled } = analyse(group)
      expect(compiled).toBeGreaterThan(0)
      const text = [...new Map(findings.map((f) => [`${f.symbol}|${f.problem}`, `${f.symbol}: ${f.problem} (e.g. ${f.where})`])).values()]
      expect(text).toEqual([])
    })
  }
})
