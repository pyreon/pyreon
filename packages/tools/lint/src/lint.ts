import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative, resolve } from "node:path"
import { presets } from "./config/presets"
import { allRules, ruleMap } from "./rules"
import { applyFixes, lintFile } from "./runner"
import type { LintConfig, LintOptions, LintResult, Rule, Severity } from "./types"

/**
 * Lint files in a directory.
 *
 * @example
 * ```ts
 * import { lint } from "@pyreon/lint"
 *
 * const result = await lint({ cwd: "./src", preset: "recommended" })
 * console.log(result.counts)
 * ```
 */
export function lint(options: LintOptions = {}): LintResult {
  const cwd = resolve(options.cwd ?? process.cwd())
  const start = performance.now()

  // Build config from preset + overrides
  const preset = options.preset ? presets[options.preset] : presets.recommended
  const config: LintConfig = {
    rules: { ...preset.rules, ...options.rules },
    include: options.include ?? preset.include,
    exclude: options.exclude ?? preset.exclude,
  }

  // Collect active rules
  const activeRules: Rule[] = allRules.filter((rule) => {
    const severity = config.rules[rule.meta.id]
    return severity && severity !== "off"
  })

  // Find files
  const files = collectFiles(cwd, config)

  // Lint each file
  const results: LintResult["files"] = []
  const counts: Record<Severity, number> = { error: 0, warn: 0, info: 0, off: 0 }

  for (const filePath of files) {
    const sourceText = readFileSync(filePath, "utf-8")
    const fileResult = lintFile(filePath, sourceText, activeRules, config)

    // Apply quiet mode — filter info/warn
    if (options.quiet) {
      fileResult.diagnostics = fileResult.diagnostics.filter((d) => d.severity === "error")
    }

    // Apply fixes if requested
    if (options.fix) {
      const fixable = fileResult.diagnostics.filter((d) => d.fix)
      if (fixable.length > 0) {
        const fixed = applyFixes(sourceText, fileResult.diagnostics)
        const { writeFileSync } = require("node:fs") as typeof import("node:fs")
        writeFileSync(filePath, fixed, "utf-8")
        // Re-lint after fixes to get updated diagnostics
        const reLinted = lintFile(filePath, fixed, activeRules, config)
        fileResult.diagnostics = reLinted.diagnostics
        fileResult.parseErrors = reLinted.parseErrors
      }
    }

    // Count diagnostics
    for (const diag of fileResult.diagnostics) {
      counts[diag.severity]++
    }

    // Make paths relative for display
    fileResult.filePath = relative(cwd, filePath)
    results.push(fileResult)
  }

  return {
    files: results,
    counts,
    fileCount: files.length,
    durationMs: Math.round(performance.now() - start),
  }
}

/** Recursively collect .ts/.tsx/.js/.jsx files */
function collectFiles(dir: string, config: LintConfig): string[] {
  const files: string[] = []
  const extensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"])
  const exclude = config.exclude ?? []

  function walk(currentDir: string) {
    let entries: string[]
    try {
      entries = readdirSync(currentDir)
    } catch {
      return
    }

    for (const entry of entries) {
      const fullPath = join(currentDir, entry)

      // Check excludes
      if (shouldExclude(fullPath, exclude)) continue

      let stat: ReturnType<typeof statSync>
      try {
        stat = statSync(fullPath)
      } catch {
        continue
      }

      if (stat.isDirectory()) {
        walk(fullPath)
      } else if (stat.isFile()) {
        const ext = getExtension(entry)
        if (extensions.has(ext)) {
          files.push(fullPath)
        }
      }
    }
  }

  walk(dir)
  return files
}

function shouldExclude(path: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    // Simple glob matching (handles common cases)
    const cleaned = pattern.replace(/\*\*/g, "").replace(/\*/g, "").replace(/\//g, "")
    if (cleaned && path.includes(cleaned)) return true
  }
  return false
}

function getExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".")
  return lastDot >= 0 ? filename.slice(lastDot) : ""
}

/** List all available rules with their metadata */
export function listRules() {
  return allRules.map((r) => r.meta)
}
