// A shell function in a workflow `run:` block must be DEFINED before it is CALLED.
//
// ## Why this gate exists
//
// Shell has no hoisting. A function is a runtime binding created when its
// definition executes, so calling it earlier in the same script is
// `command not found` and exit 127.
//
// That is trivially obvious and still shipped. `ci.yml`'s matrix step has two
// exits: an early one for non-`pull_request` events, and the main one for PRs.
// A refactor moved the `batch()` helper's callers into BOTH, but left the
// definition below the early exit. Every pull request ran the definition first
// and passed; every push to `main` hit the early exit and died at
// `line 21: batch: command not found`. The gate that would have caught it
// (`bash -n`) does not — syntax is valid, the failure is ordering.
//
// The general shape: a workflow step with an early-exit branch runs a code path
// no pull request ever exercises, so a whole class of ordering and
// initialisation bugs is invisible until it lands on `main`.
//
// ## What is and is not a violation
//
// Only TOP-LEVEL calls are ordered. A call INSIDE another function's body runs
// when that function is invoked, by which point later definitions have executed
// — `batch()` legitimately calls `emit()` regardless of which is written first.
// Flagging those would be wrong and would push people to reorder code that is
// already correct.
//
// Deliberately a static scan: it runs in `validate-fast` in milliseconds,
// before a PR exists, and it covers the push-only paths that no PR run reaches.

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')

export interface RunBlock {
  /** Best-effort label for the error message (step name, else job name). */
  label: string
  /** The `run:` script body, de-indented. */
  script: string
}

/**
 * Extract every `run: |` (or `run: >`) block from a workflow, labelled with the
 * nearest preceding `- name:`. Pure — unit-tested.
 *
 * A regex scan rather than a YAML parse, for the same reason as
 * `check-ci-job-timeouts`: `validate-fast` carries no YAML dependency, and the
 * shape matched here (a `run:` block scalar, its body indented deeper) is
 * unambiguous.
 */
export function parseRunBlocks(workflowText: string): RunBlock[] {
  const lines = workflowText.split('\n')
  const out: RunBlock[] = []
  let label = '<unnamed step>'

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const nameMatch = /^\s*-?\s*name:\s*(.+?)\s*$/.exec(line)
    if (nameMatch) {
      label = nameMatch[1]!.replace(/^["']|["']$/g, '')
      continue
    }
    const runMatch = /^(\s*)-?\s*run:\s*[|>][-+]?\s*$/.exec(line)
    if (!runMatch) continue

    const runIndent = runMatch[1]!.length
    const body: string[] = []
    let bodyIndent: number | null = null
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j]!
      if (l.trim() === '') {
        body.push('')
        continue
      }
      const indent = l.length - l.trimStart().length
      if (indent <= runIndent) break
      bodyIndent ??= indent
      body.push(l.slice(bodyIndent))
      i = j
    }
    out.push({ label, script: body.join('\n') })
  }
  return out
}

export interface OrderViolation {
  name: string
  /** 1-indexed line within the run block. */
  usedAtLine: number
  definedAtLine: number
}

interface FnDef {
  name: string
  line: number
  /** Inclusive line range of the function BODY, 1-indexed. */
  bodyStart: number
  bodyEnd: number
}

/**
 * Collect shell function definitions and the line range of each body.
 *
 * Body extent is found by the closing brace at the SAME indent as the
 * definition, not by counting braces: shell braces appear in `${VAR}`,
 * `${1:-}`, and GitHub `${{ }}` expressions, so naive counting mis-nests.
 * Unclosed definitions extend to end-of-script, which is conservative — it can
 * only suppress a report, never manufacture one.
 */
function collectDefs(lines: string[]): FnDef[] {
  const defs: FnDef[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const m = /^(\s*)(?:function\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\(\)\s*\{/.exec(line)
    if (!m) continue
    const indent = m[1]!.length
    let end = lines.length
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j]!
      if (l.trimEnd() === `${' '.repeat(indent)}}`) {
        end = j
        break
      }
    }
    defs.push({ name: m[2]!, line: i + 1, bodyStart: i + 2, bodyEnd: end })
  }
  return defs
}

/**
 * Report every TOP-LEVEL call to a function defined LATER in the same script.
 *
 * "Top-level" means outside any function body — a call nested inside another
 * function runs at invocation time, when all definitions have executed, so its
 * textual position carries no ordering requirement. Pure — unit-tested.
 */
export function findUseBeforeDefine(script: string): OrderViolation[] {
  const lines = script.split('\n')
  const defs = collectDefs(lines)
  if (defs.length === 0) return []

  const byName = new Map<string, number>()
  for (const d of defs) if (!byName.has(d.name)) byName.set(d.name, d.line)

  const inBody = (lineNo: number): boolean =>
    defs.some((d) => lineNo >= d.bodyStart && lineNo <= d.bodyEnd)

  const out: OrderViolation[] = []
  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1
    if (inBody(lineNo)) continue
    const raw = lines[i]!
    const trimmed = raw.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    // The definition line itself is not a call.
    if (/^(?:function\s+)?[A-Za-z_][A-Za-z0-9_]*\s*\(\)\s*\{/.test(trimmed)) continue

    // A call is the command position: the first token of the line, optionally
    // after `if`/`while`/`until`/`!` or inside a command substitution.
    //
    // The `(?![\w=])` tail is load-bearing: without it a plain ASSIGNMENT that
    // happens to share a function's name (`batch=3`) reads as a call and the
    // gate false-positives on correct code. A gate that flags correct code gets
    // disabled, so precision here matters more than reach.
    const token = /^(?:(?:if|while|until|elif)\s+)?!?\s*([A-Za-z_][A-Za-z0-9_]*)(?![\w=])/.exec(
      trimmed,
    )
    const candidates = new Set<string>()
    if (token) candidates.add(token[1]!)
    for (const m of trimmed.matchAll(/\$\(\s*([A-Za-z_][A-Za-z0-9_]*)(?![\w=])/g)) {
      candidates.add(m[1]!)
    }

    for (const name of candidates) {
      const defLine = byName.get(name)
      if (defLine !== undefined && defLine > lineNo) {
        out.push({ name, usedAtLine: lineNo, definedAtLine: defLine })
      }
    }
  }
  return out
}

// ─── main ─────────────────────────────────────────────────────────────────

const WF_DIR = join(REPO, '.github/workflows')
const files = readdirSync(WF_DIR).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))

const failures: Array<OrderViolation & { file: string; label: string }> = []
let blocks = 0

for (const f of files) {
  const text = readFileSync(join(WF_DIR, f), 'utf8')
  for (const block of parseRunBlocks(text)) {
    blocks++
    for (const v of findUseBeforeDefine(block.script)) {
      failures.push({ ...v, file: f, label: block.label })
    }
  }
}

if (blocks === 0) {
  console.error('[check-workflow-shell-order] FAILED — parsed ZERO run blocks; the scan is broken')
  process.exit(1)
}

if (failures.length > 0) {
  console.error(
    `[check-workflow-shell-order] FAILED — ${failures.length} shell function(s) called before definition:`,
  )
  for (const v of failures) {
    console.error(
      `  ${v.file}  "${v.label}"  ${v.name}() called at line ${v.usedAtLine}, defined at line ${v.definedAtLine}`,
    )
  }
  console.error(
    `
Shell has no hoisting: the call runs before the definition executes, so it is
"command not found" and exit 127. Move the definition above its first
top-level call.

This most often bites a step with an EARLY-EXIT branch — the branch runs a code
path no pull request exercises, so it stays green on every PR and fails on the
first push to main.`,
  )
  process.exit(1)
}

console.log(
  `[check-workflow-shell-order] ✓ ${blocks} run block(s) in ${files.length} workflow(s), no use-before-define`,
)
