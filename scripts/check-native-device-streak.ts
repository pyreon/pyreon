#!/usr/bin/env bun
// check-native-device-streak.ts
//
// Gap 7 closure infrastructure — green-streak tracker for the
// `native-device` workflow. The audit calls for a 2-week green
// streak before promoting `native-device` to a required check.
// This script reads recent runs of the workflow via GitHub API,
// computes the consecutive-green streak, and exits non-zero if the
// streak threshold hasn't been met (default 14 nightly runs).
//
// The 2-week wait is calendar — it CANNOT be code-compressed.
// But once the streak window elapses, this script provides the
// AUTOMATED GATE that decides "is it time to promote?" — turning
// the otherwise manual decision into a deterministic check.
//
// Usage:
//   bun scripts/check-native-device-streak.ts [--min-streak 14]
//                                              [--branch main]
//                                              [--json]
//
// Defaults:
//   --min-streak 14   (matches audit's 2-week observation)
//   --branch main     (only count nightly-on-main runs)
//
// Exit codes:
//   0 → streak >= threshold (ready to promote `native-device` to
//       required in branch protection)
//   1 → streak < threshold (keep observing)
//   2 → invocation error / GitHub API unreachable

import { execSync } from 'node:child_process'

export interface WorkflowRun {
  id: number
  name: string
  head_branch: string
  status: string
  conclusion: string | null
  created_at: string
}

function parseArgs(argv: string[]): {
  minStreak: number
  branch: string
  json: boolean
} {
  let minStreak = 14
  let branch = 'main'
  let json = false
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--min-streak') {
      minStreak = Number(argv[++i])
    } else if (a === '--branch') {
      branch = argv[++i] ?? 'main'
    } else if (a === '--json') {
      json = true
    }
  }
  return { minStreak, branch, json }
}

function fetchRuns(branch: string): WorkflowRun[] {
  // `gh api` walks pagination via `--paginate`; cap to recent
  // pages so a long-lived repo doesn't pull thousands of runs.
  const cmd = `gh api -X GET /repos/pyreon/pyreon/actions/workflows/native-device.yml/runs --field per_page=100 --field branch=${branch} --jq '.workflow_runs'`
  try {
    const out = execSync(cmd, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
    return JSON.parse(out) as WorkflowRun[]
  } catch (e) {
    throw new Error(`gh api fetch failed: ${(e as Error).message}`)
  }
}

export function computeStreak(runs: WorkflowRun[]): {
  streak: number
  lastFailure: string | null
  recent: { date: string; conclusion: string | null }[]
} {
  // Walk runs sorted newest-first (the GH API order). Count
  // consecutive `success` until the first non-success.
  const completed = runs.filter((r) => r.status === 'completed')
  completed.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )
  let streak = 0
  let lastFailure: string | null = null
  const recent: { date: string; conclusion: string | null }[] = []
  for (const r of completed.slice(0, 30)) {
    recent.push({ date: r.created_at, conclusion: r.conclusion })
    if (lastFailure === null) {
      if (r.conclusion === 'success') {
        streak++
      } else {
        lastFailure = r.created_at
      }
    }
  }
  return { streak, lastFailure, recent }
}

function main(): number {
  const { minStreak, branch, json } = parseArgs(process.argv.slice(2))
  let runs: WorkflowRun[]
  try {
    runs = fetchRuns(branch)
  } catch (e) {
    if (json) {
      console.log(
        JSON.stringify({ error: (e as Error).message, streak: null }),
      )
    } else {
      console.error(`[native-device-streak] ${(e as Error).message}`)
    }
    return 2
  }

  const result = computeStreak(runs)

  if (json) {
    console.log(
      JSON.stringify({
        branch,
        minStreak,
        currentStreak: result.streak,
        lastFailure: result.lastFailure,
        promotionReady: result.streak >= minStreak,
        recent: result.recent.slice(0, 10),
      }),
    )
  } else {
    console.log(`[native-device-streak] branch=${branch}`)
    console.log(`[native-device-streak] current streak: ${result.streak}`)
    console.log(`[native-device-streak] threshold: ${minStreak}`)
    if (result.lastFailure) {
      console.log(`[native-device-streak] last failure: ${result.lastFailure}`)
    }
    if (result.streak >= minStreak) {
      console.log(
        `[native-device-streak] ✅ READY — streak >= ${minStreak}; safe to promote \`native-device\` to required in branch protection.`,
      )
    } else {
      console.log(
        `[native-device-streak] ⏳ observing — need ${minStreak - result.streak} more consecutive green nightly run(s) before promotion.`,
      )
    }
  }

  return result.streak >= minStreak ? 0 : 1
}

// Only invoke main() when run directly (not when imported by tests).
if (import.meta.main) {
  process.exit(main())
}
