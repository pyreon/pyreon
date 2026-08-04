/**
 * The issue detectors — each a pure fold over the model (+ import scan),
 * each with a stable code, an honest severity, and evidence in `details`.
 *
 * Severity discipline (the whole point of the tool):
 *  - `error`   — will break someone: unresolvable-in-isolation imports,
 *                runtime cycles, internal version lies, cross-major drift.
 *  - `warning` — works today by accident: minor-level drift, prod code
 *                leaning on a devDependency.
 *  - `info`    — worth a look, detector knows its own limits (unused-dep is
 *                lexical evidence, not proof).
 */
import type { ImportScan } from './imports'
import type { ExternalUsage, GraphAnalysis, LoomIssue, WorkspaceModel } from './types'

/** Leading major from common range shapes; null when unparsable (`*`, tags, urls). */
export function majorOf(range: string): number | null {
  const m = /^[~^]?v?(\d+)(?:\.|$)/.exec(range.trim())
  if (m?.[1] !== undefined) return Number(m[1])
  const ge = /^>=\s*v?(\d+)/.exec(range.trim())
  if (ge?.[1] !== undefined) return Number(ge[1])
  return null
}

/**
 * A range's MAJOR-granularity span `[lo, hi)`; null when unparsable. Caret /
 * tilde / exact pin one major; `>=a <b` spans; bare `>=a` and `*` are open.
 */
export function rangeSpan(range: string): [number, number] | null {
  const r = range.trim()
  if (r === '*' || r === 'latest' || r === '') return [0, Number.POSITIVE_INFINITY]
  const pin = /^[~^]?v?(\d+)(?:\.|$)/.exec(r)
  if (pin?.[1] !== undefined && !r.startsWith('>')) return [Number(pin[1]), Number(pin[1]) + 1]
  const ge = /^>=\s*v?(\d+)(?:[^<]*)(?:<\s*v?(\d+))?/.exec(r)
  if (ge?.[1] !== undefined) {
    const lo = Number(ge[1])
    const hi = ge[2] !== undefined ? Number(ge[2]) : Number.POSITIVE_INFINITY
    return [lo, hi]
  }
  return null
}

/**
 * External version-sync drift: one dep, more than one declared range.
 *
 * Two shapes the first cut mis-called on the dogfood repo, now recognized:
 *  - PEER declarations are CONTRACTS, not pins — a wide `>=5.6.0` peer next
 *    to a pinned `^6.1.0` devDep is the STANDARD pattern, not drift. Peers
 *    are excluded from the drift grouping.
 *  - a deliberately-wide compatibility range that CONTAINS every other
 *    declared range (`>=5 <7` ⊇ `^6.0.3`) is a policy, not a disagreement —
 *    severity drops to info naming the containing range.
 */
export function detectVersionDrift(external: ExternalUsage[], overrides: Record<string, string>): LoomIssue[] {
  const issues: LoomIssue[] = []
  for (const ext of external) {
    // Peer ranges are contracts — only CONCRETE declarations can drift.
    const concrete = Object.entries(ext.ranges).filter(([, users]) =>
      users.some((u) => u.field !== 'peerDependencies'),
    )
    const ranges = concrete.map(([r]) => r)
    if (ranges.length < 2) continue

    const spans = ranges.map(rangeSpan)
    // "Contained" means one range is a STRICT superset of every other — a
    // compatibility policy spanning the pins. Equal spans (^5.0.0 vs ^5.2.0)
    // are genuine drift, not containment.
    const wideIdx = spans.findIndex(
      (s, i) =>
        s !== null &&
        spans.every((o, j) => i === j || (o !== null && s[0] <= o[0] && s[1] >= o[1])) &&
        spans.some((o, j) => i !== j && o !== null && (s[0] < o[0] || s[1] > o[1])),
    )
    const contained = wideIdx >= 0

    const majors = new Set(ranges.map(majorOf).filter((x): x is number => x !== null))
    const crossMajor = majors.size > 1
    const overridden = overrides[ext.name] !== undefined
    const severity = overridden || contained ? 'info' : crossMajor ? 'error' : 'warning'
    const usersByRange = Object.fromEntries(
      Object.entries(ext.ranges).map(([r, users]) => [r, users.map((u) => u.user)]),
    )
    issues.push({
      code: 'version-drift',
      severity,
      pkg: 'ROOT',
      dep: ext.name,
      message:
        `\`${ext.name}\` is declared with ${ranges.length} different ranges (${ranges.join(' · ')})` +
        (overridden
          ? ` — a root override pins it to ${overrides[ext.name]}, so installs agree, but the declarations still lie`
          : contained
            ? ` — \`${ranges[wideIdx]}\` is a compatibility range containing the rest (policy, not disagreement)`
            : crossMajor
              ? ' — the majors differ, so packages are building against different APIs'
              : ''),
      details: { ranges: usersByRange, ...(overridden ? { override: overrides[ext.name] } : {}) },
    })
  }
  return issues
}

/** Internal deps must reference workspace members honestly. */
export function detectInternalRange(model: WorkspaceModel): LoomIssue[] {
  const versions = new Map(model.packages.map((p) => [p.name, p.version]))
  const issues: LoomIssue[] = []
  for (const p of model.packages) {
    for (const d of p.deps) {
      const actual = versions.get(d.name)
      if (actual === undefined || d.name === p.name) continue
      if (d.range.startsWith('workspace:')) {
        const spec = d.range.slice('workspace:'.length)
        if (spec === '*' || spec === '^' || spec === '~') continue
        const specMajor = majorOf(spec)
        const actualMajor = majorOf(actual)
        if (specMajor !== null && actualMajor !== null && specMajor !== actualMajor) {
          issues.push({
            code: 'internal-range',
            severity: 'error',
            pkg: p.name,
            dep: d.name,
            message: `\`${p.name}\` pins workspace dep \`${d.name}\` at \`${d.range}\` but the workspace copy is ${actual} — the pinned major no longer exists here`,
            details: { declared: d.range, actual },
          })
        }
      } else {
        // A bare semver range on an internal package: installs from registry
        // instead of linking the workspace copy the moment versions slip.
        issues.push({
          code: 'internal-range',
          severity: 'error',
          pkg: p.name,
          dep: d.name,
          message: `\`${p.name}\` declares workspace member \`${d.name}\` as \`${d.range}\` (not \`workspace:\`) — a version slip silently installs the REGISTRY copy instead of linking the workspace`,
          details: { declared: d.range, actual },
        })
      }
    }
  }
  return issues
}

/** Runtime cycles from the graph analysis. */
export function detectCycles(graph: GraphAnalysis): LoomIssue[] {
  return graph.cycles.map((loop) => ({
    code: 'cycle' as const,
    severity: 'error' as const,
    pkg: loop[0]!,
    message:
      `Runtime dependency cycle: ${loop.join(' → ')} → ${loop[0]} — imports resolve back to their origin, ` +
      'which blocks layering and can break module initialisation order',
    details: { path: loop },
  }))
}

/**
 * Phantom deps: prod source imports a package the manifest never declares.
 * The exact class that "works" under a hoisting install and explodes under
 * an isolated store (bun isolated / pnpm strict) or in a published consumer.
 */
export function detectPhantoms(model: WorkspaceModel, imports: ImportScan): LoomIssue[] {
  const issues: LoomIssue[] = []
  for (const p of model.packages) {
    const declared = new Set(p.deps.map((d) => d.name))
    declared.add(p.name) // self-imports resolve via exports
    const prod = imports.prod.get(p.name)
    if (!prod) continue
    for (const [dep, files] of prod) {
      if (declared.has(dep)) continue
      // The DefinitelyTyped pattern: `import type { X } from 'mdast'` with
      // `@types/mdast` declared is CORRECT code — TS resolves the specifier
      // through the types package and the import erases at runtime. A
      // lexical scan can't see `type`, but a declared @types twin is the
      // high-confidence signal (scoped: @scope/x → @types/scope__x).
      const typesTwin = dep.startsWith('@')
        ? `@types/${dep.slice(1).replace('/', '__')}`
        : `@types/${dep}`
      if (declared.has(typesTwin)) continue
      // A PRIVATE package is never installed by a consumer — an undeclared
      // import there still breaks isolated-store installs of the WORKSPACE,
      // but it cannot ship broken. warning, not error; published = error.
      issues.push({
        code: 'phantom-dep',
        severity: p.private ? 'warning' : 'error',
        pkg: p.name,
        dep,
        message: `\`${p.name}\` imports \`${dep}\` in shipping source but never declares it — resolvable only through hoisting luck`,
        details: { files },
      })
    }
    // Prod import of a dev-only declaration: breaks CONSUMERS, not the repo.
    const devOnly = new Set(
      p.deps.filter((d) => d.field === 'devDependencies').map((d) => d.name),
    )
    for (const d of p.deps) {
      if (d.field !== 'devDependencies') devOnly.delete(d.name)
    }
    // TYPE-ONLY imports are deliberately absent here: `import type { X } from
    // 'devDep'` is the CORRECT pattern (the import erases, so a consumer never
    // needs it installed). Counting them made this detector fire on 9 of 12
    // findings in a real TypeScript monorepo — all of them correct code.
    for (const [dep, files] of prod) {
      if (!devOnly.has(dep)) continue
      // The hazard is a CONSUMER's missing install — a private package has no
      // consumers, so there it is information, not a warning.
      issues.push({
        code: 'prod-import-of-dev-dep',
        severity: p.private ? 'info' : 'warning',
        pkg: p.name,
        dep,
        message: `\`${p.name}\` imports \`${dep}\` in shipping source but declares it only in devDependencies — consumers won't have it installed`,
        details: { files },
      })
    }
    // A type-only import of a package declared NOWHERE is still a real defect
    // — typecheck resolves it through hoisting — but it is not the runtime
    // hazard `phantom-dep` describes, so it is reported as what it is.
    const typeOnly = imports.type.get(p.name)
    if (typeOnly) {
      for (const [dep, files] of typeOnly) {
        if (declared.has(dep)) continue
        const typesTwin = dep.startsWith('@')
          ? `@types/${dep.slice(1).replace('/', '__')}`
          : `@types/${dep}`
        if (declared.has(typesTwin)) continue
        if (prod.has(dep) || (imports.dev.get(p.name)?.has(dep) ?? false)) continue // already reported above
        issues.push({
          code: 'phantom-type-dep',
          severity: 'info',
          pkg: p.name,
          dep,
          message: `\`${p.name}\` imports \`${dep}\` type-only but never declares it — erased at runtime, so consumers are unaffected, but typecheck resolves it through hoisting luck; declare it in devDependencies`,
          details: { files },
        })
      }
    }
  }
  return issues
}

/** Declared prod deps with no lexical import anywhere in the package. */
export function detectUnused(model: WorkspaceModel, imports: ImportScan): LoomIssue[] {
  const issues: LoomIssue[] = []
  for (const p of model.packages) {
    const prod = imports.prod.get(p.name) ?? new Map<string, string[]>()
    const dev = imports.dev.get(p.name) ?? new Map<string, string[]>()
    // TYPE-ONLY counts as USED. Splitting type imports out of `prod` without
    // consulting them here would have turned every type-only dependency into
    // a fresh `unused-dep` accusation — the fix manufacturing the very class
    // of false positive it set out to remove.
    const type = imports.type.get(p.name) ?? new Map<string, string[]>()
    for (const d of p.deps) {
      if (d.field !== 'dependencies') continue
      if (prod.has(d.name) || dev.has(d.name) || type.has(d.name)) continue
      // `@types/*` and tool-invoked packages are the classic lexical misses.
      if (d.name.startsWith('@types/')) continue
      issues.push({
        code: 'unused-dep',
        severity: 'info',
        pkg: p.name,
        dep: d.name,
        message: `\`${p.name}\` declares \`${d.name}\` as a dependency but no source file imports it — lexical evidence only (bins/plugins/CSS load without an import statement); verify before removing`,
      })
    }
  }
  return issues
}

/** Internal peer ranges must match the workspace copy's actual version. */
export function detectPeerMismatch(model: WorkspaceModel): LoomIssue[] {
  const versions = new Map(model.packages.map((p) => [p.name, p.version]))
  const issues: LoomIssue[] = []
  for (const p of model.packages) {
    for (const d of p.deps) {
      if (d.field !== 'peerDependencies') continue
      const actual = versions.get(d.name)
      if (actual === undefined || d.range.startsWith('workspace:')) continue
      const peerMajor = majorOf(d.range)
      const actualMajor = majorOf(actual)
      if (peerMajor !== null && actualMajor !== null && peerMajor !== actualMajor) {
        issues.push({
          code: 'peer-mismatch',
          severity: 'warning',
          pkg: p.name,
          dep: d.name,
          message: `\`${p.name}\` peer-requires \`${d.name}\` at \`${d.range}\` but the workspace ships ${actual} — the peer contract and the local reality disagree by a major`,
          details: { declared: d.range, actual },
        })
      }
    }
  }
  return issues
}
