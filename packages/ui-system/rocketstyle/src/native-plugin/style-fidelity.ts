// Cross-target style-fidelity contract — the Phase 0 visual-fidelity
// gate (roadmap PR 8).
//
// The PMTC plan's success criterion 3 was "<5% pixel diff between
// Swift / Kotlin / web targets on the canonical Button matrix". A
// true pixel diff needs:
//
//   1. A real SwiftUI render (iOS Simulator + xcrun simctl)
//   2. A real Compose render (emulator + adb screencap)
//   3. A baseline web render (existing — already gated by ui-regression)
//   4. A pixel-diff tool wired into CI
//
// That infrastructure is Phase 1+ work — heavyweight macOS-CI runner,
// emulator boot, baseline image management. Shipping a stubbed
// "screenshot diff" today would be theater: it would either green
// always (no real targets attached) or red always (no baselines).
//
// What Phase 0 CAN honestly prove: a **structural visual fidelity
// contract**. Given the SAME RocketstyleIR, both targets MUST resolve
// the same (dimension, property) → token reference table. If
// Swift's `stateBackgroundColor` switches `.primary → PyreonTokens.Color.primary`
// while Kotlin's `stateBackgroundColor` switches `primary → PyreonTokens.Color.secondary`,
// pixels can't match no matter how good the runtime is.
//
// This module extracts the resolution table from BOTH emitted
// outputs and reports any drift — the structural prerequisite for
// pixel parity. When pixel-diff infrastructure lands, it composes on
// top: parity here = necessary; parity here + identical token values
// + identical native-API mapping = sufficient.

import { emitKotlinRocketstyleModifier, emitSwiftRocketstyleModifier } from './emit-rocketstyle'
import type { RocketstyleIR } from './emit-rocketstyle'

export interface StyleFidelityResolution {
  /** Dimension name — e.g. `state`. */
  dimension: string
  /** Dimension value — e.g. `primary`. */
  value: string
  /** Property name (kebab-case, matching the IR). */
  property: string
  /** The resolved literal — `PyreonTokens.Color.primary`, `12`, `"red"`. */
  literal: string
}

export interface StyleFidelityReport {
  /** Per (dim, value, prop) tuples resolved by the Swift emitter. */
  swift: StyleFidelityResolution[]
  /** Same shape from the Kotlin emitter. */
  kotlin: StyleFidelityResolution[]
  /** Tuples that disagree between targets. Empty = fidelity holds. */
  drift: StyleFidelityDrift[]
}

export interface StyleFidelityDrift {
  dimension: string
  value: string
  property: string
  swiftLiteral: string | undefined
  kotlinLiteral: string | undefined
}

/**
 * Run the cross-target style-fidelity contract against a RocketstyleIR.
 *
 * Returns the per-target resolution tables and the drift set. Callers
 * (typically vitest) assert `report.drift.length === 0` — any drift
 * is a structural blocker for pixel parity at runtime.
 */
export function checkStyleFidelity(rs: RocketstyleIR): StyleFidelityReport {
  const swiftOut = emitSwiftRocketstyleModifier(rs)
  const kotlinOut = emitKotlinRocketstyleModifier(rs)
  const swift = extractSwiftResolution(rs, swiftOut)
  const kotlin = extractKotlinResolution(rs, kotlinOut)
  const drift = diffResolutions(swift, kotlin)
  return { swift, kotlin, drift }
}

/**
 * Walk the IR + the Swift emit output. For each (dimension, value,
 * property) tuple, locate the `case .<value>: return <literal>` line
 * inside the property's accessor switch and capture the literal.
 *
 * The emitter is the source of truth for naming — we re-derive the
 * accessor name from (dimension, property) the same way it does, then
 * regex-grep the switch arm.
 */
function extractSwiftResolution(rs: RocketstyleIR, emitted: string): StyleFidelityResolution[] {
  const out: StyleFidelityResolution[] = []
  for (const dim of rs.dimensions) {
    // Collect the property names this dimension owns (matches the
    // emitter's union-over-values pass).
    const seen = new Set<string>()
    for (const val of dim.values) {
      for (const p of val.properties) {
        if (!seen.has(p.name)) seen.add(p.name)
      }
    }
    for (const propName of seen) {
      const accessor = dim.name + propName.split('-').map(cap).join('')
      // Find the accessor block: `private var <accessor>: <type> { … }`.
      const blockRe = new RegExp(
        `private\\s+var\\s+${escapeRe(accessor)}\\s*:[^{]+\\{([\\s\\S]*?)\\n\\s*\\}`,
      )
      const block = emitted.match(blockRe)
      const blockBody = block?.[1]
      if (!blockBody) continue
      // Then per-value `case .<value>: return <literal>` lines.
      for (const val of dim.values) {
        const caseRe = new RegExp(
          `case\\s+\\.${escapeRe(val.name)}\\s*:\\s*return\\s+(.+?)\\s*$`,
          'm',
        )
        const caseMatch = blockBody.match(caseRe)
        const literal = caseMatch?.[1]?.trim()
        if (literal === undefined) continue
        out.push({
          dimension: dim.name,
          value: val.name,
          property: propName,
          literal,
        })
      }
    }
  }
  return out
}

/**
 * Same shape for Kotlin — `val <accessor> = when (<dim>) { … }`.
 * Kotlin arms use `<EnumName>.<value> -> <literal>`.
 */
function extractKotlinResolution(rs: RocketstyleIR, emitted: string): StyleFidelityResolution[] {
  const out: StyleFidelityResolution[] = []
  for (const dim of rs.dimensions) {
    const seen = new Set<string>()
    for (const val of dim.values) {
      for (const p of val.properties) {
        if (!seen.has(p.name)) seen.add(p.name)
      }
    }
    const enumName = rs.name + cap(dim.name)
    for (const propName of seen) {
      const accessor = dim.name + propName.split('-').map(cap).join('')
      const blockRe = new RegExp(
        `val\\s+${escapeRe(accessor)}\\s*=\\s*when\\s*\\(${escapeRe(dim.name)}\\)\\s*\\{([\\s\\S]*?)\\n\\s*\\}`,
      )
      const block = emitted.match(blockRe)
      const blockBody = block?.[1]
      if (!blockBody) continue
      for (const val of dim.values) {
        const caseRe = new RegExp(
          `${escapeRe(enumName)}\\.${escapeRe(val.name)}\\s*->\\s*(.+?)\\s*$`,
          'm',
        )
        const caseMatch = blockBody.match(caseRe)
        const literal = caseMatch?.[1]?.trim()
        if (literal === undefined) continue
        out.push({
          dimension: dim.name,
          value: val.name,
          property: propName,
          literal,
        })
      }
    }
  }
  return out
}

/**
 * Diff two resolution tables. The key (`dim|value|property`) MUST
 * map to the same literal on both sides; any mismatch is drift.
 *
 * We don't require literal byte-equality (Swift's `0.5` vs Kotlin's
 * `0.5f` is fine); we DO require the SAME source-of-truth — token
 * refs (`PyreonTokens.Color.primary`) match byte-for-byte across
 * targets because both emitters share the same token-emit
 * convention, and that's the load-bearing parity claim.
 */
function diffResolutions(
  swift: StyleFidelityResolution[],
  kotlin: StyleFidelityResolution[],
): StyleFidelityDrift[] {
  const swiftMap = new Map(swift.map((r) => [keyOf(r), r.literal]))
  const kotlinMap = new Map(kotlin.map((r) => [keyOf(r), r.literal]))
  const allKeys = new Set<string>([...swiftMap.keys(), ...kotlinMap.keys()])
  const drift: StyleFidelityDrift[] = []
  for (const key of allKeys) {
    const s = swiftMap.get(key)
    const k = kotlinMap.get(key)
    if (s !== k) {
      const [dimension, value, property] = key.split('|') as [string, string, string]
      drift.push({
        dimension,
        value,
        property,
        swiftLiteral: s,
        kotlinLiteral: k,
      })
    }
  }
  return drift
}

function keyOf(r: StyleFidelityResolution): string {
  return `${r.dimension}|${r.value}|${r.property}`
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
