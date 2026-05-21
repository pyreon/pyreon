// Style-modifier emitter — turns a `styled()` IR into per-target
// per-target output:
//   - Swift: a `ViewModifier` struct attached via `.modifier(...)`
//   - Kotlin: a `Modifier` chain attached via `.modifier(...)`
//
// Per the PMTC chosen-direction plan (#764) §"Same styles":
// `styled()` is a description-of-styling — the IR captures the
// declarative shape; per-target emitters render it idiomatically.
//
// Phase 0 (this PR): minimal IR + emitters with a curated set of
// CSS-property mappings (background, padding, border-radius,
// foreground color). The full styler-pipeline parsing (CSS-in-JS
// tagged template → StyleIR) is a follow-up PR.

export interface StyleIR {
  /** Unique identifier — emitted as the ViewModifier struct name (Swift)
   * or the Modifier-helper function name (Kotlin). */
  name: string
  /** Declarative CSS-style properties. Each entry's CSS name maps to a
   * Swift/Kotlin idiom per the mapping table below. */
  properties: StyleProperty[]
}

export interface StyleProperty {
  /** CSS property name in kebab-case (`background-color`, `padding`). */
  name: string
  /** Resolved value — Phase 0 supports literal strings + token refs. */
  value: StyleValue
}

export type StyleValue =
  | { kind: 'string'; value: string }
  | { kind: 'number'; value: number }
  /**
   * Token reference — `PyreonTokens.<group>.<entry>`. The emitter
   * threads through to the target's canonical token access syntax.
   * Lets styled() refer to design-system tokens by name rather than
   * by value, so style updates flow through the token table.
   */
  | { kind: 'token'; group: string; entry: string }

/**
 * Emit a SwiftUI `ViewModifier` struct from a StyleIR.
 *
 *   struct PyreonPrimaryButton: ViewModifier, PyreonStylable {
 *     static let pyreonSource = "Button.primary"
 *     func body(content: Content) -> some View {
 *       content
 *         .background(PyreonTokens.Color.primary)
 *         .padding(PyreonTokens.Spacing.md)
 *         .cornerRadius(PyreonTokens.Radius.md)
 *     }
 *   }
 */
export function emitSwiftStyleModifier(style: StyleIR): string {
  const lines: string[] = []
  lines.push(`struct ${style.name}: ViewModifier, PyreonStylable {`)
  lines.push(`  static let pyreonSource = ${JSON.stringify(style.name)}`)
  lines.push(`  func body(content: Content) -> some View {`)
  lines.push(`    content`)
  for (const prop of style.properties) {
    const mapped = swiftPropertyChain(prop)
    if (mapped) lines.push(`      ${mapped}`)
  }
  lines.push(`  }`)
  lines.push(`}`)
  return lines.join('\n')
}

/**
 * Emit a Compose `Modifier` chain factory from a StyleIR.
 *
 *   fun pyreonPrimaryButton(): Modifier =
 *     Modifier
 *       .background(PyreonTokens.Color.primary)
 *       .padding(PyreonTokens.Spacing.md)
 *       .clip(RoundedCornerShape(PyreonTokens.Radius.md))
 */
export function emitKotlinStyleModifier(style: StyleIR): string {
  const lines: string[] = []
  // Kotlin-style camelCase function names — first char lowercase.
  const fnName = style.name.charAt(0).toLowerCase() + style.name.slice(1)
  lines.push(`fun ${fnName}(): Modifier =`)
  lines.push(`  Modifier`)
  for (const prop of style.properties) {
    const mapped = kotlinPropertyChain(prop)
    if (mapped) lines.push(`    ${mapped}`)
  }
  return lines.join('\n')
}

/**
 * Map a CSS property to a SwiftUI ViewModifier chain entry.
 * Returns null for unsupported properties (Phase 0 covers the
 * canonical set the PMTC plan's Button example uses).
 */
function swiftPropertyChain(prop: StyleProperty): string | null {
  const v = swiftValue(prop.value)
  switch (prop.name) {
    case 'background':
    case 'background-color':
      return `.background(${v})`
    case 'color':
    case 'foreground-color':
      return `.foregroundColor(${v})`
    case 'padding':
      return `.padding(${v})`
    case 'border-radius':
    case 'corner-radius':
      return `.cornerRadius(${v})`
    case 'font-size':
      return `.font(.system(size: ${v}))`
    case 'opacity':
      return `.opacity(${v})`
    default:
      return null
  }
}

function kotlinPropertyChain(prop: StyleProperty): string | null {
  const v = kotlinValue(prop.value)
  switch (prop.name) {
    case 'background':
    case 'background-color':
      return `.background(${v})`
    case 'color':
    case 'foreground-color':
      // Compose doesn't have a chainable foreground-color on Modifier;
      // it's a Text-specific concern. Defer to a comment so the
      // generated code is structurally honest.
      return `// color: ${v} (apply on Text/Composable, not Modifier)`
    case 'padding':
      return `.padding(${v})`
    case 'border-radius':
    case 'corner-radius':
      return `.clip(RoundedCornerShape(${v}))`
    case 'opacity':
      return `.alpha(${v})`
    default:
      return null
  }
}

function swiftValue(v: StyleValue): string {
  switch (v.kind) {
    case 'string':
      return JSON.stringify(v.value)
    case 'number':
      return String(v.value)
    case 'token': {
      // Capitalise group name to match the token-emit convention from
      // emit-tokens.ts (`PyreonTokens.Spacing.md`, etc.).
      const cap = v.group.charAt(0).toUpperCase() + v.group.slice(1)
      return `PyreonTokens.${cap}.${v.entry}`
    }
  }
}

function kotlinValue(v: StyleValue): string {
  switch (v.kind) {
    case 'string':
      return JSON.stringify(v.value)
    case 'number':
      return String(v.value)
    case 'token': {
      const cap = v.group.charAt(0).toUpperCase() + v.group.slice(1)
      return `PyreonTokens.${cap}.${v.entry}`
    }
  }
}
