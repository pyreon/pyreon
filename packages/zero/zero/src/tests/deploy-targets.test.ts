import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { cronMatches, parseCron, SCHEDULER_RUNTIME, serializeJobs } from '../adapters/cron'
import { collectDeployTargets } from '../adapters/deploy-scan'
import { checkDeployCapabilities, EMPTY_DEPLOY_TARGETS, needsEdgeBundle, patternToRegex } from '../adapters/deploy-targets'
import type { Adapter } from '../types'

describe('parseCron', () => {
  it('expands the portable grammar', () => {
    const c = parseCron('0,30 9-17/4 * 1-3 1-5')
    expect(c.minute).toEqual([0, 30])
    expect(c.hour).toEqual([9, 13, 17])
    expect(c.month).toEqual([1, 2, 3])
    expect(c.dayOfWeek).toEqual([1, 2, 3, 4, 5])
    expect(c.domRestricted).toBe(false)
    expect(parseCron('0 0 * * 7').dayOfWeek).toEqual([0])
    expect(parseCron('  */15   *  * * * ').expression).toBe('*/15 * * * *')
  })

  it.each([
    ['0 * * *', /expected 5 fields/],
    ['@hourly', /macros like @hourly are not portable/],
    ['60 * * * *', /minute value "60" is out of range 0-59/],
    ['0 24 * * *', /hour value "24" is out of range/],
    ['0 0 0 * *', /day-of-month value "0" is out of range 1-31/],
    ['0 0 * JAN *', /names like MON\/JAN are not portable/],
    ['0 0 * * MON', /day-of-week field "MON"/],
    ['*/0 * * * *', /not valid|step must be/],
    ['5-1 * * * *', /out of range/],
  ])('rejects %s', (expr, message) => {
    expect(() => parseCron(expr)).toThrow(message)
  })
})

describe('SCHEDULER_RUNTIME ≡ cronMatches (differential)', () => {
  // The emitted runner carries its own JS copy of the matcher; evaluate it and
  // compare against the TypeScript function across a sweep of real dates.
  const emitted = new Function(`${SCHEDULER_RUNTIME}\nreturn __pyreonCronMatches`)() as (
    job: unknown,
    date: Date,
  ) => boolean
  const exprs = ['* * * * *', '0 3 * * *', '*/7 1-5 13 * 5', '15 */2 1,15 2-11/3 *', '0 0 * * 0', '30 12 31 12 *']
  it.each(exprs)('%s', (expr) => {
    const cron = parseCron(expr)
    const job = JSON.parse(serializeJobs([{ path: '/x', cron }]))[0]
    let t = Date.UTC(2026, 0, 1)
    let matched = 0
    for (let i = 0; i < 20_000; i++) {
      const d = new Date(t)
      const expected = cronMatches(cron, d)
      expect(emitted(job, d)).toBe(expected)
      if (expected) matched++
      t += 37 * 60_000 // odd stride covers every minute/hour/weekday residue
    }
    if (expr === '* * * * *') expect(matched).toBe(20_000)
  })

  it('cron OR rule: day-of-month OR day-of-week when both are restricted', () => {
    const c = parseCron('0 0 13 * 5')
    expect(cronMatches(c, new Date(Date.UTC(2026, 1, 13)))).toBe(true) // Fri 13th
    expect(cronMatches(c, new Date(Date.UTC(2026, 1, 20)))).toBe(true) // a Friday
    expect(cronMatches(c, new Date(Date.UTC(2026, 2, 13)))).toBe(true) // 13th, Friday too
    expect(cronMatches(c, new Date(Date.UTC(2026, 1, 14)))).toBe(false)
  })
})

describe('patternToRegex', () => {
  const cases: [string, string[], string[]][] = [
    ['/', ['/'], ['/a']],
    ['/edge', ['/edge', '/edge/'], ['/edgex', '/edge/a']],
    ['/posts/:id', ['/posts/1', '/posts/a-b/'], ['/posts', '/posts/1/2']],
    ['/docs/:rest*', ['/docs', '/docs/', '/docs/a/b'], ['/docsx', '/doc']],
    ['/:all*', ['/', '/a/b'], []],
    ['/a.b', ['/a.b'], ['/axb']],
  ]
  it.each(cases)('%s', (pattern, yes, no) => {
    const re = new RegExp(patternToRegex(pattern))
    for (const p of yes) expect(re.test(p), p).toBe(true)
    for (const p of no) expect(re.test(p), p).toBe(false)
  })
})

describe('collectDeployTargets', () => {
  let dir: string
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
  })
  async function routes(files: Record<string, string>): Promise<string> {
    dir = await mkdtemp(join(tmpdir(), 'zero-deploy-'))
    for (const [f, src] of Object.entries(files)) {
      await mkdir(dirname(join(dir, f)), { recursive: true })
      await writeFile(join(dir, f), src)
    }
    return dir
  }

  it('reads runtime + schedule literals', async () => {
    const d = await routes({
      'index.tsx': 'export default () => null',
      'posts/[id].tsx': "export const runtime = 'edge' as const\nexport default () => null",
      'legacy.tsx': 'export const runtime = "nodejs"\nexport default () => null',
      'api/sync.ts': "export const schedule = '*/5 * * * *'\nexport async function GET() { return new Response('ok') }",
    })
    const t = await collectDeployTargets(d)
    expect(t.edgeRoutes).toEqual([{ pattern: '/posts/:id', file: 'posts/[id].tsx' }])
    expect(t.nodeRoutes).toEqual([{ pattern: '/legacy', file: 'legacy.tsx' }])
    expect(t.schedules.map((s) => [s.path, s.schedule])).toEqual([['/api/sync', '*/5 * * * *']])
  })

  it('a missing routes dir yields nothing', async () => {
    expect(await collectDeployTargets('/nonexistent/zero/routes')).toBe(EMPTY_DEPLOY_TARGETS)
  })

  it.each([
    [{ 'a.tsx': "export const runtime = 'worker'\nexport default () => null" }, /a\.tsx: `export const runtime` must be the literal 'edge' or 'nodejs'/],
    [{ 'a.tsx': "const r = 'edge'\nexport const runtime = r\nexport default () => null" }, /a non-literal value/],
    [{ 'a.tsx': "export const schedule = '0 * * * *'\nexport default () => null" }, /only supported on API routes/],
    [{ 'api/[id].ts': "export const schedule = '0 * * * *'\nexport function GET() {}" }, /cannot be dynamic \(\/api\/:id\)/],
    [{ 'api/x.ts': "export const schedule = '0 * * * *'\nexport function POST() {}" }, /exports no GET handler/],
    [{ 'api/x.ts': "export const schedule = '0 25 * * *'\nexport function GET() {}" }, /api\/x\.ts: invalid schedule "0 25 \* \* \*": hour value "25"/],
  ])('rejects %#', async (files, message) => {
    await expect(collectDeployTargets(await routes(files))).rejects.toThrow(message)
  })
})

describe('checkDeployCapabilities / needsEdgeBundle', () => {
  const adapter = (name: string, capabilities?: Adapter['capabilities']): Adapter => ({
    name,
    build: async () => {},
    ...(capabilities ? { capabilities } : {}),
  })
  const edge = { ...EMPTY_DEPLOY_TARGETS, edgeRoutes: [{ pattern: '/e', file: 'e.tsx' }] }
  const node = { ...EMPTY_DEPLOY_TARGETS, nodeRoutes: [{ pattern: '/n', file: 'n.tsx' }] }
  const sched = { ...EMPTY_DEPLOY_TARGETS, schedules: [{ path: '/api/x', schedule: '0 * * * *', cron: parseCron('0 * * * *'), file: 'api/x.ts' }] }

  it('declarations nothing supports fail with the fix', () => {
    expect(() => checkDeployCapabilities(adapter('node'), edge)).toThrow(/"node" adapter has no edge runtime.*e\.tsx/)
    expect(() => checkDeployCapabilities(adapter('node'), sched)).toThrow(/nodeAdapter\(\{ scheduler: true \}\)/)
    expect(() => checkDeployCapabilities(adapter('bun'), sched)).toThrow(/bunAdapter\(\{ scheduler: true \}\)/)
    expect(() => checkDeployCapabilities(adapter('deno', { edgeOnly: true }), node)).toThrow(/runtime = 'nodejs'/)
    expect(() => checkDeployCapabilities(adapter('x', { edgeOnly: true, nodeRoutes: true }), node)).not.toThrow()
    expect(() => checkDeployCapabilities(adapter('node'), EMPTY_DEPLOY_TARGETS)).not.toThrow()
  })

  it('builds the edge bundle only when something will use it', () => {
    expect(needsEdgeBundle(adapter('v', { edgeRoutes: true }), EMPTY_DEPLOY_TARGETS)).toBe(false)
    expect(needsEdgeBundle(adapter('v', { edgeRoutes: true }), edge)).toBe(true)
    expect(needsEdgeBundle(adapter('cf', { edgeRoutes: 'native' }), edge)).toBe(false)
    expect(needsEdgeBundle(adapter('d', { edgeOnly: true }), EMPTY_DEPLOY_TARGETS)).toBe(true)
  })
})
