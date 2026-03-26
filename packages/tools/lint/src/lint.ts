import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { AstCache } from "./cache"
import { createIgnoreFilter } from "./config/ignore"
import { loadConfig, loadConfigFromPath } from "./config/loader"
import { getPreset } from "./config/presets"
import { allRules } from "./rules/index"
import { applyFixes, lintFile } from "./runner"
import type { LintConfig, LintFileResult, LintOptions, LintResult, RuleMeta } from "./types"

const JS_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mts", ".mjs"])

function isHiddenOrVendor(entry: string): boolean {
  return entry.startsWith(".") || entry === "node_modules" || entry === "lib" || entry === "dist"
}

function hasJsExtension(filePath: string): boolean {
  const ext = filePath.slice(filePath.lastIndexOf("."))
  return JS_EXTENSIONS.has(ext)
}

function matchesPatterns(
  filePath: string,
  include?: string[] | undefined,
  exclude?: string[] | undefined,
): boolean {
  if (exclude) {
    for (const pattern of exclude) {
      if (filePath.includes(pattern)) return false
    }
  }
  if (include && include.length > 0) {
    for (const pattern of include) {
      if (filePath.includes(pattern)) return true
    }
    return false
  }
  return true
}

function walkDirectory(
  dir: string,
  files: string[],
  isIgnored: (filePath: string) => boolean,
  include?: string[] | undefined,
  exclude?: string[] | undefined,
): void {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const entry of entries) {
    if (isHiddenOrVendor(entry)) continue
    const full = join(dir, entry)
    if (isIgnored(full)) continue
    processEntry(full, files, isIgnored, include, exclude)
  }
}

function processEntry(
  full: string,
  files: string[],
  isIgnored: (filePath: string) => boolean,
  include?: string[] | undefined,
  exclude?: string[] | undefined,
): void {
  let stat: ReturnType<typeof statSync>
  try {
    stat = statSync(full)
  } catch {
    return
  }
  if (stat.isDirectory()) {
    walkDirectory(full, files, isIgnored, include, exclude)
  } else if (stat.isFile() && hasJsExtension(full) && matchesPatterns(full, include, exclude)) {
    files.push(full)
  }
}

function collectFiles(
  dir: string,
  isIgnored: (filePath: string) => boolean,
  include?: string[] | undefined,
  exclude?: string[] | undefined,
): string[] {
  const files: string[] = []
  walkDirectory(dir, files, isIgnored, include, exclude)
  return files
}

function buildConfig(options: LintOptions): {
  config: LintConfig
  include: string[] | undefined
  exclude: string[] | undefined
  isIgnored: (filePath: string) => boolean
} {
  const cwd = resolve(".")
  const fileConfig = options.config ? loadConfigFromPath(options.config) : loadConfig(cwd)

  const presetName = options.preset ?? fileConfig?.preset ?? "recommended"
  const config = getPreset(presetName)

  // Merge config file rule overrides
  if (fileConfig?.rules) {
    for (const [id, severity] of Object.entries(fileConfig.rules)) {
      config.rules[id] = severity
    }
  }

  // CLI rule overrides (highest priority)
  if (options.ruleOverrides) {
    for (const [id, severity] of Object.entries(options.ruleOverrides)) {
      config.rules[id] = severity
    }
  }

  return {
    config,
    include: fileConfig?.include,
    exclude: fileConfig?.exclude,
    isIgnored: createIgnoreFilter(cwd, options.ignore),
  }
}

function gatherFiles(
  paths: string[],
  isIgnored: (filePath: string) => boolean,
  include?: string[] | undefined,
  exclude?: string[] | undefined,
): string[] {
  const files: string[] = []
  for (const p of paths) {
    const resolved = resolve(p)
    let stat: ReturnType<typeof statSync>
    try {
      stat = statSync(resolved)
    } catch {
      continue
    }
    if (stat.isDirectory()) {
      files.push(...collectFiles(resolved, isIgnored, include, exclude))
    } else if (stat.isFile() && !isIgnored(resolved)) {
      files.push(resolved)
    }
  }
  return files
}

function applyFixesToFile(fileResult: LintFileResult, source: string): void {
  const fixable = fileResult.diagnostics.filter((d) => d.fix)
  if (fixable.length === 0) return
  const fixed = applyFixes(source, fileResult.diagnostics)
  writeFileSync(fileResult.filePath, fixed, "utf-8")
  fileResult.fixedSource = fixed
  fileResult.diagnostics = fileResult.diagnostics.filter((d) => !d.fix)
}

function countDiagnostics(fileResult: LintFileResult, results: LintResult): void {
  for (const d of fileResult.diagnostics) {
    if (d.severity === "error") results.totalErrors++
    else if (d.severity === "warn") results.totalWarnings++
    else if (d.severity === "info") results.totalInfos++
  }
}

/**
 * Lint files and return results.
 *
 * @example
 * ```ts
 * import { lint } from "@pyreon/lint"
 *
 * const result = lint({ paths: ["src/"], preset: "recommended" })
 * console.log(result.totalErrors) // 0
 * ```
 */
export function lint(options: LintOptions): LintResult {
  const { config, include, exclude, isIgnored } = buildConfig(options)
  const cache = new AstCache()
  const files = gatherFiles(options.paths, isIgnored, include, exclude)

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
    const fileResult = lintFile(filePath, source, allRules, config, cache)
    if (options.fix) {
      applyFixesToFile(fileResult, source)
    }
    if (options.quiet) {
      fileResult.diagnostics = fileResult.diagnostics.filter((d) => d.severity === "error")
    }
    countDiagnostics(fileResult, results)
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
