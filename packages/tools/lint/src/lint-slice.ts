import { readFileSync, writeFileSync } from 'node:fs'
import { allRules } from './rules/index'
import { applyFileFixes, lintFile } from './runner'
import type { ConfigDiagnostic, LintConfig, LintFileResult } from './types'

export interface LintWorkerInput {
  files: string[]
  config: LintConfig
  fix: boolean
  quiet: boolean
}

export interface LintWorkerOutput {
  files: LintFileResult[]
  configDiagnostics: ConfigDiagnostic[]
}

/**
 * Lint one slice of files: the worker body. A separate module so tests run it
 * without spawning (through `@pyreon/lint/internal`); the `./lint-worker`
 * entry only calls it.
 *
 * @internal
 */
export function lintSlice(input: LintWorkerInput): LintWorkerOutput {
  const { files, config, fix, quiet } = input
  const configDiagnostics: ConfigDiagnostic[] = []
  const results: LintFileResult[] = []

  for (const filePath of files) {
    let source: string
    try {
      source = readFileSync(filePath, 'utf-8')
    } catch {
      continue
    }
    const fileResult = lintFile(filePath, source, allRules, config, undefined, configDiagnostics)

    if (fix) {
      const fixed = applyFileFixes(fileResult, source)
      if (fixed !== undefined) writeFileSync(filePath, fixed, 'utf-8')
    }
    if (quiet) {
      fileResult.diagnostics = fileResult.diagnostics.filter((d) => d.severity === 'error')
    }
    results.push(fileResult)
  }

  return { files: results, configDiagnostics }
}
