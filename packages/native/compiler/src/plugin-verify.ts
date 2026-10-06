import type { CompilerPlugin } from './plugin'

export interface PluginSources {
  /** Text of every `.swift` file the plugin's runtime half ships. */
  readonly swiftSources: readonly string[]
  /** Text of every `.kt` file the plugin's runtime half ships. */
  readonly kotlinSources: readonly string[]
}

export interface ServiceTypeFinding {
  readonly hook: string
  readonly target: 'swift' | 'kotlin'
  /** The identifier the emit references; empty when none could be read. */
  readonly name: string
  readonly message: string
}

const IDENT = '[A-Za-z_][A-Za-z0-9_]*'

// One left-to-right pass, so a `/*` inside a `//` comment (or inside a string
// such as a URL) cannot open a block comment that swallows the declarations
// after it. Strings are scanned only to be skipped over and kept.
//
// Hand-written rather than one regex on purpose: the block-comment alternative
// (`/\*[\s\S]*?\*\/`) re-scans to the end of the input from EVERY unterminated
// `/*`, which is quadratic on a file full of them. Here each region is scanned
// at most once: a failed search for a closer is remembered (if no `*/` exists
// after one `/*`, none exists after any later one), and an unterminated string
// disables string matching until the end of its line.
function stripComments(source: string): string {
  let out = ''
  let i = 0
  let noBlockCloser = false
  let noStringBefore = -1
  while (i < source.length) {
    const ch = source[i]!
    const next = source[i + 1]
    if (ch === '/' && next === '/') {
      let end = source.indexOf('\n', i)
      if (end === -1) end = source.length
      out += ' '
      i = end
      continue
    }
    if (ch === '/' && next === '*' && !noBlockCloser) {
      const close = source.indexOf('*/', i + 2)
      if (close === -1) noBlockCloser = true
      else {
        out += ' '
        i = close + 2
        continue
      }
    }
    if (ch === '"' && i >= noStringBefore) {
      let j = i + 1
      let closed = false
      while (j < source.length && source[j] !== '\n') {
        if (source[j] === '\\' && j + 1 < source.length && source[j + 1] !== '\n') j += 2
        else if (source[j] === '"') {
          closed = true
          break
        } else j++
      }
      if (closed) {
        out += source.slice(i, j + 1)
        i = j + 1
        continue
      }
      noStringBefore = j
    }
    out += ch
    i++
  }
  return out
}

/** `PyreonShare` from `PyreonShare()` / `PyreonCamera(presenter: …)`. */
export function swiftTypeOf(initializer: string): string | undefined {
  return new RegExp(`^\\s*(${IDENT})\\s*\\(`).exec(initializer)?.[1]
}

/**
 * Every runtime type or function a Kotlin declaration block references as the
 * service itself: `remember { PyreonShare(ctx) }` and `= rememberPyreonX(…)`.
 * Hoisted composition-locals (`LocalContext.current`) are platform symbols, not
 * the plugin's, so they are deliberately not read.
 */
export function kotlinNamesOf(lines: readonly string[]): string[] {
  const names = new Set<string>()
  for (const line of lines) {
    const remembered = new RegExp(`remember\\s*\\{\\s*(${IDENT})\\s*\\(`).exec(line)?.[1]
    if (remembered !== undefined) names.add(remembered)
    const factory = new RegExp(`=\\s*(rememberPyreon[A-Za-z0-9_]*)\\s*[({]`).exec(line)?.[1]
    if (factory !== undefined) names.add(factory)
  }
  return [...names]
}

const swiftDeclares = (name: string, text: string): boolean =>
  new RegExp(`(?:^|[^A-Za-z0-9_.])(?:class|struct|actor|enum)\\s+${name}\\b`, 'm').test(text)

const kotlinDeclares = (name: string, text: string): boolean =>
  new RegExp(
    `(?:^|[^A-Za-z0-9_.])(?:(?:class|object)\\s+${name}\\b|fun\\s+(?:<[^>]*>\\s*)?${name}\\s*\\()`,
    'm',
  ).test(text)

/**
 * Prove that every type a plugin's service descriptors reference actually
 * exists in the sources the plugin ships. A type that exists only in a
 * validation STUB passes every compile gate and then fails the device build —
 * the phantom-capability class. This reads declarations, not behaviour: it
 * cannot prove the signature matches, only that the name is real.
 *
 * @example
 * verifyServiceTypes({ services }, { swiftSources, kotlinSources }) // → []
 */
export function verifyServiceTypes(
  plugin: Pick<CompilerPlugin, 'services'>,
  sources: PluginSources,
): ServiceTypeFinding[] {
  const swift = sources.swiftSources.map(stripComments).join('\n')
  const kotlin = sources.kotlinSources.map(stripComments).join('\n')
  const findings: ServiceTypeFinding[] = []
  for (const [hook, spec] of Object.entries(plugin.services ?? {})) {
    const swiftName = swiftTypeOf(spec.swift)
    if (swiftName === undefined) {
      findings.push({
        hook,
        target: 'swift',
        name: '',
        message: `${hook}: cannot read a type name from the Swift initialiser \`${spec.swift}\`; start it with \`TypeName(\`.`,
      })
    } else if (!swiftDeclares(swiftName, swift)) {
      findings.push({
        hook,
        target: 'swift',
        name: swiftName,
        message: `${hook}: Swift type \`${swiftName}\` is not declared in the shipped Swift sources (class/struct/actor/enum).`,
      })
    }
    const kotlinNames = kotlinNamesOf(spec.kotlin)
    if (kotlinNames.length === 0) {
      findings.push({
        hook,
        target: 'kotlin',
        name: '',
        message: `${hook}: no \`remember { Type(…) }\` or \`rememberPyreonX(…)\` line found in the Kotlin declaration, so nothing could be verified.`,
      })
    }
    for (const name of kotlinNames) {
      if (!kotlinDeclares(name, kotlin)) {
        findings.push({
          hook,
          target: 'kotlin',
          name,
          message: `${hook}: Kotlin \`${name}\` is not declared in the shipped Kotlin sources (class/object/fun).`,
        })
      }
    }
  }
  return findings
}
