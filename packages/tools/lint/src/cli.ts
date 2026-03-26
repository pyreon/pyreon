#!/usr/bin/env node
import { lint, listRules } from "./lint"
import type { PresetName, Severity } from "./types"

function printUsage() {}

function main() {
  const args = process.argv.slice(2)

  let preset: PresetName = "recommended"
  let fix = false
  let format: "text" | "json" | "compact" = "text"
  let quiet = false
  let showList = false
  const ruleOverrides: Record<string, Severity> = {}
  const paths: string[] = []

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    if (arg === "--help" || arg === "-h") {
      printUsage()
      process.exit(0)
    }

    if (arg === "--list") {
      showList = true
      continue
    }

    if (arg === "--fix") {
      fix = true
      continue
    }

    if (arg === "--quiet") {
      quiet = true
      continue
    }

    if (arg === "--preset") {
      i++
      preset = (args[i] ?? "recommended") as PresetName
      continue
    }

    if (arg === "--format") {
      i++
      format = (args[i] ?? "text") as "text" | "json" | "compact"
      continue
    }

    if (arg === "--rule") {
      i++
      const val = args[i]
      if (val) {
        const eqIdx = val.lastIndexOf("=")
        if (eqIdx !== -1) {
          const ruleId = val.slice(0, eqIdx)
          const severity = val.slice(eqIdx + 1) as Severity
          ruleOverrides[ruleId] = severity
        }
      }
      continue
    }

    // Positional argument = path
    if (arg) {
      paths.push(arg)
    }
  }

  if (showList) {
    const rules = listRules()
    for (const rule of rules) {
      const _fixLabel = rule.fixable ? " [fixable]" : ""
    }

    process.exit(0)
  }

  if (paths.length === 0) {
    paths.push(".")
  }

  const result = lint({ paths, preset, fix, quiet, ruleOverrides })

  if (format === "json") {
  } else if (format === "compact") {
  } else {
  }

  if (result.totalErrors > 0) {
    process.exit(1)
  }
}

main()
