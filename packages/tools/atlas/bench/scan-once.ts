#!/usr/bin/env bun
/**
 * One `atlas scan`, reporting a machine-readable RESULT line.
 *
 * Split from `ab-scan.ts` so each sample runs in a FRESH process: a scan loads
 * a design system through Vite and mounts a thousand scenarios, so the heap it
 * leaves behind would make the next arm's GC measurably more expensive. Reusing
 * one process would measure arm ORDER as much as arm.
 */
import { performance } from 'node:perf_hooks'
import { resolve } from 'node:path'

const dir = resolve(process.argv[2] ?? '.')
const { runCli } = await import('../src/cli/run')
const { mountSteps } = await import('../src/plugins/mount')

let out = ''
const write = process.stdout.write.bind(process.stdout)
process.stdout.write = ((chunk: string) => {
  out += chunk
  return true
}) as typeof process.stdout.write

const t0 = performance.now()
const code = await runCli(['scan', dir])
const ms = performance.now() - t0
process.stdout.write = write

const summary = /discovered (\d+) component\(s\), (\d+) scenario\(s\)/.exec(out)
const failing = /failing scenario\(s\): (.+)/.exec(out)

write(
  `RESULT ${JSON.stringify({
    ms: Math.round(ms),
    exit: code,
    gcCalls: mountSteps.get('gc()')?.calls ?? 0,
    gcMs: Math.round(mountSteps.get('gc()')?.ms ?? 0),
    mounts: mountSteps.get('real mount')?.calls ?? 0,
    components: Number(summary?.[1] ?? 0),
    scenarios: Number(summary?.[2] ?? 0),
    failing: failing?.[1]?.trim() ?? '',
  })}\n`,
)
process.exit(0)
