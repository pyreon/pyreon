import { readFileSync, watch } from 'node:fs'
import { resolve } from 'node:path'
import { formatElapsed, header, onInterrupt, plural, term, verdict } from '@pyreon/ansi'
import { AstCache } from './cache'
import { createIgnoreFilter } from './config/ignore'
import { loadConfig, loadConfigFromPath } from './config/loader'
import { resolveLintConfig } from './lint'
import { formatCompact, formatGha, formatJSON, formatText } from './reporter'
import { allRules } from './rules/index'
import { lintFile } from './runner'
import type { LintConfig, LintOptions, LintResult } from './types'
import { hasJsExtension } from './utils/index'

function formatOutput(result: LintResult, format: string, elapsedMs: number): string {
  if (format === 'json') return formatJSON(result)
  if (format === 'compact') return formatCompact(result)
  if (format === 'gha') return formatGha(result)
  // A watch run is a CLI run: a clean re-lint prints a verdict too, so the
  // screen never keeps showing a problem that was just fixed.
  return formatText(result, { elapsedMs })
}

/**
 * Watch directories and re-lint changed files.
 *
 * Uses `fs.watch` (recursive) with 100ms debounce.
 * Caches ASTs for unchanged files.
 *
 * @example
 * ```ts
 * import { watchAndLint } from "@pyreon/lint"
 *
 * watchAndLint({ paths: ["src/"], preset: "recommended", format: "text" })
 * ```
 */
export function watchAndLint(options: LintOptions & { format: string }): void {
  const cache = new AstCache()
  const cwd = resolve('.')
  // The same resolution `lint()` uses — the watcher used to start from the
  // bare preset and never read `.pyreonlintrc.json` at all.
  const fileConfig = options.config ? loadConfigFromPath(options.config) : loadConfig(cwd)
  const config = resolveLintConfig(fileConfig, options)

  const isIgnored = createIgnoreFilter(cwd, options.ignore)

  const runs = { count: 0 }
  // Debounce map: filePath -> timeout
  const pending = new Map<string, ReturnType<typeof setTimeout>>()

  // oxlint-disable-next-line no-console
  console.log(`${header(term, 'pyreon-lint', `watching ${options.paths.join(', ')}`)}\n`)
  // Ctrl-C is how a watch ends: say so, as the last line, and exit 0.
  const watchStarted = performance.now()
  onInterrupt(
    () => verdict(term, 'info', 'stopped watching', [plural(runs.count, 're-lint'), formatElapsed(performance.now() - watchStarted)]),
    { write: (text) => void process.stdout.write(text), code: 0 },
  )

  for (const p of options.paths) {
    const dir = resolve(p)
    try {
      watch(dir, { recursive: true }, (_event, filename) => {
        if (!filename) return
        const filePath = resolve(dir, filename)

        if (!hasJsExtension(filePath) || isIgnored(filePath)) return

        // Debounce: clear existing timeout for this file
        const existing = pending.get(filePath)
        if (existing) clearTimeout(existing)

        pending.set(
          filePath,
          setTimeout(() => {
            pending.delete(filePath)
            runs.count++
            relintFile(filePath, config, cache, options.format)
          }, 100),
        )
      })
    } catch {
      console.error(`[pyreon-lint] Could not watch: ${dir}`)
    }
  }
}

function relintFile(filePath: string, config: LintConfig, cache: AstCache, format: string): void {
  let source: string
  try {
    source = readFileSync(filePath, 'utf-8')
  } catch {
    return
  }

  const started = performance.now()
  const fileResult = lintFile(filePath, source, allRules, config, cache)

  // A clean file prints nothing in the machine formats (nothing to report),
  // but the text format still says so: the last screen showed a problem.
  if (fileResult.diagnostics.length === 0 && format !== 'text') return

  const result: LintResult = {
    files: [fileResult],
    totalErrors: 0,
    totalWarnings: 0,
    totalInfos: 0,
    configDiagnostics: [],
  }

  for (const d of fileResult.diagnostics) {
    if (d.severity === 'error') result.totalErrors++
    else if (d.severity === 'warn') result.totalWarnings++
    else if (d.severity === 'info') result.totalInfos++
  }

  // Clear screen and print. Never send the clear sequence to a pipe or a
  // colourless terminal: it is an escape code like any other.
  if (term.color && process.stdout.isTTY) process.stdout.write('\x1b[2J\x1b[H')
  console.log(formatOutput(result, format, performance.now() - started))
}
