/**
 * Bundle size of the SAME task set per library: the ten operations of `time-rivals.ts` (add days and months, diff in
 * days, compare, start of week and month, month grid, parse ISO, instant to wall time and back in a zone), tree-shaken.
 *
 * Run: `bun run bench:bundle` (from packages/fundamentals/time). No timing, so load does not matter.
 *
 * Every arm is bundled by the same Bun bundler with the same settings (minify, target browser, NODE_ENV=production
 * defined, one entry per arm that imports only that arm's `Api` builder and calls it so nothing is dropped) and measured
 * gzip -9. The entry includes the arm's adapter code (the string-in / string-out glue that is also timed), which is
 * small next to the library. Temporal and Date are platform built-ins: their figure is the adapter alone.
 */
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

const ARMS = [
  { id: 'pyreon', label: 'Pyreon (@pyreon/time/core)', file: 'pyreon', fn: 'pyreonApi', pkg: undefined },
  { id: 'date', label: 'Date (hand-written UTC code)', file: 'date', fn: 'dateApi', pkg: undefined },
  { id: 'temporal', label: 'Temporal (native, adapter only)', file: 'temporal', fn: 'temporalApi', pkg: undefined },
  { id: 'date-fns', label: 'date-fns + @date-fns/tz', file: 'date-fns', fn: 'dateFnsApi', pkg: 'date-fns' },
  { id: 'dayjs', label: 'Day.js + utc, timezone, isoWeek', file: 'dayjs', fn: 'dayjsApi', pkg: 'dayjs' },
  { id: 'luxon', label: 'Luxon', file: 'luxon', fn: 'luxonApi', pkg: 'luxon' },
] as const

const versionOf = (pkg: string): string => (JSON.parse(require('node:fs').readFileSync(require.resolve(`${pkg}/package.json`, { paths: [here] }), 'utf8')) as { version: string }).version

const rows: { label: string; raw: number; gzip: number }[] = []

for (const arm of ARMS) {
  const entry = join(here, `.bundle-entry-${arm.id}.ts`)

  await Bun.write(entry, `import { ${arm.fn} } from './arms/${arm.file}'\nconsole.log(Object.values(${arm.fn}()))\n`)
  const result = await Bun.build({ entrypoints: [entry], minify: true, target: 'browser', define: { 'process.env.NODE_ENV': '"production"' } })

  if (!result.success) throw new Error(`[Pyreon] bench: bundle ${arm.id} failed: ${result.logs.join('\n')}`)
  const code = await result.outputs[0]!.text()

  rows.push({ label: arm.label, raw: code.length, gzip: gzipSync(code, { level: 9 }).length })
  await Bun.file(entry).delete()
}

console.log(`bun ${Bun.version} · ${new Date().toISOString().slice(0, 10)} · versions: ${ARMS.filter((a) => a.pkg).map((a) => `${a.pkg}@${versionOf(a.pkg!)}`).join(' · ')}`)
console.log('| arm | minified | gzip -9 |\n| --- | ---: | ---: |')
for (const r of [...rows].sort((a, b) => a.gzip - b.gzip)) console.log(`| ${r.label} | ${(r.raw / 1024).toFixed(1)} kB | ${(r.gzip / 1024).toFixed(2)} kB |`)
console.log(resolve(here))
