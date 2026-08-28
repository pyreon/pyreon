import { parseSync, Visitor } from 'oxc-parser'
import type { AstCache } from './cache'
import type {
  ConfigDiagnostic,
  Diagnostic,
  Fix,
  LintConfig,
  LintFileResult,
  Rule,
  RuleContext,
  RuleFix,
  RuleOptions,
  Severity,
  VisitorCallbacks,
} from './types'
import { JS_EXTENSIONS } from './utils/index'
import { LineIndex } from './utils/source'
import { validateRuleOptions } from './utils/validate-options'
import { matchesExemptPath } from './utils/exempt-paths'

// Per-process cache so we only validate a given (rule, options) pair once
// and only print-once even across a multi-file lint run.
const VALIDATION_CACHE = new Map<string, { ok: boolean; diagnostics: ConfigDiagnostic[] }>()

/** Reset caches — exposed for tests; not part of the public surface. */
export function _resetConfigDiagnosticsCache(): void {
  VALIDATION_CACHE.clear()
}

function getExtension(filePath: string): string {
  const lastDot = filePath.lastIndexOf('.')
  return lastDot === -1 ? '' : filePath.slice(lastDot)
}

type OxcLang = 'jsx' | 'tsx' | 'ts' | 'js' | 'dts'

function getLang(ext: string): OxcLang {
  if (ext === '.tsx' || ext === '.jsx') return 'tsx'
  if (ext === '.ts' || ext === '.mts') return 'ts'
  return 'js'
}

function createRuleContext(
  rule: Rule,
  severity: Severity,
  options: RuleOptions,
  diagnostics: Diagnostic[],
  lineIndex: LineIndex,
  sourceText: string,
  filePath: string,
): RuleContext {
  return {
    report(partial) {
      diagnostics.push({
        ruleId: rule.meta.id,
        severity,
        message: partial.message,
        span: partial.span,
        loc: lineIndex.locate(partial.span.start),
        fix: partial.fix,
      })
    },
    getSourceText() {
      return sourceText
    },
    getFilePath() {
      return filePath
    },
    getOptions() {
      return options
    },
  }
}

function mergeCallbacks(allCallbacks: VisitorCallbacks[]): Record<string, (node: any) => void> {
  const callbacksByKey: Record<string, Array<(node: any) => void>> = {}

  for (const callbacks of allCallbacks) {
    for (const [key, fn] of Object.entries(callbacks)) {
      const existing = callbacksByKey[key]
      if (existing) {
        existing.push(fn as (node: any) => void)
      } else {
        callbacksByKey[key] = [fn as (node: any) => void]
      }
    }
  }

  const merged: Record<string, (node: any) => void> = {}
  for (const [key, fns] of Object.entries(callbacksByKey)) {
    const first = fns[0]
    if (fns.length === 1 && first) {
      merged[key] = first
    } else {
      merged[key] = (node: any) => {
        for (const fn of fns) fn(node)
      }
    }
  }
  return merged
}

/**
 * Lint a single file and return diagnostics.
 *
 * @example
 * ```ts
 * const result = lintFile("app.tsx", source, allRules, getPreset("recommended"))
 * for (const d of result.diagnostics) console.log(d.message)
 * ```
 */
export function lintFile(
  filePath: string,
  sourceText: string,
  rules: Rule[],
  config: LintConfig,
  cache?: AstCache | undefined,
  /**
   * Optional sink for config-level diagnostics (malformed rule options).
   * When provided, diagnostics are appended to it instead of printed to
   * stderr — `lint()` uses this to surface them on `LintResult`.
   */
  configDiagnosticsSink?: ConfigDiagnostic[],
): LintFileResult {
  const ext = getExtension(filePath)
  if (!JS_EXTENSIONS.has(ext)) {
    return { filePath, diagnostics: [] }
  }

  // Try cache first
  let lineIndex: LineIndex
  let program: any
  const cached = cache?.get(sourceText)
  if (cached) {
    lineIndex = cached.lineIndex
    program = cached.program
  } else {
    lineIndex = new LineIndex(sourceText)
    try {
      const result = parseSync(filePath, sourceText, {
        sourceType: 'module',
        lang: getLang(ext),
      })
      program = result.program
    } catch {
      return { filePath, diagnostics: [] }
    }
    cache?.set(sourceText, { program, lineIndex })
  }

  const diagnostics: Diagnostic[] = []

  // Filter to enabled rules and create visitor callbacks
  const allCallbacks: VisitorCallbacks[] = []
  for (const rule of rules) {
    const entry = config.rules[rule.meta.id]
    if (entry === undefined) continue
    // Normalize bare severity vs `[severity, options]` tuple.
    const [severity, options]: [Severity, RuleOptions] = Array.isArray(entry)
      ? [entry[0] as Severity, (entry[1] ?? {}) as RuleOptions]
      : [entry as Severity, {}]
    if (severity === 'off') continue

    // Validate options against the rule's declared schema. Cached per
    // (rule, options) pair — config doesn't change within a run.
    const cacheKey = `${rule.meta.id}::${JSON.stringify(options)}`
    let validation = VALIDATION_CACHE.get(cacheKey)
    if (!validation) {
      const { errors, warnings } = validateRuleOptions(rule, options)
      const configDiags: ConfigDiagnostic[] = []
      for (const message of warnings) {
        configDiags.push({ ruleId: rule.meta.id, severity: 'warn', message })
      }
      for (const message of errors) {
        configDiags.push({ ruleId: rule.meta.id, severity: 'error', message })
      }
      validation = { ok: errors.length === 0, diagnostics: configDiags }
      VALIDATION_CACHE.set(cacheKey, validation)
    }
    // Surface config diagnostics once per (rule, options) pair: prefer
    // the caller-supplied sink (so `lint()` can put them on LintResult);
    // fall back to stderr for standalone `lintFile` usage.
    if (validation.diagnostics.length > 0) {
      if (configDiagnosticsSink) {
        // Dedupe within the sink by (ruleId, message) so two different rules
        // that happen to produce an identical message don't collapse.
        for (const d of validation.diagnostics) {
          if (
            !configDiagnosticsSink.some(
              (x) => x.ruleId === d.ruleId && x.message === d.message,
            )
          ) {
            configDiagnosticsSink.push(d)
          }
        }
      } else {
        for (const d of validation.diagnostics) {
          // oxlint-disable-next-line no-console
          const emit = d.severity === 'error' ? console.error : console.warn
          emit(`[pyreon-lint] ${d.message}`)
        }
      }
    }
    // Hard error in options → skip this rule entirely for the run.
    if (!validation.ok) continue

    // `exemptPaths` is honoured CENTRALLY, for every rule.
    //
    // It used to be opt-in per rule: a rule had to call `isPathExempt`
    // itself, and 55 of 101 did not. Configuring an exemption for one of
    // those did nothing — no error, no warning, no effect. That is the
    // silent-hole shape this repo's own catalog warns about, and it is
    // indistinguishable from a working exemption until someone checks the
    // rule's source. Applying it here makes the option mean the same thing
    // for every rule by construction.
    //
    // Semantics are unchanged for rules that already call `isPathExempt`:
    // every existing use is a whole-file skip, which is exactly what
    // skipping `rule.create()` produces. Their in-rule call simply never
    // runs now — kept because it documents the intent at the rule.
    if (matchesExemptPath(options.exemptPaths, filePath)) continue

    const ctx = createRuleContext(
      rule,
      severity,
      options,
      diagnostics,
      lineIndex,
      sourceText,
      filePath,
    )
    allCallbacks.push(rule.create(ctx))
  }

  // Walk the AST
  const visitor = new Visitor(mergeCallbacks(allCallbacks))
  visitor.visit(program)

  // Filter suppressed diagnostics. Two equivalent comment syntaxes:
  //   // pyreon-lint-ignore                            — suppress all on next line
  //   // pyreon-lint-ignore <rule-id>                  — suppress one rule
  //   // pyreon-lint-disable-next-line                 — alias of `ignore`
  //   // pyreon-lint-disable-next-line <rule-id>       — alias of `ignore <rule-id>`
  // The `disable-next-line` form is the convention several rule docstrings
  // already document — we accept both so the docs and runtime match.
  // Word-boundary matching prevents typos like `// pyreon-lint-ignored` from
  // accidentally being treated as suppressions.
  const lines = sourceText.split('\n')
  const SUPPRESS_RE = /^\/\/\s*pyreon-lint-(?:ignore|disable-next-line)(?:\s+(\S+))?\s*$/
  const filtered = diagnostics.filter((d) => {
    const prevLineIdx = d.loc.line - 2
    if (prevLineIdx < 0) return true
    const prevLine = lines[prevLineIdx]?.trim() ?? ''
    const match = SUPPRESS_RE.exec(prevLine)
    if (!match) return true
    const ruleId = match[1]
    // Bare suppression (no rule id) → suppress every diagnostic on next line.
    if (!ruleId) return false
    // Rule-specific suppression → drop only the matching rule.
    return ruleId !== d.ruleId
  })

  filtered.sort((a, b) => a.span.start - b.span.start)
  return { filePath, diagnostics: filtered }
}

/**
 * Apply all auto-fixes to a source text.
 * Fixes are applied in reverse order to maintain correct offsets.
 */
/**
 * Normalize a single-or-multi-edit fix into a plain edit list.
 *
 * Exported because `Diagnostic.fix` is now `Fix | readonly Fix[]`: anything
 * reading `.span` / `.replacement` off a diagnostic must go through this
 * rather than assuming one edit.
 */
export function fixEdits(fix: RuleFix): Fix[] {
  return Array.isArray(fix) ? [...(fix as readonly Fix[])] : [fix as Fix]
}

/**
 * Apply auto-fixes to a source text.
 *
 * Two properties that were previously missing:
 *
 *  - **A fix may carry several edits.** "Replace this expression AND add the
 *    import it now needs" is one fix, and either edit alone leaves the file
 *    broken — so a fix is applied whole or not at all.
 *  - **Overlapping fixes are DEFERRED, not applied blind.** Two diagnostics
 *    touching the same range used to both be written, and the later one landed
 *    inside the earlier one's replacement — producing output matching neither
 *    intent. Now the first fix in source order wins and any fix overlapping an
 *    already-applied range is skipped, exactly as ESLint does; the diagnostic
 *    stays reported, so a second `--fix` pass picks it up once the conflict is
 *    gone.
 */
export function applyFixes(sourceText: string, diagnostics: Diagnostic[]): string {
  type Candidate = { edits: Fix[]; start: number; end: number }

  const candidates: Candidate[] = []
  for (const d of diagnostics) {
    if (!d.fix) continue
    const edits = fixEdits(d.fix)
    if (edits.length === 0) continue
    candidates.push({
      edits,
      start: Math.min(...edits.map((e) => e.span.start)),
      end: Math.max(...edits.map((e) => e.span.end)),
    })
  }
  if (candidates.length === 0) return sourceText

  // Source order, so "first one wins" is deterministic rather than
  // dependent on rule registration order.
  candidates.sort((a, b) => a.start - b.start || a.end - b.end)

  const applied: Fix[] = []
  let claimedUpTo = -1
  for (const c of candidates) {
    if (c.start < claimedUpTo) continue // overlaps something already applied
    applied.push(...c.edits)
    claimedUpTo = Math.max(claimedUpTo, c.end)
  }

  // Apply end-to-start so earlier offsets stay valid.
  applied.sort((a, b) => b.span.start - a.span.start)
  let result = sourceText
  for (const edit of applied) {
    result = result.slice(0, edit.span.start) + edit.replacement + result.slice(edit.span.end)
  }
  return result
}
