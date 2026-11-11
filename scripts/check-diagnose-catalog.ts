#!/usr/bin/env bun
/**
 * CI guard: a PR that ADDS OR EDITS a user-visible error or warning message in
 * the framework's error-surface source (`runtime-dom/`, `runtime-server/`,
 * `core/`, `compiler/`, `router/`) must leave that message matched by the
 * `ERROR_PATTERNS` catalog in `packages/core/compiler/src/diagnose.ts` — an
 * existing entry that already matches it, or a new entry — or carry the
 * `skip-diagnose-catalog` label.
 *
 * ## Why
 *
 * `pyreon doctor diagnose` + the MCP `diagnose` tool both pattern-match
 * user-facing error strings to surface fix suggestions. Every bug fix
 * in a framework subsystem that COULD have surfaced as a user-visible
 * error is an opportunity to teach the catalog. Without a CI gate, the
 * catalog silently stops growing while the framework's surface area
 * expands — `diagnose` returns "no match" more and more often, agents
 * call it fewer times, the loop closes.
 *
 * ## What counts as a "sensitive change"
 *
 * **Only real source-code changes** under one of the sensitive packages'
 * `src/` directories, with a `.ts` / `.tsx` extension, **excluding tests
 * and Storybook stories** — those are the files where a real bug fix
 * lives. Specifically NOT sensitive:
 *
 * - `package.json` — dep bumps, peer-dep widening, workspace-protocol
 *   cascades from a release PR's version sync. None of these introduce
 *   new error surface; a devDeps bump was the exact false-positive that
 *   prompted this refinement (#1166).
 * - `CHANGELOG.md`, `README.md`, `LICENSE` — documentation / release
 *   notes; never grow the catalog.
 * - `tsconfig.json`, `vitest.config.ts`, `vitest.browser.config.ts`,
 *   `vitest.shared.ts` — build / test config; not source code.
 * - Tests (`*.test.ts(x)`, `*.spec.ts(x)`, files under `src/tests/` or
 *   `src/__tests__/`) — a new regression test for an existing bug doesn't
 *   warrant a new catalog entry on its own; if a regression test ships
 *   alongside a real source-code fix, the source-code change triggers
 *   the gate independently.
 * - Storybook stories (`*.stories.ts(x)`) — render-side docs; no error
 *   surface.
 * - `src/manifest.ts` — the `defineManifest` docs-metadata source consumed
 *   by `gen-docs` (→ llms / MCP api-reference). It has zero runtime
 *   behavior and is stripped from the published tarball (`publish.ts`
 *   drops `src/`), so it can never introduce user-visible error surface.
 *   It's the one docs file that happens to be `.ts` — same bucket as
 *   CHANGELOG / README, which are already excluded by extension.
 * - Generated `lib/` output — gitignored, never committed; included here
 *   as defense-in-depth in case someone ever commits build output.
 *
 * The label-bypass + release-PR-auto-skip stay in place for the
 * legitimate "source did change, but no new error surface" cases
 * (perf-only refactor, type tightening, internal renames).
 *
 * ## History
 *
 * - First cut (#???) used `startsWith('packages/core/<pkg>/')` — matched
 *   every file in those packages including `package.json` / CHANGELOG /
 *   README / tests. Most non-source-fix PRs touching those packages
 *   needed `skip-diagnose-catalog` applied manually, defeating the
 *   gate's signal-to-noise ratio. The deps-bump PR #1166 triggered this
 *   even though no .ts file in those packages changed — a clear false
 *   positive that proved the detector was too coarse.
 * - This iteration narrows the detector to source files only, exposes
 *   the predicate as a pure function (`isSensitiveSourceFile`), and
 *   adds a unit-test surface in
 *   `packages/internals/test-utils/src/tests/check-diagnose-catalog.test.ts`.
 *   Same shape as `scripts/affected.ts` / `scripts/e2e-affected.ts`.
 *
 * ## What counts as a message (the demand comes from the diff's CONTENT)
 *
 * The first versions demanded catalog growth whenever a sensitive source file
 * changed at all. On 2026-11-10 that fired on 13 PRs, and more than ten of
 * them were perf-only changes that touched no message and needed the label.
 * A directory says nothing about error surface; a message string does. So the
 * gate lexes the base (merge-base) and HEAD content of each changed sensitive
 * file (`extractMessages`) and collects every string or template literal that
 *
 * - contains `[Pyreon]`, or
 * - is an argument of `new XError(…)` / `XError(…)`, `console.warn|error(…)`
 *   or a `warn…(` helper (`warn`, `warnOutsideSetup`, `_warnTextCoercion`), or
 * - follows `throw`, or is the value of a `message:` property,
 *
 * joining `+`-concatenated pieces and normalizing whitespace, quote escapes and
 * interpolations (`${}`). A HEAD message whose normalized text exists nowhere
 * at base is new or edited; one that was moved, re-quoted or re-wrapped is not.
 * The catalog file itself is excluded (its strings are diagnoses, not errors).
 *
 * ## Mechanics
 *
 * 1. Changed files via `git diff --no-renames <base>...HEAD`; a failure to
 *    compute it fails CLOSED.
 * 2. No sensitive file → pass. Release branch or label → pass.
 * 3. No new or edited message → pass (`skip-no-message-change`).
 * 4. Every new message matched by a HEAD `ERROR_PATTERNS` regex (tried with a
 *    few stand-ins for each `${}`) → pass.
 * 5. Otherwise the catalog must have grown, or the gate fails and names each
 *    unmatched message with its file and line.
 *
 * `--base=<rev> --head=<rev>` evaluates any two revisions without a checkout
 * (e.g. a merged PR's squash commit against its parent).
 */

import { gitChangedFilesZ } from './changed-files'
import { execFileSync } from 'node:child_process'
import { isTestPath } from './test-paths'

// ─── Pure exports (testable) ────────────────────────────────────────────────

// The `ERROR_PATTERNS` catalog lives in the browser-safe `diagnose.ts` module
// (extracted from `react-intercept.ts` so it loads without the TypeScript
// compiler API). This gate counts entries there.
export const CATALOG_FILE = 'packages/core/compiler/src/diagnose.ts'
export const CATALOG_MARKER = 'const ERROR_PATTERNS: ErrorPattern[] = ['

/** Packages whose source files form the framework's error surface. */
export const SENSITIVE_PACKAGES = [
  'runtime-dom',
  'runtime-server',
  'core',
  'compiler',
  'router',
] as const

/**
 * Whether a single changed-file path represents a real source-code
 * change in one of the sensitive packages. Pure function — exported for
 * unit-test coverage; the script's main path calls it via
 * `touchesSensitivePaths`.
 *
 * Rules:
 * - Must be under `packages/core/<sensitive>/src/`.
 * - Must end with `.ts` or `.tsx` (`.d.ts` is included by extension).
 * - Must NOT be test code — `isTestPath` (test/spec/story file OR a
 *   `tests/` / `__tests__/` directory at any depth). A new regression
 *   test for an existing bug doesn't need a catalog entry. Classified by
 *   the shared `scripts/test-paths.ts`, the SAME source of truth the
 *   changeset gate uses — one definition, no drift.
 */
export function isSensitiveSourceFile(file: string): boolean {
  // 1. Package + src/ prefix
  const inSensitiveSrc = SENSITIVE_PACKAGES.some((pkg) =>
    file.startsWith(`packages/core/${pkg}/src/`),
  )
  if (!inSensitiveSrc) return false

  // 2. TypeScript source extension
  if (!file.endsWith('.ts') && !file.endsWith('.tsx')) return false

  // 3. Exclude test code (shared classifier)
  if (isTestPath(file)) return false

  // 4. Exclude the docs-metadata manifest — `defineManifest` source consumed
  //    by gen-docs; zero runtime behavior, stripped from the tarball. Same
  //    "documentation, never grows the error catalog" bucket as README/CHANGELOG.
  if (file.endsWith('/src/manifest.ts')) return false

  return true
}

// ─── User-visible messages (what the gate actually asks about) ─────────────

/**
 * One user-visible message found in a source file. `text` is normalized so a
 * message that was only moved, re-quoted, re-wrapped or split across `+` keeps
 * the same identity: whitespace runs collapse to one space, quote escapes are
 * dropped, and every interpolation or non-literal operand becomes `${}`.
 */
export interface SourceMessage {
  text: string
  file: string
  line: number
}

type Tok =
  | { k: 'str'; text: string; line: number }
  | { k: 'regex'; body: string; flags: string; line: number }
  | { k: 'id'; text: string; line: number }
  | { k: 'num'; line: number }
  | { k: 'p'; text: string; line: number }

/** Keywords after which a `/` starts a regular expression, not a division. */
const REGEX_AFTER_KEYWORD = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw',
  'case', 'do', 'else', 'yield', 'await',
])

/**
 * A small TypeScript lexer: just enough to find string/template literals,
 * regex literals, identifiers and punctuation without mistaking a comment, a
 * regex or a division for a string. It runs without `node_modules` (the gate's
 * CI job installs nothing), which is why it is not the TypeScript parser.
 */
export function lexSource(src: string): Tok[] {
  const n = src.length
  let line = 1

  const readQuoted = (start: number): [string, number] => {
    const q = src[start]!
    let j = start + 1
    let text = ''
    while (j < n && src[j] !== q && src[j] !== '\n') {
      if (src[j] === '\\') {
        if (src[j + 1] === '\n') line++
        text += src.slice(j, j + 2)
        j += 2
      } else text += src[j++]
    }
    return [text, j + 1]
  }

  // A template literal from its opening backtick: its text with `${}` for each
  // interpolation, and the index after the closing backtick. Interpolations are
  // lexed as code (they can hold strings, regexes, templates and braces) into a
  // scratch list that is dropped.
  const readTemplate = (start: number): [string, number] => {
    let j = start + 1
    let text = ''
    while (j < n) {
      const c = src[j]!
      if (c === '\\') {
        if (src[j + 1] === '\n') line++
        text += src.slice(j, j + 2)
        j += 2
      } else if (c === '`') {
        return [text, j + 1]
      } else if (c === '$' && src[j + 1] === '{') {
        text += '${}'
        j = scan(j + 2, true, [])
      } else {
        if (c === '\n') line++
        text += c
        j++
      }
    }
    return [text, j]
  }

  // Lexes from `start` into `toks`. With `untilBrace`, stops after the `}`
  // that closes an interpolation (depth 0) and returns the index after it.
  function scan(start: number, untilBrace: boolean, toks: Tok[]): number {
    let i = start
    let depth = 0
    const regexAllowed = (): boolean => {
      const last = toks[toks.length - 1]
      if (!last) return true
      if (last.k === 'id') return REGEX_AFTER_KEYWORD.has(last.text)
      if (last.k === 'num' || last.k === 'str' || last.k === 'regex') return false
      return last.text !== ')' && last.text !== ']'
    }
    while (i < n) {
      const c = src[i]!
      if (c === '\n') {
        line++
        i++
      } else if (c === ' ' || c === '\t' || c === '\r') i++
      else if (c === '/' && src[i + 1] === '/') {
        const nl = src.indexOf('\n', i)
        i = nl === -1 ? n : nl
      } else if (c === '/' && src[i + 1] === '*') {
        const end = src.indexOf('*/', i + 2)
        const stop = end === -1 ? n : end + 2
        for (let j = i; j < stop; j++) if (src[j] === '\n') line++
        i = stop
      } else if (c === "'" || c === '"') {
        const startLine = line
        const [text, end] = readQuoted(i)
        toks.push({ k: 'str', text, line: startLine })
        i = end
      } else if (c === '`') {
        const startLine = line
        const [text, end] = readTemplate(i)
        toks.push({ k: 'str', text, line: startLine })
        i = end
      } else if (c === '/' && regexAllowed()) {
        let j = i + 1
        let inClass = false
        while (j < n && src[j] !== '\n') {
          const d = src[j]!
          if (d === '\\') j += 2
          else {
            if (d === '[') inClass = true
            else if (d === ']') inClass = false
            else if (d === '/' && !inClass) break
            j++
          }
        }
        const body = src.slice(i + 1, j)
        let k = j + 1
        while (k < n && /[a-z]/i.test(src[k]!)) k++
        toks.push({ k: 'regex', body, flags: src.slice(j + 1, k), line })
        i = k
      } else if (/[A-Za-z_$]/.test(c)) {
        let j = i + 1
        while (j < n && /[\w$]/.test(src[j]!)) j++
        toks.push({ k: 'id', text: src.slice(i, j), line })
        i = j
      } else if (/[0-9]/.test(c)) {
        let j = i + 1
        while (j < n && /[\w.]/.test(src[j]!)) j++
        toks.push({ k: 'num', line })
        i = j
      } else {
        if (untilBrace) {
          if (c === '{') depth++
          else if (c === '}' && depth-- === 0) return i + 1
        }
        toks.push({ k: 'p', text: c, line })
        i++
      }
    }
    return i
  }

  const toks: Tok[] = []
  scan(0, false, toks)
  return toks
}

/** Collapse a literal's raw text to its identity (see `SourceMessage`). */
export function normalizeMessage(raw: string): string {
  return raw.replace(/\\(['"`])/g, '$1').replace(/\s+/g, ' ').trim()
}

/**
 * Whether a call or constructor with this callee emits a user-visible message
 * through its arguments: `new XError(…)` / `XError(…)`, `console.warn|error(…)`,
 * any `warn…(` helper (`warn`, `warnOutsideSetup`, `_warnTextCoercion`, a
 * `logger.warn`), which is how the framework's dev warnings are written.
 */
function isMessageCallee(name: string | undefined, object: string | undefined): boolean {
  if (name === undefined) return false
  if (name.endsWith('Error')) return true
  if (object === 'console' && (name === 'warn' || name === 'error')) return true
  return /^_?warn/i.test(name)
}

/**
 * Every user-visible message in one source file: a string or template literal
 * (with `+`-joined pieces) that contains `[Pyreon]`, is an argument of a
 * message-emitting call (see `isMessageCallee`), follows `throw`, or is the
 * value of a `message:` property.
 */
export function extractMessages(source: string, file: string): SourceMessage[] {
  const toks = lexSource(source)
  const out: SourceMessage[] = []
  // One frame per open bracket; `(` frames remember whether their callee emits messages.
  const frames: boolean[] = []
  const isP = (t: Tok | undefined, text: string) => t?.k === 'p' && t.text === text
  let i = 0
  while (i < toks.length) {
    const t = toks[i]!
    if (t.k === 'p') {
      if (t.text === '(') {
        const prev = toks[i - 1]
        const name = prev?.k === 'id' ? prev.text : undefined
        const obj = isP(toks[i - 2], '.') && toks[i - 3]?.k === 'id' ? (toks[i - 3] as { text: string }).text : undefined
        frames.push(isMessageCallee(name, obj))
      } else if (t.text === '[' || t.text === '{') frames.push(false)
      else if (t.text === ')' || t.text === ']' || t.text === '}') frames.pop()
      i++
      continue
    }
    if (t.k !== 'str') {
      i++
      continue
    }
    // Build the `+`-joined group starting at this literal.
    let text = isP(toks[i - 1], '+') ? '${}' : ''
    text += t.text
    let j = i + 1
    while (isP(toks[j], '+')) {
      const next = toks[j + 1]
      if (next?.k === 'str') {
        text += next.text
        j += 2
        continue
      }
      if (next?.k !== 'id' && next?.k !== 'num') break
      // A simple operand: identifier(.identifier)* with optional call parens.
      j += 2
      while (isP(toks[j], '.') && toks[j + 1]?.k === 'id') j += 2
      if (isP(toks[j], '(')) {
        let depth = 0
        do {
          if (isP(toks[j], '(')) depth++
          else if (isP(toks[j], ')')) depth--
          j++
        } while (j < toks.length && depth > 0)
      }
      text += '${}'
    }
    const before = toks[i - 1]
    const inMessageCall = frames.length > 0 && frames[frames.length - 1] === true
    const afterThrow = before?.k === 'id' && before.text === 'throw'
    const messageProp = isP(before, ':') && toks[i - 2]?.k === 'id' && (toks[i - 2] as { text: string }).text === 'message'
    const normalized = normalizeMessage(text)
    if (normalized !== '' && (normalized.includes('[Pyreon]') || inMessageCall || afterThrow || messageProp)) {
      out.push({ text: normalized, file, line: t.line })
    }
    i = j
  }
  return out
}

/**
 * The regex of every `pattern:` in the `ERROR_PATTERNS` array of a catalog
 * source. Unparseable patterns are skipped (the count check still sees them).
 */
export function extractCatalogPatterns(source: string): RegExp[] {
  const start = source.indexOf(CATALOG_MARKER)
  if (start === -1) return []
  const toks = lexSource(source.slice(start + CATALOG_MARKER.length - 1))
  const out: RegExp[] = []
  let depth = 0
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]!
    if (t.k === 'p' && t.text === '[') depth++
    else if (t.k === 'p' && t.text === ']' && --depth === 0) break
    else if (t.k === 'regex' && toks[i - 1]?.k === 'p' && (toks[i - 1] as { text: string }).text === ':') {
      const key = toks[i - 2]
      if (key?.k !== 'id' || key.text !== 'pattern') continue
      try {
        out.push(new RegExp(t.body, t.flags))
      } catch {
        /* not a pattern this lexer can rebuild; ignore */
      }
    }
  }
  return out
}

/** Stand-ins for `${}` when asking whether a catalog pattern matches a message. */
const PLACEHOLDER_SAMPLES = ['x', 'foo', 'Foo', '0', '']

/** Whether any catalog pattern matches the message for some interpolated value. */
export function isCatalogued(message: string, patterns: readonly RegExp[]): boolean {
  return PLACEHOLDER_SAMPLES.some((s) => {
    const sample = message.split('${}').join(s)
    return patterns.some((p) => {
      p.lastIndex = 0
      return p.test(sample)
    })
  })
}

export interface FileSources {
  path: string
  /** Content at the base ref, or null when the file is new. */
  base: string | null
  /** Content at HEAD, or null when the file was deleted. */
  head: string | null
}

/**
 * Messages present at HEAD whose normalized text exists nowhere at base among
 * the sensitive files the PR touched. A message that was moved, re-quoted,
 * re-wrapped or split differently has the same text on both sides, so it is not
 * new; an edited message is. The catalog file itself is not an error surface.
 */
export function newMessages(sources: readonly FileSources[]): SourceMessage[] {
  const relevant = sources.filter((s) => isSensitiveSourceFile(s.path) && s.path !== CATALOG_FILE)
  const baseTexts = new Set<string>()
  for (const s of relevant) if (s.base !== null) for (const m of extractMessages(s.base, s.path)) baseTexts.add(m.text)
  const seen = new Set<string>()
  const out: SourceMessage[] = []
  for (const s of relevant) {
    if (s.head === null) continue
    for (const m of extractMessages(s.head, s.path)) {
      if (baseTexts.has(m.text) || seen.has(m.text)) continue
      seen.add(m.text)
      out.push(m)
    }
  }
  return out
}

/** True if ANY file in the list is a sensitive source-code change. */
export function touchesSensitivePaths(files: string[]): boolean {
  return files.some(isSensitiveSourceFile)
}

/**
 * Return the human-readable list of sensitive packages touched (one
 * entry per package whose src/ had a real source-code change). Used in
 * the log line so failure messages name what triggered the gate.
 */
export function sensitivePackagesTouched(files: string[]): string[] {
  const hits = new Set<string>()
  for (const file of files) {
    if (!isSensitiveSourceFile(file)) continue
    for (const pkg of SENSITIVE_PACKAGES) {
      if (file.startsWith(`packages/core/${pkg}/src/`)) {
        hits.add(`packages/core/${pkg}/`)
        break
      }
    }
  }
  return [...hits].sort()
}

/**
 * Count `ERROR_PATTERNS` entries in a snapshot of `diagnose.ts`.
 * Strategy: find the marker, then count `pattern:` keys inside the
 * array literal. Each `ErrorPattern` entry has exactly one `pattern:`
 * key by the type contract `{ pattern; diagnose; }`.
 *
 * Returns -1 if the marker is missing or the array can't be parsed —
 * the caller treats that as a hard fail (the catalog file's shape
 * changed and the script needs updating).
 */
export function countCatalogEntries(source: string): number {
  const start = source.indexOf(CATALOG_MARKER)
  if (start === -1) return -1
  // Walk forward to find the closing `]`. Start AT the `[` (last char
  // of the marker), not after — `source[arrayStart] === '['` is asserted.
  const arrayStart = start + CATALOG_MARKER.length - 1
  if (source[arrayStart] !== '[') return -1
  let depth = 0
  let arrayEnd = -1
  for (let i = arrayStart; i < source.length; i++) {
    const c = source[i]
    if (c === '[') depth++
    else if (c === ']') {
      depth--
      if (depth === 0) {
        arrayEnd = i
        break
      }
    }
  }
  if (arrayEnd === -1) return -1
  const region = source.slice(arrayStart, arrayEnd)
  const matches = region.match(/^\s*pattern:/gm)
  return matches?.length ?? 0
}

// ─── Side-effecting helpers ─────────────────────────────────────────────────

/**
 * `git diff` / `git show` runner. Uses `execFileSync` (no shell parsing)
 * with discrete argv so even an unexpected character in a sanitized value
 * can't be interpreted as a shell metacharacter — defense in depth on
 * top of the BASE_REF allowlist.
 */
function git(...args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}

/**
 * The changed files, or `null` when the diff could not be OBTAINED.
 *
 * The distinction is the whole point. This used to `catch { return [] }`, which
 * makes a git failure indistinguishable from "this PR touched nothing relevant"
 * — and the caller then printed a POSITIVE assertion about a diff it never had:
 *
 *   $ BASE_REF=this-ref-does-not-exist bun scripts/check-diagnose-catalog.ts
 *   fatal: ambiguous argument 'origin/this-ref-does-not-exist...HEAD'
 *   [check-diagnose-catalog] PR does not touch any published package source
 *   EXIT=0
 *
 * on a PINNED REQUIRED check. Not firing in CI today (`fetch-depth: 0` resolves
 * `origin/main`), but live for a shallow clone, a non-`origin` remote, a renamed
 * base branch, and any local run in a clone lacking the ref — i.e. exactly the
 * situations where a human is least likely to read the log.
 */
function changedFiles(baseRev: string, headRev: string): string[] | null {
  // `git diff --name-only` requires the merge-base form `<base>...<head>`
  // to compare only commits unique to HEAD, not the union of both
  // branches' changes since divergence.
  try {
    // `--no-renames`: a file moved OUT of a sensitive package must still count.
    return gitChangedFilesZ(`${baseRev}...${headRev}`, { args: ['--no-renames'] })
  } catch (err) {
    // Loud, and NOT an empty diff.
    console.error(
      `[check-diagnose-catalog] could not compute the diff against ${baseRev}: ` +
        `${err instanceof Error ? err.message : String(err)}`,
    )
    return null
  }
}

/** The merge-base the `...` diff compares against, or null when git cannot find it. */
function mergeBase(baseRev: string, headRev: string): string | null {
  try {
    return git('merge-base', baseRev, headRev) || null
  } catch {
    return null
  }
}

/** A file's content at a revision, or null when it does not exist there. */
function readFileAt(ref: string, path: string): string | null {
  try {
    return execFileSync('git', ['show', `${ref}:${path}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 64 * 1024 * 1024,
    })
  } catch {
    return null
  }
}

// ─── Main runner ────────────────────────────────────────────────────────────

/**
 * Result of evaluating the gate against a set of inputs. Pure data —
 * the side-effecting runner converts this to console output + exit code.
 */
export type GateResult =
  | { kind: 'skip-no-sensitive-files' }
  | { kind: 'skip-release-pr'; headRef: string }
  | { kind: 'skip-label' }
  | { kind: 'skip-no-message-change'; touched: string[] }
  | { kind: 'skip-missing-base-catalog' }
  | { kind: 'fail-parse'; baseCount: number; headCount: number }
  | { kind: 'fail-missing-head-catalog' }
  | { kind: 'fail-uncatalogued'; baseCount: number; headCount: number; uncovered: SourceMessage[] }
  | { kind: 'ok-covered'; messages: number }
  | { kind: 'ok'; baseCount: number; headCount: number; messages: number }

export interface GateInputs {
  files: string[]
  /** Base and HEAD content of every changed sensitive file. */
  sources: FileSources[]
  hasSkipLabel: boolean
  headRef: string
  baseSource: string | null
  headSource: string | null
}

/**
 * Pure policy evaluator. All side-effecting reads (git, env) happen in
 * `main()`; the result is computed here from plain data so the unit
 * tests can drive every branch without spawning a subprocess.
 *
 * The demand comes from the diff's CONTENT: a sensitive file changing is not
 * enough, a user-visible message must be new or edited (`newMessages`). Such a
 * message passes when a HEAD catalog pattern already matches it, or when the
 * catalog grew in this PR.
 */
export function evaluateGate(inp: GateInputs): GateResult {
  if (!touchesSensitivePaths(inp.files)) {
    return { kind: 'skip-no-sensitive-files' }
  }

  if (inp.headRef.startsWith('changeset-release/')) {
    return { kind: 'skip-release-pr', headRef: inp.headRef }
  }

  if (inp.hasSkipLabel) {
    return { kind: 'skip-label' }
  }

  const added = newMessages(inp.sources)
  if (added.length === 0) {
    return { kind: 'skip-no-message-change', touched: sensitivePackagesTouched(inp.files) }
  }

  if (inp.baseSource === null) {
    return { kind: 'skip-missing-base-catalog' }
  }

  if (inp.headSource === null) {
    return { kind: 'fail-missing-head-catalog' }
  }

  const baseCount = countCatalogEntries(inp.baseSource)
  const headCount = countCatalogEntries(inp.headSource)

  if (baseCount < 0 || headCount < 0) {
    return { kind: 'fail-parse', baseCount, headCount }
  }

  const patterns = extractCatalogPatterns(inp.headSource)
  const uncovered = added.filter((m) => !isCatalogued(m.text, patterns))
  if (uncovered.length === 0) {
    return { kind: 'ok-covered', messages: added.length }
  }

  if (headCount > baseCount) {
    return { kind: 'ok', baseCount, headCount, messages: added.length }
  }

  return { kind: 'fail-uncatalogued', baseCount, headCount, uncovered }
}

/**
 * BASE_REF / HEAD_REF allowlist. Both are supplied by CI from
 * `github.event.pull_request.{base,head}.ref` — attacker-influenceable
 * (a PR can target any base / head branch). Validate against a strict
 * regex before any shell use to close the CodeQL "Indirect uncontrolled
 * command line" finding (a malicious value like `main; rm -rf /` would
 * otherwise reach the shell).
 */
const REF_ALLOWLIST = /^[a-zA-Z0-9._/-]+$/

function main(): void {
  const RAW_BASE_REF = process.env['BASE_REF'] || 'main'
  if (!REF_ALLOWLIST.test(RAW_BASE_REF)) {
    console.error(
      `[check-diagnose-catalog] FAILED — BASE_REF "${RAW_BASE_REF}" contains characters outside the allowed set [a-zA-Z0-9._/-]. Refusing to use it.`,
    )
    process.exit(1)
  }
  const BASE_REF = RAW_BASE_REF

  const RAW_HEAD_REF = process.env['HEAD_REF'] || ''
  const HEAD_REF = REF_ALLOWLIST.test(RAW_HEAD_REF) ? RAW_HEAD_REF : ''
  const HAS_SKIP_LABEL = process.env['HAS_SKIP_LABEL'] === 'true'

  // `--base=<rev>` / `--head=<rev>` evaluate any two revisions (e.g. a merged
  // PR's squash commit against its parent) without checking them out.
  const argRev = (name: string): string | undefined => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
    const value = hit?.slice(name.length + 3)
    if (value !== undefined && !/^[a-zA-Z0-9._/^~-]+$/.test(value)) {
      console.error(`[check-diagnose-catalog] FAILED — --${name} "${value}" is not a plain revision.`)
      process.exit(1)
    }
    return value
  }
  const baseRev = argRev('base') ?? `origin/${BASE_REF}`
  const headRev = argRev('head') ?? 'HEAD'

  const files = changedFiles(baseRev, headRev)
  const base = files === null ? null : mergeBase(baseRev, headRev)
  if (files === null || base === null) {
    // Fail CLOSED. A gate that cannot see the diff has verified nothing, and
    // this one is a pinned required check — reporting success here asserts a
    // fact about a diff that was never obtained.
    console.error(
      `[check-diagnose-catalog] REFUSING to pass: the diff could not be computed, so this gate ` +
        `verified NOTHING. Check that ${baseRev} exists in this clone ` +
        `(CI uses fetch-depth: 0; a shallow clone or a renamed base branch will not have it).`,
    )
    process.exit(1)
  }
  // Contents at the merge-base, not the base branch tip: a message main edited
  // after this branch forked must not read as this PR's change.
  const sources: FileSources[] = files.filter(isSensitiveSourceFile).map((path) => ({
    path,
    base: readFileAt(base, path),
    head: readFileAt(headRev, path),
  }))
  const baseSource = readFileAt(base, CATALOG_FILE)
  const headSource = readFileAt(headRev, CATALOG_FILE)

  const result = evaluateGate({
    files,
    sources,
    hasSkipLabel: HAS_SKIP_LABEL,
    headRef: HEAD_REF,
    baseSource,
    headSource,
  })

  switch (result.kind) {
    case 'skip-no-sensitive-files':
      console.log(
        '[check-diagnose-catalog] PR does not touch framework error-surface source files — gate not applicable.',
      )
      process.exit(0)
      break

    case 'skip-release-pr':
      console.log(
        `[check-diagnose-catalog] Branch \`${result.headRef}\` is the changesets-action release PR — auto-skipping the gate (version bumps + CHANGELOGs never grow the error catalog).`,
      )
      process.exit(0)
      break

    case 'skip-label':
      console.log(
        '[check-diagnose-catalog] skip-diagnose-catalog label present — bypassing the gate.',
      )
      process.exit(0)
      break

    case 'skip-missing-base-catalog':
      console.log(
        `[check-diagnose-catalog] Could not read \`${CATALOG_FILE}\` at the merge-base with ${baseRev} — skipping (likely a first-time-add of the catalog file).`,
      )
      process.exit(0)
      break

    case 'fail-missing-head-catalog':
      console.error(
        `[check-diagnose-catalog] FAILED — \`${CATALOG_FILE}\` not present at HEAD. The catalog must exist for the diagnose tool to work.`,
      )
      process.exit(1)
      break

    case 'fail-parse':
      console.error(
        `[check-diagnose-catalog] FAILED — could not parse ERROR_PATTERNS array (base=${result.baseCount} head=${result.headCount}). The catalog file structure may have changed; update the marker in this script.`,
      )
      process.exit(1)
      break

    case 'skip-no-message-change':
      console.log(
        `[check-diagnose-catalog] Sensitive source touched (${result.touched.join(', ')}), but no ` +
          'user-visible error or warning message was added or changed — gate not applicable.',
      )
      process.exit(0)
      break

    case 'ok-covered':
      console.log(
        `[check-diagnose-catalog] OK — ${result.messages} new or edited message(s), each already matched by an ERROR_PATTERNS entry.`,
      )
      process.exit(0)
      break

    case 'ok':
      console.log(
        `[check-diagnose-catalog] OK — ${result.messages} new or edited message(s); catalog grew by ${result.headCount - result.baseCount} entry(s). base=${result.baseCount} → head=${result.headCount}.`,
      )
      process.exit(0)
      break

    case 'fail-uncatalogued':
      console.error(
        `[check-diagnose-catalog] FAILED — this PR adds or edits ${result.uncovered.length} user-visible ` +
          'message(s) that no ERROR_PATTERNS entry matches:',
      )
      for (const m of result.uncovered.slice(0, 20)) {
        console.error(`  ${m.file}:${m.line}  ${JSON.stringify(m.text)}`)
      }
      if (result.uncovered.length > 20) console.error(`  … and ${result.uncovered.length - 20} more`)
      console.error('')
      console.error(
        `Add an entry to \`ERROR_PATTERNS\` in \`${CATALOG_FILE}\` whose pattern matches the message`,
      )
      console.error('(and a test for it), so `pyreon doctor diagnose` and the MCP `diagnose` tool can explain it:')
      console.error('')
      console.error('  {')
      console.error("    pattern: /your-error-regex/,")
      console.error("    diagnose: () => ({ cause: '...', fix: '...', fixCode: '...' }),")
      console.error('  },')
      console.error('')
      console.error(
        "If the message is not one a user can act on (an internal invariant, a debug string), add the",
      )
      console.error("'skip-diagnose-catalog' label to bypass.")
      console.error(
        `[check-diagnose-catalog] ERROR_PATTERNS entries: base=${result.baseCount} → head=${result.headCount}.`,
      )
      process.exit(1)
      break
  }
}

// Only run main() when invoked as a script — `import {} from './check-diagnose-catalog'`
// from a test doesn't trigger the runner.
//
// Bun + Node both expose `import.meta.main` (Bun) / `require.main === module` (Node).
// We use `import.meta.url === 'file:///<argv[1]>'`-style detection here because the
// script ships as ESM under `type: module`. Falling back: if `process.argv[1]` ends
// with this filename, run; otherwise the import is from a test and we no-op.
const isScriptInvocation =
  typeof process.argv[1] === 'string' &&
  process.argv[1].endsWith('check-diagnose-catalog.ts')

if (isScriptInvocation) {
  main()
}
