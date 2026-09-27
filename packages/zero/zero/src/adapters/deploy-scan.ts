import { apiFilePathToPattern, isApiRoute } from '@pyreon/compiler/fs-route-convention'
import { filePathToUrlPath, readLiteralExports, scanRouteFiles } from '../fs-router'
import { type ParsedCron, parseCron } from './cron'
import { type DeployTargets, EMPTY_DEPLOY_TARGETS, type ScheduledRoute } from './deploy-targets'

// Build-time only: this module parses route files (oxc), so it must never be
// reachable from the runtime adapter barrel — the edge bundle would have to
// resolve the parser's native binding. Only the SSR plugin imports it.

function stringLiteral(literal: string | undefined): string | undefined {
  if (literal === undefined) return undefined
  const m = /^(['"`])([^'"`\\]*)\1$/.exec(literal.trim())
  return m ? m[2] : undefined
}

/**
 * Scan `routesDir` and collect every `runtime` / `schedule` declaration.
 * Throws a `[Pyreon]` error naming the file on any declaration the build
 * cannot honour — an unreadable (non-literal) value, an unknown runtime, a
 * schedule on a page route or a dynamic API route, or an invalid cron.
 */
export async function collectDeployTargets(routesDir: string): Promise<DeployTargets> {
  const { existsSync } = await import('node:fs')
  if (!existsSync(routesDir)) return EMPTY_DEPLOY_TARGETS
  const { readFile } = await import('node:fs/promises')
  const { join } = await import('node:path')

  const edgeRoutes: { pattern: string; file: string }[] = []
  const nodeRoutes: { pattern: string; file: string }[] = []
  const schedules: ScheduledRoute[] = []
  const files = (await scanRouteFiles(routesDir)).sort()
  for (const file of files) {
    const source = await readFile(join(routesDir, file), 'utf-8')
    if (!/\b(runtime|schedule)\b/.test(source)) continue
    const found = readLiteralExports(source, file, ['runtime', 'schedule'])
    const api = isApiRoute(file)
    const pattern = api ? apiFilePathToPattern(file) : filePathToUrlPath(file.replace(/\.[jt]sx?$/, ''))

    const runtime = found.get('runtime')
    if (runtime) {
      const value = stringLiteral(runtime.literal)
      if (value !== 'edge' && value !== 'nodejs') {
        throw new Error(
          `[Pyreon] ${file}: \`export const runtime\` must be the literal 'edge' or 'nodejs' (got ${runtime.literal ?? 'a non-literal value'}). The build reads it without executing the file, so write it as a plain string.`,
        )
      }
      if (value === 'edge') edgeRoutes.push({ pattern, file })
      else nodeRoutes.push({ pattern, file })
    }

    const schedule = found.get('schedule')
    if (schedule) {
      const value = stringLiteral(schedule.literal)
      if (value === undefined) {
        throw new Error(
          `[Pyreon] ${file}: \`export const schedule\` must be a plain string literal cron expression (got ${schedule.literal ?? 'a non-literal value'}).`,
        )
      }
      if (!api) {
        throw new Error(
          `[Pyreon] ${file}: \`export const schedule\` is only supported on API routes (src/routes/api/*.ts) — a cron job calls a URL with GET, which needs a GET handler, not a page.`,
        )
      }
      if (pattern.includes(':')) {
        throw new Error(
          `[Pyreon] ${file}: a scheduled API route cannot be dynamic (${pattern}) — the platform cron needs one concrete path to call. Move the schedule to a static route.`,
        )
      }
      if (!/export\s+(async\s+)?function\s+GET\b|export\s+const\s+GET\b|export\s*\{[^}]*\bGET\b/.test(source)) {
        throw new Error(
          `[Pyreon] ${file}: declares \`schedule\` but exports no GET handler — platform crons invoke the route with GET. Add \`export function GET() { … }\`.`,
        )
      }
      let cron: ParsedCron
      try {
        cron = parseCron(value)
      } catch (err) {
        throw new Error(
          `[Pyreon] ${file}: invalid schedule "${value}": ${(err instanceof Error ? err.message : String(err)).replace(/^\[Pyreon\] cron /, '')}.`,
          { cause: err },
        )
      }
      schedules.push({ path: pattern, schedule: cron.expression, cron, file })
    }
  }
  return { edgeRoutes, nodeRoutes, schedules }
}

