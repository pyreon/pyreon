#!/usr/bin/env bun
/**
 * check-e2e-webservers — every webServer in a Playwright config owns its port.
 *
 * Within ONE config:
 * - no two webServer entries wait for the same port;
 * - no entry is a placeholder that serves nothing (`tail -f /dev/null`,
 *   `sleep …`, `true`) and only waits for a port another entry's command
 *   opened. Locally `reuseExistingServer` (on outside CI) hides it; in CI
 *   Playwright first checks that the port is FREE and fails with "is already
 *   used" (#4751: `ssg-subpath`'s CDN project). Each entry must start the
 *   server it waits for.
 *
 * Ports may repeat ACROSS configs: CI runs a batch's suites one after another,
 * and each config's servers stop with it.
 */
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

export interface WebServerLike {
  command?: unknown
  port?: unknown
  url?: unknown
}

const PLACEHOLDER = /^\s*(tail\s+-f\b|sleep\b|true\b|:|cat\b|exit\s+0\b)/

/** Problems in one config's webServer list (empty when it is fine). */
export function webServerProblems(file: string, servers: readonly WebServerLike[]): string[] {
  const problems: string[] = []
  const seen = new Map<string, number>()
  servers.forEach((ws, i) => {
    const key = String(ws.port ?? ws.url ?? '')
    if (key) {
      const first = seen.get(key)
      if (first !== undefined) problems.push(`${file}: webServer #${i + 1} waits for ${key}, which webServer #${first + 1} already uses.`)
      else seen.set(key, i)
    }
    if (typeof ws.command === 'string' && PLACEHOLDER.test(ws.command)) {
      problems.push(
        `${file}: webServer #${i + 1} (${ws.command.trim().slice(0, 40)}) starts nothing and waits for ${key || 'a port'} another command opened — CI refuses a port that is already taken. Give it the command that starts its own server.`,
      )
    }
  })

  return problems
}

if (import.meta.main) {
  const dir = join(import.meta.dir, '..', 'e2e-configs')
  const problems: string[] = []
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.config.ts')).sort()) {
    const mod = (await import(join(dir, f))) as { default?: { webServer?: WebServerLike | WebServerLike[] } }
    const ws = mod.default?.webServer
    problems.push(...webServerProblems(f, Array.isArray(ws) ? ws : ws ? [ws] : []))
  }
  if (problems.length > 0) {
    console.error(`✗ check-e2e-webservers — ${problems.length} problem(s):`)
    for (const p of problems) console.error(`  ${p}`)
    process.exit(1)
  }
  console.log('✓ check-e2e-webservers — every e2e webServer owns its port')
}
