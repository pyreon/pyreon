#!/usr/bin/env bun
/** Convert retry-masked Playwright output into durable, machine-readable data. */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export interface FlakeReport {
  version: 1
  suite: string
  sourceAvailable: boolean
  flakyCount: number
  retries: { title: string; retry: number }[]
  /** Summary names, including dot reporters that omit retry numbers. */
  flakyTitles?: string[]
}

const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, 'g')

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function parsePlaywrightFlakes(output: string, suite: string): FlakeReport {
  const lines = output.replace(ANSI, '').split(/\r?\n/)
  let flakyCount = 0
  let remainingTitles = 0
  const flakyTitles = new Set<string>()
  const seen = new Set<string>()
  const retries: FlakeReport['retries'] = []
  for (const raw of lines) {
    const count = /^\s*(\d+)\s+flaky\s*$/.exec(raw)
    if (count) {
      remainingTitles = Number(count[1])
      flakyCount += remainingTitles
    } else if (remainingTitles > 0 && raw.trim()) {
      if (/^\s*\[[^\]]+\]\s+›/.test(raw)) {
        flakyTitles.add(raw.trim())
        remainingTitles--
      } else {
        remainingTitles = 0
      }
    }
    const match = /\(retry #(\d+)\)/.exec(raw)
    if (!match) continue
    const title = raw.trim()
    const key = `${match[1]}\0${title}`
    if (seen.has(key)) continue
    seen.add(key)
    retries.push({ title, retry: Number(match[1]) })
  }
  return {
    version: 1,
    suite,
    sourceAvailable: true,
    flakyCount,
    retries,
    flakyTitles: [...flakyTitles],
  }
}

export function flakeSummary(report: FlakeReport): string {
  if (report.flakyCount === 0 && report.retries.length === 0) return ''
  const lines = [
    `### ⚠️ Flaky specs in e2e suite \`${report.suite}\``,
    '',
    `Playwright reported ${report.flakyCount || report.retries.length} flaky spec(s) that passed only after a retry.`,
    '',
  ]
  const baseTitle = (title: string) =>
    title.replace(/^\d+\)\s*/, '').replace(/\s*\(retry #\d+\)\s*$/, '')
  const retryTitles = new Set(report.retries.map((item) => baseTitle(item.title)))
  for (const item of report.retries) lines.push(`- <code>${escapeHtml(item.title)}</code>`)
  const summaryTitles = (report.flakyTitles ?? []).filter(
    (title) => !retryTitles.has(baseTitle(title)),
  )
  for (const title of summaryTitles) lines.push(`- <code>${escapeHtml(title)}</code>`)
  if (report.retries.length === 0 && summaryTitles.length === 0) {
    lines.push('- The reporter emitted a flaky count but no retry title.')
  }
  lines.push('')
  return lines.join('\n')
}

function arg(name: string): string | undefined {
  const prefix = `--${name}=`
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length)
}

async function main(): Promise<number> {
  const input = arg('input') ?? '/tmp/e2e-out.txt'
  const suite = arg('suite') ?? 'unknown'
  const output = arg('json') ?? `.ci-artifacts/e2e-flakes/${suite}.json`
  const sourceAvailable = existsSync(input)
  const report = sourceAvailable
    ? parsePlaywrightFlakes(readFileSync(input, 'utf8'), suite)
    : {
        version: 1 as const,
        suite,
        sourceAvailable: false,
        flakyCount: 0,
        retries: [],
        flakyTitles: [],
      }
  mkdirSync(dirname(output), { recursive: true })
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n')

  if (!sourceAvailable) {
    console.log(
      `::notice title=Flake report unavailable::${input} was not created (the e2e step likely did not start)`,
    )
    return 0
  }
  const summary = flakeSummary(report)
  if (!summary) {
    console.log(`No flaky specs in suite '${suite}'.`)
    return 0
  }
  console.log(
    `::warning title=Flaky e2e suite::${suite} had ${report.flakyCount || report.retries.length} spec(s) pass only on retry`,
  )
  const summaryPath = arg('summary') ?? process.env.GITHUB_STEP_SUMMARY
  if (summaryPath) appendFileSync(summaryPath, summary)
  return 0
}

if (import.meta.main) process.exit(await main())
