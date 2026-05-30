// Rocketstyle-dimensions emitter — turns a rocketstyle component's
// multi-dimensional theme matrix (state × size × variant × …) into a
// per-target idiomatic ViewModifier (Swift) / Modifier function
// (Kotlin) parameterised by the live dimension values.
//
// Per the PMTC chosen-direction plan §"Same dimensions":
// rocketstyle's compile-time-collapsible matrix IS the load-bearing
// shape that justifies a native target — every other framework can
// already do styled(); none has the multi-dimensional collapse.
//
// Phase 0 (this PR — roadmap 7c): emit per-dimension enums + ONE
// ViewModifier struct whose body resolves per-property values via a
// switch on the dimension's value. Each StyleProperty in the IR
// belongs to ONE dimension (rocketstyle's structural rule: dimensions
// don't overlap on a given CSS property). The TSX-source →
// RocketstyleIR parser is a follow-up; this PR exercises the emitter
// shape against hand-built IR.
//
// Trade-off: Phase 0 emits the FULL matrix-resolution shape even when
// only ONE dimension actually varies a property — keeps the structure
// honest. The compile-time COLLAPSE (resolving the live prop values
// at SSR/build time and emitting a single concrete .background(…))
// is the P0 win described in `.claude/plans/open-work-2026-q3.md`,
// not in scope for this Phase 0 shape PR.

import type { StyleProperty, StyleValue } from './emit-style'

export interface RocketstyleIR {
  /** Component name — emitted as `<Name>Modifier` (Swift) / `<name>Modifier`
   * (Kotlin) for the resulting ViewModifier / Modifier function. */
  name: string
  /** Dimensions in declaration order — each value carries its own
   * per-value property overrides. */
  dimensions: RocketstyleDimension[]
}

export interface RocketstyleDimension {
  /** Dimension name — e.g. `state`, `size`, `variant`. Emitted as a
   * Swift `enum <Name><Dim>` / Kotlin `enum class <Name><Dim>`. */
  name: string
  /** Allowed values for this dimension. */
  values: RocketstyleDimensionValue[]
}

export interface RocketstyleDimensionValue {
  /** Value name — `primary`, `medium`, etc. Used as the enum case. */
  name: string
  /** Property overrides applied when this dimension takes this value. */
  properties: StyleProperty[]
}

/**
 * Emit per-dimension Swift enums + a ViewModifier struct.
 *
 * Example shape (PyreonButton with state × size):
 *
 *   enum PyreonButtonState: String { case primary, secondary, danger }
 *   enum PyreonButtonSize: String { case small, medium, large }
 *
 *   struct PyreonButtonModifier: ViewModifier, PyreonStylable {
 *     static let pyreonSource = "PyreonButton"
 *     let state: PyreonButtonState
 *     let size: PyreonButtonSize
 *     func body(content: Content) -> some View {
 *       content
 *         .background(stateBackground)
 *         .padding(sizePadding)
 *     }
 *     private var stateBackground: some View {
 *       switch state {
 *       case .primary: PyreonTokens.Color.primary
 *       case .secondary: PyreonTokens.Color.secondary
 *       case .danger: PyreonTokens.Color.danger
 *       }
 *     }
 *     private var sizePadding: CGFloat {
 *       switch size {
 *       case .small: return PyreonTokens.Spacing.sm
 *       case .medium: return PyreonTokens.Spacing.md
 *       case .large: return PyreonTokens.Spacing.lg
 *       }
 *     }
 *   }
 */
export function emitSwiftRocketstyleModifier(rs: RocketstyleIR): string {
  const lines: string[] = []
  // Per-dimension enums first.
  for (const dim of rs.dimensions) {
    const enumName = swiftDimEnumName(rs.name, dim.name)
    lines.push(`enum ${enumName}: String {`)
    const cases = dim.values.map((v) => v.name).join(', ')
    lines.push(`  case ${cases}`)
    lines.push(`}`)
    lines.push(``)
  }

  // Single ViewModifier struct holding all dimension values.
  lines.push(`struct ${rs.name}Modifier: ViewModifier, PyreonStylable {`)
  lines.push(`  static let pyreonSource = ${JSON.stringify(rs.name)}`)
  for (const dim of rs.dimensions) {
    const enumName = swiftDimEnumName(rs.name, dim.name)
    lines.push(`  let ${dim.name}: ${enumName}`)
  }
  lines.push(`  func body(content: Content) -> some View {`)
  lines.push(`    content`)
  // For each (dimension, property) pair, emit a chain entry referencing a
  // computed accessor. Properties belonging to the same dimension share
  // the same switch — but we emit one accessor per property so the
  // generated code reads top-to-bottom in declaration order.
  const propAccessors: { dimName: string; prop: StyleProperty; accessor: string }[] = []
  for (const dim of rs.dimensions) {
    // Collect the union of property names across this dimension's values
    // (rocketstyle convention: each value carries the SAME set of
    // properties — we union to be safe in case one value omits a prop).
    const seen = new Set<string>()
    for (const value of dim.values) {
      for (const prop of value.properties) {
        if (seen.has(prop.name)) continue
        seen.add(prop.name)
        const accessor = swiftAccessorName(dim.name, prop.name)
        propAccessors.push({ dimName: dim.name, prop, accessor })
      }
    }
  }
  for (const { prop, accessor } of propAccessors) {
    const chain = swiftPropertyChainRef(prop.name, accessor)
    if (chain) lines.push(`      ${chain}`)
  }
  lines.push(`  }`)
  // Emit each accessor as a computed property switching on the dimension.
  for (const { dimName, prop, accessor } of propAccessors) {
    const dim = rs.dimensions.find((d) => d.name === dimName)
    if (!dim) continue
    const swiftType = swiftPropertyType(prop.name)
    lines.push(`  private var ${accessor}: ${swiftType} {`)
    lines.push(`    switch ${dimName} {`)
    for (const value of dim.values) {
      const matched = value.properties.find((p) => p.name === prop.name)
      const literal = matched ? swiftValue(matched.value) : '/* missing */ nil'
      lines.push(`    case .${value.name}: return ${literal}`)
    }
    lines.push(`    }`)
    lines.push(`  }`)
  }
  lines.push(`}`)
  return lines.join('\n')
}

/**
 * Emit per-dimension Kotlin sealed-class enums + a Modifier-returning
 * Composable factory.
 *
 *   enum class PyreonButtonState { primary, secondary, danger }
 *   enum class PyreonButtonSize { small, medium, large }
 *
 *   fun pyreonButtonModifier(
 *     state: PyreonButtonState,
 *     size: PyreonButtonSize,
 *   ): Modifier {
 *     val stateBackground = when (state) {
 *       PyreonButtonState.primary -> PyreonTokens.Color.primary
 *       PyreonButtonState.secondary -> PyreonTokens.Color.secondary
 *       PyreonButtonState.danger -> PyreonTokens.Color.danger
 *     }
 *     val sizePadding = when (size) {
 *       PyreonButtonSize.small -> PyreonTokens.Spacing.sm
 *       PyreonButtonSize.medium -> PyreonTokens.Spacing.md
 *       PyreonButtonSize.large -> PyreonTokens.Spacing.lg
 *     }
 *     return Modifier
 *       .background(stateBackground)
 *       .padding(sizePadding)
 *   }
 */
export function emitKotlinRocketstyleModifier(rs: RocketstyleIR): string {
  const lines: string[] = []
  for (const dim of rs.dimensions) {
    const enumName = kotlinDimEnumName(rs.name, dim.name)
    const cases = dim.values.map((v) => v.name).join(', ')
    lines.push(`enum class ${enumName} { ${cases} }`)
    lines.push(``)
  }

  // Function name camelCase: PyreonButton → pyreonButtonModifier.
  const fnName = rs.name.charAt(0).toLowerCase() + rs.name.slice(1) + 'Modifier'
  const params = rs.dimensions
    .map((d) => `${d.name}: ${kotlinDimEnumName(rs.name, d.name)}`)
    .join(', ')
  lines.push(`fun ${fnName}(${params}): Modifier {`)

  // Per-property `val` bindings — same `when` shape as the Swift switch.
  const propAccessors: { dimName: string; prop: StyleProperty; accessor: string }[] = []
  for (const dim of rs.dimensions) {
    const seen = new Set<string>()
    for (const value of dim.values) {
      for (const prop of value.properties) {
        if (seen.has(prop.name)) continue
        seen.add(prop.name)
        const accessor = kotlinAccessorName(dim.name, prop.name)
        propAccessors.push({ dimName: dim.name, prop, accessor })
      }
    }
  }
  for (const { dimName, prop, accessor } of propAccessors) {
    const dim = rs.dimensions.find((d) => d.name === dimName)
    if (!dim) continue
    const enumName = kotlinDimEnumName(rs.name, dim.name)
    lines.push(`  val ${accessor} = when (${dimName}) {`)
    for (const value of dim.values) {
      const matched = value.properties.find((p) => p.name === prop.name)
      const literal = matched ? kotlinValue(matched.value) : '/* missing */ null'
      lines.push(`    ${enumName}.${value.name} -> ${literal}`)
    }
    lines.push(`  }`)
  }
  // Build the Modifier chain referencing the val bindings.
  lines.push(`  return Modifier`)
  for (const { prop, accessor } of propAccessors) {
    const chain = kotlinPropertyChainRef(prop.name, accessor)
    if (chain) lines.push(`    ${chain}`)
  }
  lines.push(`}`)
  return lines.join('\n')
}

// ─── helpers ─────────────────────────────────────────────────────────

function swiftDimEnumName(componentName: string, dimName: string): string {
  return componentName + capitalize(dimName)
}

function kotlinDimEnumName(componentName: string, dimName: string): string {
  return componentName + capitalize(dimName)
}

function swiftAccessorName(dimName: string, propName: string): string {
  // `state` + `background-color` → `stateBackgroundColor`.
  return dimName + propName.split('-').map(capitalize).join('')
}

function kotlinAccessorName(dimName: string, propName: string): string {
  return dimName + propName.split('-').map(capitalize).join('')
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * Map a CSS property name to its SwiftUI ViewModifier chain entry,
 * referencing the named accessor instead of inlining a literal.
 * Mirrors `swiftPropertyChain` in emit-style.ts.
 */
function swiftPropertyChainRef(propName: string, accessor: string): string | null {
  switch (propName) {
    case 'background':
    case 'background-color':
      return `.background(${accessor})`
    case 'color':
    case 'foreground-color':
      return `.foregroundColor(${accessor})`
    case 'padding':
      return `.padding(${accessor})`
    case 'border-radius':
    case 'corner-radius':
      return `.cornerRadius(${accessor})`
    case 'font-size':
      return `.font(.system(size: ${accessor}))`
    case 'opacity':
      return `.opacity(${accessor})`
    default:
      return null
  }
}

function kotlinPropertyChainRef(propName: string, accessor: string): string | null {
  switch (propName) {
    case 'background':
    case 'background-color':
      return `.background(${accessor})`
    case 'color':
    case 'foreground-color':
      // Same caveat as emit-style.ts — Compose's color is a Text concern.
      return `// color: ${accessor} (apply on Text/Composable, not Modifier)`
    case 'padding':
      return `.padding(${accessor})`
    case 'border-radius':
    case 'corner-radius':
      return `.clip(RoundedCornerShape(${accessor}))`
    case 'opacity':
      return `.alpha(${accessor})`
    default:
      return null
  }
}

/**
 * SwiftUI type for a per-property computed accessor.
 * Color-ish props → some View (we emit token refs that are Color-typed
 * but Swift's some-View is the safest emit type for Phase 0). Numeric
 * props → CGFloat. The full type-resolution table grows with the
 * styled() parser PR.
 */
function swiftPropertyType(propName: string): string {
  switch (propName) {
    case 'background':
    case 'background-color':
    case 'color':
    case 'foreground-color':
      return 'Color'
    case 'padding':
    case 'border-radius':
    case 'corner-radius':
    case 'font-size':
      return 'CGFloat'
    case 'opacity':
      return 'Double'
    default:
      return 'Any'
  }
}

function swiftValue(v: StyleValue): string {
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
