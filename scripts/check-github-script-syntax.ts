/**
 * Parse-check every `actions/github-script` `script:` block.
 *
 * The bug this exists for: `native-device.yml`'s sticky-issue notifier had a
 * SHELL snippet pasted into its `script:` block, so the step died with
 * `SyntaxError: Invalid or unexpected token` on every nightly run. The paste
 * is easy to make because TWO different actions in that same file take an
 * input literally named `script:` and they are different LANGUAGES --
 * `reactivecircus/android-emulator-runner`'s is shell, `actions/github-script`'s
 * is JavaScript. Nothing read either as code, so YAML stayed valid and the
 * failure only appeared at runtime, in a nightly-only job.
 *
 * That job is a NOTIFIER: when the device build goes red it writes the sticky
 * issue. A notifier that cannot parse is the catalogued dead-alarm class --
 * the nightly could fail and say nothing.
 *
 * `${{ ... }}` is substituted by GitHub BEFORE the script runs, so it is
 * substituted here too; parsing the raw text would report false errors on
 * every workflow that interpolates.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const WORKFLOWS = join(import.meta.dirname, '..', '.github', 'workflows')

export interface ScriptBlock {
  file: string
  line: number
  source: string
}

/** Every `script:` block belonging to an `actions/github-script` step. */
export function extractGithubScriptBlocks(yaml: string, file: string): ScriptBlock[] {
  const lines = yaml.split('\n')
  const out: ScriptBlock[] = []
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]?.trim() !== 'script: |') continue
    // Only this action's blocks. The emulator runner's `script:` is SHELL and
    // must not be parsed as JS -- that is the whole confusion being guarded.
    const owner = lines.slice(Math.max(0, i - 8), i).find((l) => l.includes('uses:'))
    if (!owner?.includes('actions/github-script')) continue

    const first = lines[i + 1]
    if (first === undefined) continue
    const indent = first.length - first.trimStart().length
    const body: string[] = []
    for (const l of lines.slice(i + 1)) {
      if (l.trim() === '') {
        body.push('')
        continue
      }
      if (l.length - l.trimStart().length < indent) break
      body.push(l.slice(indent))
    }
    out.push({ file, line: i + 1, source: body.join('\n') })
  }
  return out
}

/** GitHub substitutes expressions before execution; mirror that. */
export function substituteExpressions(source: string): string {
  return source.replace(/\$\{\{[^}]*\}\}/g, 'EXPR')
}

/** Returns a SyntaxError message, or null when the block parses. */
export function parseError(source: string): string | null {
  try {
    // An async function body: these scripts legitimately use top-level `await`.
    new Function(`return (async () => {\n${substituteExpressions(source)}\n})`)
    return null
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}

function main(): number {
  const files = readdirSync(WORKFLOWS).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
  const blocks: ScriptBlock[] = []
  for (const f of files) {
    blocks.push(...extractGithubScriptBlocks(readFileSync(join(WORKFLOWS, f), 'utf8'), f))
  }

  // An empty scan is a SKIP masquerading as a pass -- the catalogued
  // silent-hole class. This repo HAS github-script steps; finding none means
  // the extractor broke, not that the tree is clean.
  if (blocks.length === 0) {
    console.error(
      '[check-github-script-syntax] ✗ found NO github-script blocks. This repo has them, ' +
        'so the extractor is broken rather than the tree being clean.',
    )
    return 1
  }

  const bad = blocks.map((b) => ({ b, err: parseError(b.source) })).filter((x) => x.err !== null)
  if (bad.length > 0) {
    console.error('[check-github-script-syntax] ✗ github-script block(s) are not valid JavaScript:\n')
    for (const { b, err } of bad) {
      console.error(`  ${b.file}:${b.line}\n    ${err}`)
      console.error(
        '    A common cause is pasting SHELL into it: in this repo ' +
          '`reactivecircus/android-emulator-runner` also takes an input named `script:`, ' +
          'and that one IS shell.\n',
      )
    }
    return 1
  }

  console.log(
    `[check-github-script-syntax] ✓ ${blocks.length} github-script block(s) parse as JavaScript.`,
  )
  return 0
}

if (import.meta.main) process.exit(main())
