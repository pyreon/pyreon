import { parseSync, Visitor } from 'oxc-parser'
import type { AstCache } from './cache'
import type {
  ConfigDiagnostic,
  Diagnostic,
  LintConfig,
  LintFileResult,
  Rule,
  RuleContext,
  RuleOptions,
  Severity,
  VisitorCallbacks,
} from './types'
import { JS_EXTENSIONS } from './utils/index'
import { LineIndex } from './utils/source'
import { validateRuleOptions } from './utils/validate-options'

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
    let cached = VALIDATION_CACHE.get(cacheKey)
    if (!cached) {
      const { errors, warnings } = validateRuleOptions(rule, options)
      const configDiags: ConfigDiagnostic[] = []
      for (const message of warnings) {
        configDiags.push({ ruleId: rule.meta.id, severity: 'warn', message })
      }
      for (const message of errors) {
        configDiags.push({ ruleId: rule.meta.id, severity: 'error', message })
      }
      cached = { ok: errors.length === 0, diagnostics: configDiags }
      VALIDATION_CACHE.set(cacheKey, cached)
    }
    // Surface config diagnostics once per (rule, options) pair: prefer
    // the caller-supplied sink (so `lint()` can put them on LintResult);
    // fall back to stderr for standalone `lintFile` usage.
    if (cached.diagnostics.length > 0) {
      if (configDiagnosticsSink) {
        // Dedupe within the sink by (ruleId, message) so two different rules
        // that happen to produce an identical message don't collapse.
        for (const d of cached.diagnostics) {
          if (
            !configDiagnosticsSink.some(
              (x) => x.ruleId === d.ruleId && x.message === d.message,
            )
          ) {
            configDiagnosticsSink.push(d)
          }
        }
      } else {
        for (const d of cached.diagnostics) {
          // oxlint-disable-next-line no-console
          const emit = d.severity === 'error' ? console.error : console.warn
          emit(`[pyreon-lint] ${d.message}`)
        }
      }
    }
    // Hard error in options → skip this rule entirely for the run.
    if (!cached.ok) continue

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
  const lines = sourceText.split('\n')
  const SUPPRESS_PREFIXES = ['// pyreon-lint-ignore', '// pyreon-lint-disable-next-line']
  const filtered = diagnostics.filter((d) => {
    const prevLineIdx = d.loc.line - 2
    if (prevLineIdx < 0) return true
    const prevLine = lines[prevLineIdx]?.trim() ?? ''
    const matchedPrefix = SUPPRESS_PREFIXES.find((p) => prevLine.startsWith(p))
    if (!matchedPrefix) return true
    const rest = prevLine.slice(matchedPrefix.length).trim()
    return rest.length > 0 && rest !== d.ruleId
  })

  filtered.sort((a, b) => a.span.start - b.span.start)
  return { filePath, diagnostics: filtered }
}

/**
 * Apply all auto-fixes to a source text.
 * Fixes are applied in reverse order to maintain correct offsets.
 */
export function applyFixes(sourceText: string, diagnostics: Diagnostic[]): string {
  const fixable = diagnostics.filter((d) => d.fix !== undefined)
  if (fixable.length === 0) return sourceText

  // Sort by start position descending (apply from end to start)
  const sorted = [...fixable].sort((a, b) => {
    const aFix = a.fix
    const bFix = b.fix
    if (!aFix || !bFix) return 0
    return bFix.span.start - aFix.span.start
  })

  let result = sourceText
  for (const diag of sorted) {
    const fix = diag.fix
    if (!fix) continue
    result = result.slice(0, fix.span.start) + fix.replacement + result.slice(fix.span.end)
  }

  return result
}
