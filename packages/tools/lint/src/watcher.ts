import { readFileSync, watch } from "node:fs"
import { resolve } from "node:path"
import { AstCache } from "./cache"
import { createIgnoreFilter } from "./config/ignore"
import { getPreset } from "./config/presets"
import { formatCompact, formatJSON, formatText } from "./reporter"
import { allRules } from "./rules/index"
import { lintFile } from "./runner"
import type { LintConfig, LintOptions, LintResult, Severity } from "./types"

const JS_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mts", ".mjs"])

function hasJsExtension(filePath: string): boolean {
  const ext = filePath.slice(filePath.lastIndexOf("."))
  return JS_EXTENSIONS.has(ext)
}

function formatOutput(result: LintResult, format: string): string {
  if (format === "json") return formatJSON(result)
  if (format === "compact") return formatCompact(result)
  return formatText(result)
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
  const preset = options.preset ?? "recommended"
  const config = getPreset(preset)

  applyOverrides(config, options.ruleOverrides)

  const cwd = resolve(".")
  const isIgnored = createIgnoreFilter(cwd, options.ignore)

  // Debounce map: filePath -> timeout
  const pending = new Map<string, ReturnType<typeof setTimeout>>()

  // eslint-disable-next-line no-console
  console.log(`\x1b[2m[pyreon-lint] Watching for changes...\x1b[0m\n`)

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
            relintFile(filePath, config, cache, options.format)
          }, 100),
        )
      })
    } catch {
      console.error(`[pyreon-lint] Could not watch: ${dir}`)
    }
  }
}

function applyOverrides(
  config: LintConfig,
  overrides?: Record<string, Severity> | undefined,
): void {
  if (!overrides) return
  for (const [id, severity] of Object.entries(overrides)) {
    config.rules[id] = severity
  }
}

function relintFile(filePath: string, config: LintConfig, cache: AstCache, format: string): void {
  let source: string
  try {
    source = readFileSync(filePath, "utf-8")
  } catch {
    return
  }

  const fileResult = lintFile(filePath, source, allRules, config, cache)

  if (fileResult.diagnostics.length === 0) return

  const result: LintResult = {
    files: [fileResult],
    totalErrors: 0,
    totalWarnings: 0,
    totalInfos: 0,
  }

  for (const d of fileResult.diagnostics) {
    if (d.severity === "error") result.totalErrors++
    else if (d.severity === "warn") result.totalWarnings++
    else if (d.severity === "info") result.totalInfos++
  }

  // Clear screen and print
  process.stdout.write("\x1b[2J\x1b[H")
  console.log(formatOutput(result, format))
}
