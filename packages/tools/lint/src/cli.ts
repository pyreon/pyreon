#!/usr/bin/env node

/**
 * @pyreon/lint CLI — Pyreon-specific linter
 *
 * Usage:
 *   pyreon-lint [options] [path]
 *
 * Options:
 *   --preset <name>    Use preset: recommended (default), strict, app, lib
 *   --fix              Auto-fix fixable issues
 *   --format <fmt>     Output: text (default), json, compact
 *   --quiet            Only show errors (hide warnings and info)
 *   --list             List all available rules
 *   --rule <id>=<sev>  Override rule severity (e.g., --rule pyreon/no-classname=off)
 *   --help             Show this help
 *   --version          Show version
 */

import { lint, listRules } from "./lint"
import { formatCompact, formatJSON, formatText } from "./reporter"
import type { LintOptions, PresetName, Severity } from "./types"

const args = process.argv.slice(2)

function printUsage(): void {
  console.log(`
  pyreon-lint [options] [path]

  Options:
    --preset <name>    Preset: recommended (default), strict, app, lib
    --fix              Auto-fix fixable issues
    --format <fmt>     Output format: text (default), json, compact
    --quiet            Only show errors
    --list             List all available rules
    --rule <id>=<sev>  Override rule severity
    --help             Show this help message
    --version          Show version
`)
}

function main(): void {
  if (args.includes("--help") || args.includes("-h")) {
    printUsage()
    return
  }

  if (args.includes("--version") || args.includes("-v")) {
    console.log("0.10.0")
    return
  }

  if (args.includes("--list")) {
    const rules = listRules()
    const maxId = Math.max(...rules.map((r) => r.id.length))

    console.log(`\n  ${rules.length} rules available:\n`)

    let currentCategory = ""
    for (const rule of rules) {
      if (rule.category !== currentCategory) {
        currentCategory = rule.category
        console.log(`  \x1b[1m${currentCategory}\x1b[0m`)
      }
      const fixTag = rule.fixable ? " \x1b[32m[fix]\x1b[0m" : ""
      console.log(
        `    ${rule.id.padEnd(maxId + 2)} ${rule.defaultSeverity.padEnd(5)} ${rule.description}${fixTag}`,
      )
    }
    console.log("")
    return
  }

  // Parse options
  const options: LintOptions = {
    format: "text",
  }

  const ruleOverrides: Record<string, Severity> = {}
  let pathArg: string | undefined

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    if (arg === "--preset" && args[i + 1]) {
      options.preset = args[++i] as PresetName
    } else if (arg === "--fix") {
      options.fix = true
    } else if (arg === "--format" && args[i + 1]) {
      options.format = args[++i] as "text" | "json" | "compact"
    } else if (arg === "--quiet") {
      options.quiet = true
    } else if (arg === "--rule" && args[i + 1]) {
      const [id, sev] = args[++i].split("=")
      if (id && sev) {
        ruleOverrides[id] = sev as Severity
      }
    } else if (!arg.startsWith("-")) {
      pathArg = arg
    }
  }

  if (pathArg) {
    options.cwd = pathArg
  }

  if (Object.keys(ruleOverrides).length > 0) {
    options.rules = ruleOverrides
  }

  // Run linter
  const result = lint(options)

  // Format output
  let output: string
  switch (options.format) {
    case "json":
      output = formatJSON(result)
      break
    case "compact":
      output = formatCompact(result)
      break
    default:
      output = formatText(result)
  }

  console.log(output)

  // Exit with error code if there are errors
  if (result.counts.error > 0) {
    process.exit(1)
  }
}

main()
