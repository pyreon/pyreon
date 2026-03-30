import type { LintResult, Severity } from "./types";

// ANSI colors
const BOLD = "\x1b[1m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[34m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

const SEVERITY_SYMBOL: Record<Severity, string> = {
  error: `${RED}\u2716${RESET}`,
  warn: `${YELLOW}\u26A0${RESET}`,
  info: `${BLUE}\u2139${RESET}`,
  off: "",
};

const SEVERITY_LABEL: Record<Severity, string> = {
  error: `${RED}error${RESET}`,
  warn: `${YELLOW}warning${RESET}`,
  info: `${BLUE}info${RESET}`,
  off: "",
};

/**
 * Format results as human-readable colored text.
 */
export function formatText(result: LintResult): string {
  const lines: string[] = [];

  for (const file of result.files) {
    if (file.diagnostics.length === 0) continue;

    lines.push("");
    lines.push(`${BOLD}${file.filePath}${RESET}`);

    for (const d of file.diagnostics) {
      const loc = `${DIM}${d.loc.line}:${d.loc.column}${RESET}`;
      const severity = SEVERITY_LABEL[d.severity];
      const ruleId = `${DIM}${d.ruleId}${RESET}`;
      lines.push(`  ${loc}  ${severity}  ${d.message}  ${ruleId}`);
    }
  }

  const total = result.totalErrors + result.totalWarnings + result.totalInfos;
  if (total > 0) {
    lines.push("");
    const parts: string[] = [];
    if (result.totalErrors > 0)
      parts.push(`${RED}${result.totalErrors} error${result.totalErrors === 1 ? "" : "s"}${RESET}`);
    if (result.totalWarnings > 0)
      parts.push(
        `${YELLOW}${result.totalWarnings} warning${result.totalWarnings === 1 ? "" : "s"}${RESET}`,
      );
    if (result.totalInfos > 0) parts.push(`${BLUE}${result.totalInfos} info${RESET}`);
    lines.push(`${SEVERITY_SYMBOL.error} ${parts.join(", ")}`);
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Format results as JSON.
 */
export function formatJSON(result: LintResult): string {
  return JSON.stringify(result, null, 2);
}

/**
 * Format results as compact single-line-per-diagnostic output.
 */
export function formatCompact(result: LintResult): string {
  const lines: string[] = [];

  for (const file of result.files) {
    for (const d of file.diagnostics) {
      lines.push(
        `${file.filePath}:${d.loc.line}:${d.loc.column}: ${d.severity} [${d.ruleId}] ${d.message}`,
      );
    }
  }

  return lines.join("\n");
}
