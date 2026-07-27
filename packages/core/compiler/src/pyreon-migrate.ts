/**
 * `migratePyreonCode` — auto-fix the mechanically-safe Pyreon footguns.
 *
 * The parallel to `migrateReactCode` (which rewrites React → Pyreon): this
 * rewrites Pyreon-footgun → correct-Pyreon. It closes the documented gap that
 * kept every `detectPyreonPatterns` diagnostic `fixable: false` ("no
 * migrate_pyreon tool yet"). Only the UNAMBIGUOUS, purely-mechanical footguns
 * are auto-fixed — a codemod that mangles code is worse than none:
 *
 *   - `signal-write-as-call`      `sig(v)`                    → `sig.set(v)`
 *   - `for-with-key`              `<For key={k}>`             → `<For by={k}>`
 *   - `as-unknown-as-vnodechild`  `x as unknown as VNodeChild`→ `x`
 *
 * Every other detected footgun (props-destructured, on-click-undefined,
 * raw-add-event-listener, date-math-random-id, …) needs human judgement and is
 * returned in `remaining`, untouched.
 *
 * Edits are span-based (exact `getStart`/`getEnd`), applied back-to-front so
 * offsets never shift, and non-overlapping (a fix skips its own subtree). The
 * transform is idempotent — a fixed shape is no longer a footgun — so running
 * it until stable converges (single pass fixes the common case).
 */

import ts from 'typescript'
import { assertClassicTs } from './ts'
import {
  collectSignalBindings,
  detectPyreonPatterns,
  findJsxAttribute,
  getJsxTagName,
  type PyreonDiagnosticCode,
} from './pyreon-intercept'

/** Footgun codes `migratePyreonCode` can auto-fix. */
export const AUTO_FIXABLE_PYREON_CODES: ReadonlySet<PyreonDiagnosticCode> = new Set<PyreonDiagnosticCode>(
  ['signal-write-as-call', 'for-with-key', 'as-unknown-as-vnodechild'],
)

export interface PyreonMigrationChange {
  code: PyreonDiagnosticCode
  /** 1-based line. */
  line: number
  /** 0-based column. */
  column: number
  /** The source text that was replaced. */
  before: string
  /** The replacement text. */
  after: string
  /** One-line human summary. */
  description: string
}

export interface PyreonRemainingIssue {
  code: PyreonDiagnosticCode
  line: number
  message: string
}

export interface PyreonMigrationResult {
  /** The rewritten source (unchanged when there was nothing to fix). */
  code: string
  /** Applied fixes, top-to-bottom. */
  changes: PyreonMigrationChange[]
  /** Detected footguns that are NOT auto-fixable — need a human. */
  remaining: PyreonRemainingIssue[]
}

interface Edit {
  start: number
  end: number
  replacement: string
  code: PyreonDiagnosticCode
  description: string
}

/**
 * Auto-fix the mechanically-safe Pyreon footguns in `source`.
 *
 * @param source    Source text (`.tsx` / `.jsx` / `.ts`).
 * @param filename  Parse-mode hint (`.tsx` → JSX). Default `component.tsx`.
 */
export function migratePyreonCode(source: string, filename = 'component.tsx'): PyreonMigrationResult {
  const isTsx = filename.endsWith('.tsx') || filename.endsWith('.jsx')
  assertClassicTs()
  const sf = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    isTsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const signals = collectSignalBindings(sf)
  const edits: Edit[] = []

  const walk = (node: ts.Node): void => {
    // signal-write-as-call: `sig(value)` → `sig.set(value)`
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      signals.has(node.expression.text) &&
      node.arguments.length > 0
    ) {
      const callee = node.expression.text
      const args = node.arguments.map((a) => a.getText(sf)).join(', ')
      edits.push({
        start: node.getStart(sf),
        end: node.getEnd(),
        replacement: `${callee}.set(${args})`,
        code: 'signal-write-as-call',
        description: `\`${callee}(…)\` → \`${callee}.set(…)\``,
      })
      // Skip the subtree — the whole call span is being replaced. A nested
      // signal-write inside the args (rare) is fixed on the next pass.
      return
    }

    // for-with-key: `<For key={k}>` → `<For by={k}>` (rename the attribute name)
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      getJsxTagName(node) === 'For'
    ) {
      const keyAttr = findJsxAttribute(node, 'key')
      if (keyAttr && ts.isIdentifier(keyAttr.name) && !findJsxAttribute(node, 'by')) {
        edits.push({
          start: keyAttr.name.getStart(sf),
          end: keyAttr.name.getEnd(),
          replacement: 'by',
          code: 'for-with-key',
          description: '`<For key={…}>` → `<For by={…}>`',
        })
      }
      // fall through — attributes/children may hold other fixable shapes
    }

    // as-unknown-as-vnodechild: `x as unknown as VNodeChild` → `x`
    if (
      ts.isAsExpression(node) &&
      ts.isTypeReferenceNode(node.type) &&
      ts.isIdentifier(node.type.typeName) &&
      node.type.typeName.text === 'VNodeChild'
    ) {
      const inner = node.expression
      if (ts.isAsExpression(inner) && inner.type.kind === ts.SyntaxKind.UnknownKeyword) {
        edits.push({
          start: node.getStart(sf),
          end: node.getEnd(),
          replacement: inner.expression.getText(sf),
          code: 'as-unknown-as-vnodechild',
          description: 'remove `as unknown as VNodeChild`',
        })
        return
      }
    }

    ts.forEachChild(node, walk)
  }
  walk(sf)

  // Apply edits back-to-front so earlier offsets stay valid.
  edits.sort((a, b) => b.start - a.start)
  let code = source
  const changes: PyreonMigrationChange[] = []
  for (const e of edits) {
    const { line, character } = sf.getLineAndCharacterOfPosition(e.start)
    changes.push({
      code: e.code,
      line: line + 1,
      column: character,
      before: source.slice(e.start, e.end),
      after: e.replacement,
      description: e.description,
    })
    code = code.slice(0, e.start) + e.replacement + code.slice(e.end)
  }
  changes.reverse() // present top-to-bottom

  // Non-fixable footguns → for the human. Computed from the ORIGINAL source.
  const remaining: PyreonRemainingIssue[] = detectPyreonPatterns(source, filename)
    .filter((d) => !AUTO_FIXABLE_PYREON_CODES.has(d.code))
    .map((d) => ({ code: d.code, line: d.line, message: d.message }))

  return { code, changes, remaining }
}
