import type { Diagnostic, LintResult, Severity } from "./types"

const SEVERITY_COLORS: Record<Severity, string> = {
  error: "\x1b[31m", // red
  warn: "\x1b[33m", // yellow
  info: "\x1b[36m", // cyan
  off: "\x1b[90m", // gray
}

const SEVERITY_SYMBOLS: Record<Severity, string> = {
  error: "\u2716", // ✖
  warn: "\u26A0", // ⚠
  info: "\u2139", // ℹ
  off: " ",
}

const RESET = "\x1b[0m"
const BOLD = "\x1b[1m"
const DIM = "\x1b[2m"
const UNDERLINE = "\x1b[4m"

/** Format lint results as human-readable text */
export function formatText(result: LintResult): string {
  const lines: string[] = []

  for (const file of result.files) {
    if (file.diagnostics.length === 0 && file.parseErrors.length === 0) continue

    lines.push("")
    lines.push(`${UNDERLINE}${file.filePath}${RESET}`)

    for (const err of file.parseErrors) {
      lines.push(`  ${SEVERITY_COLORS.error}parse error${RESET}: ${err}`)
    }

    for (const diag of file.diagnostics) {
      const color = SEVERITY_COLORS[diag.severity]
      const symbol = SEVERITY_SYMBOLS[diag.severity]
      const loc = `${diag.loc.line}:${diag.loc.column}`
      const fix = diag.fix ? ` ${DIM}(fixable)${RESET}` : ""
      lines.push(
        `  ${DIM}${loc.padEnd(8)}${RESET}${color}${symbol} ${diag.severity.padEnd(5)}${RESET} ${diag.message}${fix}  ${DIM}${diag.ruleId}${RESET}`,
      )
    }
  }

  // Summary
  lines.push("")
  const parts: string[] = []
  if (result.counts.error > 0) {
    parts.push(`${SEVERITY_COLORS.error}${result.counts.error} error${result.counts.error !== 1 ? "s" : ""}${RESET}`)
  }
  if (result.counts.warn > 0) {
    parts.push(`${SEVERITY_COLORS.warn}${result.counts.warn} warning${result.counts.warn !== 1 ? "s" : ""}${RESET}`)
  }
  if (result.counts.info > 0) {
    parts.push(`${SEVERITY_COLORS.info}${result.counts.info} info${RESET}`)
  }

  if (parts.length === 0) {
    lines.push(`${BOLD}\u2714 No problems found${RESET} ${DIM}(${result.fileCount} file${result.fileCount !== 1 ? "s" : ""} in ${result.durationMs}ms)${RESET}`)
  } else {
    const fixableCount = result.files.reduce(
      (sum, f) => sum + f.diagnostics.filter((d) => d.fix).length,
      0,
    )
    lines.push(
      `${BOLD}${parts.join(", ")}${RESET} ${DIM}(${result.fileCount} file${result.fileCount !== 1 ? "s" : ""} in ${result.durationMs}ms)${RESET}`,
    )
    if (fixableCount > 0) {
      lines.push(`  ${DIM}${fixableCount} fixable with --fix${RESET}`)
    }
  }

  lines.push("")
  return lines.join("\n")
}

/** Format lint results as JSON */
export function formatJSON(result: LintResult): string {
  return JSON.stringify(
    {
      files: result.files.map((f) => ({
        filePath: f.filePath,
        diagnostics: f.diagnostics.map((d) => ({
          ruleId: d.ruleId,
          severity: d.severity,
          message: d.message,
          line: d.loc.line,
          column: d.loc.column,
          fixable: !!d.fix,
        })),
        parseErrors: f.parseErrors,
      })),
      counts: result.counts,
      fileCount: result.fileCount,
      durationMs: result.durationMs,
    },
    null,
    2,
  )
}

/** Format lint results in compact single-line-per-diagnostic format */
export function formatCompact(result: LintResult): string {
  const lines: string[] = []

  for (const file of result.files) {
    for (const diag of file.diagnostics) {
      lines.push(
        `${file.filePath}:${diag.loc.line}:${diag.loc.column}: ${diag.severity} [${diag.ruleId}] ${diag.message}`,
      )
    }
    for (const err of file.parseErrors) {
      lines.push(`${file.filePath}: parse error: ${err}`)
    }
  }

  return lines.join("\n")
}
