import { detectPlain, transformPlain } from '@pyreon/compiler/plain'
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
  SourceComment,
  VisitorCallbacks,
} from './types'
import { JS_EXTENSIONS } from './utils/index'
import { LineIndex } from './utils/source'
import { validateRuleOptions } from './utils/validate-options'
import { matchesExemptPath } from './utils/exempt-paths'
import { type FileRole, resolveFileRole, roleMatches } from './utils/file-roles'

/**
 * Merge project-wide `settings` under a rule's own options.
 *
 * Only keys the rule DECLARES in `meta.schema` are seeded. Without that filter
 * a shared key would land on every rule and be reported as an unknown option
 * by the ones that never asked for it — turning a convenience into noise.
 */
function seedFromSettings(
  rule: Rule,
  own: RuleOptions,
  settings: RuleOptions | undefined,
): RuleOptions {
  if (!settings) return own
  const schema = rule.meta.schema
  if (!schema) return own
  let seeded: RuleOptions | undefined
  for (const key of Object.keys(schema)) {
    if (!(key in settings)) continue
    if (key in own) continue
    seeded ??= { ...own }
    ;(seeded as Record<string, unknown>)[key] = (settings as Record<string, unknown>)[key]
  }
  return seeded ?? own
}

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
  comments: readonly SourceComment[] = [],
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
    getComments() {
      return comments
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
/**
 * Run `meta.plainLowered` rules on the compiled form of a Plain Mode file and
 * map their findings back to the source. The pre-pass is line-preserving, so
 * the LINE is exact; the column is clamped to the source line's length.
 */
function lintPlainLowered(
  filePath: string,
  sourceText: string,
  entries: Array<{ rule: Rule; severity: Severity; options: RuleOptions }>,
  out: Diagnostic[],
): void {
  if (!detectPlain(sourceText)) return
  let lowered: string
  try {
    const r = transformPlain(sourceText, filePath)
    if (!r) return
    lowered = r.code
  } catch {
    return
  }
  let program: any
  try {
    program = parseSync(filePath, lowered, { sourceType: 'module', lang: getLang(getExtension(filePath)) }).program
  } catch {
    return
  }
  const lowIndex = new LineIndex(lowered)
  const found: Diagnostic[] = []
  const callbacks = entries.map(({ rule, severity, options }) =>
    rule.create(createRuleContext(rule, severity, options, found, lowIndex, lowered, filePath)),
  )
  new Visitor(mergeCallbacks(callbacks)).visit(program)
  if (found.length === 0) return

  const srcIndex = new LineIndex(sourceText)
  const lineStarts = [0]
  for (let i = 0; i < sourceText.length; i++) if (sourceText.charCodeAt(i) === 10) lineStarts.push(i + 1)
  for (const d of found) {
    const start0 = lineStarts[d.loc.line - 1]
    if (start0 === undefined) continue
    const lineEndIdx = sourceText.indexOf('\n', start0)
    const lineEnd = lineEndIdx === -1 ? sourceText.length : lineEndIdx
    const start = Math.min(start0 + d.loc.column, lineEnd)
    const end = Math.min(start + (d.span.end - d.span.start), lineEnd)
    // The same finding on the same line from the source walk wins.
    if (out.some((x) => x.ruleId === d.ruleId && x.loc.line === d.loc.line)) continue
    out.push({
      ...d,
      message: `${d.message} (Plain Mode: found in this file's compiled form)`,
      span: { start, end: Math.max(end, start) },
      loc: srcIndex.locate(start),
      fix: undefined,
    })
  }
}

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
  let comments: readonly SourceComment[] | undefined
  const cached = cache?.get(sourceText)
  if (cached?.comments) {
    lineIndex = cached.lineIndex
    program = cached.program
    comments = cached.comments
  } else {
    lineIndex = new LineIndex(sourceText)
    try {
      const result = parseSync(filePath, sourceText, {
        sourceType: 'module',
        lang: getLang(ext),
      })
      program = result.program
      comments = result.comments as readonly SourceComment[]
    } catch {
      return { filePath, diagnostics: [] }
    }
    cache?.set(sourceText, { program, lineIndex, comments })
  }

  const directives = readFileDirectives(sourceText, lineIndex)
  let generated: boolean | undefined
  const isGenerated = (): boolean => (generated ??= isGeneratedSource(sourceText))

  const diagnostics: Diagnostic[] = []
  // Resolved at most once per file, and only when a rule actually asks.
  let cachedRole: FileRole | undefined
  const fileRole = (): FileRole => (cachedRole ??= resolveFileRole(filePath, sourceText))

  // Filter to enabled rules and create visitor callbacks
  const allCallbacks: VisitorCallbacks[] = []
  const plainLoweredRules: Array<{ rule: Rule; severity: Severity; options: RuleOptions }> = []
  for (const rule of rules) {
    const entry = config.rules[rule.meta.id]
    if (entry === undefined) continue
    // Normalize bare severity vs `[severity, options]` tuple.
    const [severity, ownOptions]: [Severity, RuleOptions] = Array.isArray(entry)
      ? [entry[0] as Severity, (entry[1] ?? {}) as RuleOptions]
      : [entry as Severity, {}]
    if (severity === 'off') continue

    // Seed project-wide `settings` into this rule's options, but ONLY for keys
    // the rule's own schema declares — a shared key must never reach a rule
    // that would reject it as unknown. The rule's own options win.
    const options = seedFromSettings(rule, ownOptions, config.settings)

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

    // Role gate, also central. A rule declares WHICH file roles it is about
    // (`appliesTo`) and the runner decides — the same correction `exemptPaths`
    // needed. Implemented per rule it would be forgotten per rule, and a
    // forgotten role gate is silent: the rule simply runs where it should not.
    if (rule.meta.appliesTo && !roleMatches(rule.meta.appliesTo, fileRole())) continue

    // A generated file is never edited by hand, so a finding about how it
    // READS cannot be acted on. Central, like the two gates above.
    if (rule.meta.skipGenerated && isGenerated()) continue

    // `// pyreon-lint-disable-file <id> -- reason` turns the rule off for the
    // whole file. Skipping `create()` is cheaper than filtering findings, and
    // it is exactly what the directive says.
    if (directives.disabledRules.has(rule.meta.id) || directives.disableAll) continue

    const ctx = createRuleContext(
      rule,
      severity,
      options,
      diagnostics,
      lineIndex,
      sourceText,
      filePath,
      comments,
    )
    allCallbacks.push(rule.create(ctx))
    if (rule.meta.plainLowered) plainLoweredRules.push({ rule, severity, options })
  }

  // Walk the AST
  const visitor = new Visitor(mergeCallbacks(allCallbacks))
  visitor.visit(program)

  if (plainLoweredRules.length > 0) {
    lintPlainLowered(filePath, sourceText, plainLoweredRules, diagnostics)
  }

  // Filter suppressed diagnostics. Two equivalent comment syntaxes:
  //   // pyreon-lint-ignore                            — suppress all on next line
  //   // pyreon-lint-ignore <rule-id>                  — suppress one rule
  //   // pyreon-lint-disable-next-line                 — alias of `ignore`
  //   // pyreon-lint-disable-next-line <rule-id>       — alias of `ignore <rule-id>`
  // Each form accepts a comma list of ids and a trailing `-- reason`:
  //   // pyreon-lint-disable-next-line pyreon/max-jsx-depth -- table layout, see #123
  // The `disable-next-line` form is the convention several rule docstrings
  // already document — we accept both so the docs and runtime match.
  // Word-boundary matching prevents typos like `// pyreon-lint-ignored` from
  // accidentally being treated as suppressions.
  const lines = sourceText.split('\n')
  const filtered = diagnostics.filter((d) => {
    const prevLineIdx = d.loc.line - 2
    if (prevLineIdx < 0) return true
    const prevLine = lines[prevLineIdx]?.trim() ?? ''
    const directive = parseSuppression(prevLine)
    if (!directive) return true
    // Bare suppression (no rule id) → suppress every diagnostic on next line.
    if (directive.ruleIds.length === 0) return false
    // Rule-specific suppression → drop only the matching rules.
    return !directive.ruleIds.includes(d.ruleId)
  })
  // A file-level disable that gives no reason is ignored, and says so: an
  // opt-out nobody can explain is the one nobody can ever remove.
  filtered.push(...directives.problems)

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
  const applied = selectFixEdits(diagnostics)
  if (applied.length === 0) return sourceText
  // Apply end-to-start so earlier offsets stay valid.
  const ordered = [...applied].sort((a, b) => b.span.start - a.span.start)
  let result = sourceText
  for (const edit of ordered) {
    result = result.slice(0, edit.span.start) + edit.replacement + result.slice(edit.span.end)
  }
  return result
}

/**
 * The edits `applyFixes` would make, in source order — whole fixes only, the
 * first of two overlapping fixes wins, and IDENTICAL edits collapse to one.
 *
 * The collapse matters for zero-width insertions: two rules that both want a
 * blank line before the same `return` (the component-section rule and the
 * return rule) each insert `\n` at the same offset. Applying both would give
 * two blank lines; they are one intent, so they are one edit.
 *
 * Exported so the LSP can turn the same selection into editor `TextEdit`s
 * instead of replacing the whole document.
 */
export function selectFixEdits(diagnostics: readonly Diagnostic[]): Fix[] {
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
  if (candidates.length === 0) return []

  // Source order, so "first one wins" is deterministic rather than
  // dependent on rule registration order.
  candidates.sort((a, b) => a.start - b.start || a.end - b.end)

  const applied: Fix[] = []
  const seen = new Set<string>()
  let claimedUpTo = -1
  for (const c of candidates) {
    const keys = c.edits.map((e) => `${e.span.start}:${e.span.end}:${e.replacement}`)
    // Every edit already made by an earlier fix → the same intent; skip it.
    if (keys.every((k) => seen.has(k))) continue
    if (c.start < claimedUpTo) continue // overlaps something already applied
    applied.push(...c.edits)
    for (const k of keys) seen.add(k)
    claimedUpTo = Math.max(claimedUpTo, c.end)
  }
  return applied
}

// ── Suppression directives ──────────────────────────────────────────────────

/** Parsed `// pyreon-lint-…` directive: rule ids (empty = all) and the stated reason. */
interface Suppression {
  ruleIds: string[]
  reason: string | undefined
}

const NEXT_LINE_RE = /^\/\/\s*pyreon-lint-(?:ignore|disable-next-line)(?=\s|$)(.*)$/
const FILE_RE = /^\/\/\s*pyreon-lint-disable-file(?=\s|$)(.*)$/

/**
 * Split a directive's tail into rule ids and a `-- reason`.
 * `" pyreon/a, pyreon/b -- why"` → `{ ruleIds: ['pyreon/a', 'pyreon/b'], reason: 'why' }`.
 */
function parseDirectiveTail(tail: string): Suppression {
  const dash = tail.search(/(?:^|\s)--(?:\s|$)/)
  const idsPart = dash === -1 ? tail : tail.slice(0, dash)
  const reasonPart = dash === -1 ? '' : tail.slice(dash).replace(/^\s*--/, '').trim()
  const ruleIds = idsPart
    .split(/[\s,]+/)
    .map((x) => x.trim())
    .filter(Boolean)
  return { ruleIds, reason: reasonPart || undefined }
}

/** `// pyreon-lint-disable-next-line [ids] [-- reason]` on a trimmed line, or null. */
export function parseSuppression(trimmedLine: string): Suppression | null {
  const m = NEXT_LINE_RE.exec(trimmedLine)
  if (!m) return null
  return parseDirectiveTail(m[1] ?? '')
}

interface FileDirectives {
  disabledRules: Set<string>
  disableAll: boolean
  /** Findings about malformed directives (a file-level disable with no reason). */
  problems: Diagnostic[]
}

const NO_DIRECTIVES: FileDirectives = { disabledRules: new Set(), disableAll: false, problems: [] }

/**
 * Read every `// pyreon-lint-disable-file <ids> -- <reason>` line.
 *
 * The reason is MANDATORY. A whole-file opt-out silences a rule for code that
 * does not exist yet, so the next reader needs to know why it is there and
 * when it can go. A directive without one is not honoured, and the runner adds
 * a finding that says what to write.
 */
function readFileDirectives(sourceText: string, lineIndex: LineIndex): FileDirectives {
  if (!sourceText.includes('pyreon-lint-disable-file')) return NO_DIRECTIVES
  const out: FileDirectives = { disabledRules: new Set(), disableAll: false, problems: [] }
  let offset = 0
  for (const raw of sourceText.split('\n')) {
    const lineStart = offset
    offset += raw.length + 1
    const trimmed = raw.trim()
    const m = FILE_RE.exec(trimmed)
    if (!m) continue
    const { ruleIds, reason } = parseDirectiveTail(m[1] ?? '')
    if (!reason) {
      const start = lineStart + raw.indexOf(trimmed)
      out.problems.push({
        ruleId: 'pyreon-lint/disable-file-reason',
        severity: 'warn',
        message:
          'Give this file-level disable a reason: `// pyreon-lint-disable-file <rule-id> -- <why>`. ' +
          'Without one it is ignored, because nobody could ever tell when it is safe to remove.',
        span: { start, end: start + trimmed.length },
        loc: lineIndex.locate(start),
      })
      continue
    }
    if (ruleIds.length === 0) out.disableAll = true
    for (const id of ruleIds) out.disabledRules.add(id)
  }
  return out
}

const GENERATED_RE = /@generated\b|\bGENERATED\b[^\n]*\bby\b|\bdo not edit\b/i

/**
 * Does the file declare itself generated in its first three lines?
 * (`// @generated`, `// GENERATED by scripts/x.ts`, `/* Do not edit *\/`)
 */
export function isGeneratedSource(sourceText: string): boolean {
  let end = -1
  for (let i = 0; i < 3; i++) {
    const next = sourceText.indexOf('\n', end + 1)
    if (next === -1) {
      end = sourceText.length
      break
    }
    end = next
  }
  return GENERATED_RE.test(sourceText.slice(0, end))
}
