import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { getPreset } from "./config/presets"
import { allRules } from "./rules/index"
import { applyFixes, lintFile } from "./runner"
import type { LintOptions, LintResult, RuleMeta } from "./types"

const JS_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mts", ".mjs"])

function collectFiles(dir: string): string[] {
  const files: string[] = []

  function walk(d: string) {
    let entries: string[]
    try {
      entries = readdirSync(d)
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.startsWith(".") || entry === "node_modules" || entry === "lib" || entry === "dist")
        continue
      const full = join(d, entry)
      let stat: ReturnType<typeof statSync>
      try {
        stat = statSync(full)
      } catch {
        continue
      }
      if (stat.isDirectory()) {
        walk(full)
      } else if (stat.isFile()) {
        const ext = full.slice(full.lastIndexOf("."))
        if (JS_EXTENSIONS.has(ext)) {
          files.push(full)
        }
      }
    }
  }

  walk(dir)
  return files
}

/**
 * Lint files and return results.
 *
 * @example
 * ```ts
 * import { lint } from "@pyreon/lint"
 *
 * const result = await lint({ paths: ["src/"], preset: "recommended" })
 * console.log(result.totalErrors) // 0
 * ```
 */
export function lint(options: LintOptions): LintResult {
  const preset = options.preset ?? "recommended"
  const config = getPreset(preset)

  // Apply rule overrides
  if (options.ruleOverrides) {
    for (const [id, severity] of Object.entries(options.ruleOverrides)) {
      config.rules[id] = severity
    }
  }

  // Collect files
  const files: string[] = []
  for (const p of options.paths) {
    const resolved = resolve(p)
    let stat: ReturnType<typeof statSync>
    try {
      stat = statSync(resolved)
    } catch {
      continue
    }
    if (stat.isDirectory()) {
      files.push(...collectFiles(resolved))
    } else if (stat.isFile()) {
      files.push(resolved)
    }
  }

  // Lint each file
  const results: LintResult = {
    files: [],
    totalErrors: 0,
    totalWarnings: 0,
    totalInfos: 0,
  }

  for (const filePath of files) {
    let source: string
    try {
      source = readFileSync(filePath, "utf-8")
    } catch {
      continue
    }

    const fileResult = lintFile(filePath, source, allRules, config)

    // Apply fixes if requested
    if (options.fix) {
      const fixable = fileResult.diagnostics.filter((d) => d.fix)
      if (fixable.length > 0) {
        const fixed = applyFixes(source, fileResult.diagnostics)
        writeFileSync(filePath, fixed, "utf-8")
        fileResult.fixedSource = fixed
        // Remove fixed diagnostics
        fileResult.diagnostics = fileResult.diagnostics.filter((d) => !d.fix)
      }
    }

    // Filter quiet mode
    if (options.quiet) {
      fileResult.diagnostics = fileResult.diagnostics.filter((d) => d.severity === "error")
    }

    // Count totals
    for (const d of fileResult.diagnostics) {
      if (d.severity === "error") results.totalErrors++
      else if (d.severity === "warn") results.totalWarnings++
      else if (d.severity === "info") results.totalInfos++
    }

    results.files.push(fileResult)
  }

  return results
}

/**
 * List all available rules with their metadata.
 *
 * @example
 * ```ts
 * import { listRules } from "@pyreon/lint"
 *
 * for (const rule of listRules()) {
 *   console.log(`${rule.id} (${rule.severity}): ${rule.description}`)
 * }
 * ```
 */
export function listRules(): RuleMeta[] {
  return allRules.map((r) => r.meta)
}
