/**
 * Gzip size per task, per library: the same task bundled the same way for every
 * arm (Bun.build, minify, target browser, NODE_ENV=production, ESM, tree-shaken).
 * Run `bun run bench:size` (it builds `lib/` first: the Pyreon arms bundle the
 * SHIPPED build).
 *
 * Each entry imports ONLY what the task needs and uses it once, so the number is
 * the size an app pays for that task. `@pyreon/format` (reactive entry) is shown
 * twice: with `@pyreon/core` + `@pyreon/reactivity` left external (an app that
 * already ships them pays only the difference) and with them bundled (a
 * standalone worst case). `raw Intl` is a hand-written cached helper of the kind
 * an app writes (`Map` keyed by locale + options, `JSON.stringify` for the key);
 * `toLocaleString` is the builtin (0 bytes).
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

declare const Bun: {
  build(options: {
    entrypoints: string[]
    minify?: boolean
    target?: string
    external?: string[]
    define?: Record<string, string>
    format?: string
  }): Promise<{ success: boolean; logs: unknown[]; outputs: Array<{ text(): Promise<string> }> }>
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)))
// Under node_modules (git-ignored and never linted); bare imports resolve from the package.
const OUT = join(ROOT, '..', 'node_modules', '.bench', 'size')
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

const CORE = '../../../lib/core.js'
const INDEX = '../../../lib/index.js'

const RAW = `const cache = new Map()
const get = (C, l, o) => { const k = C.name + l + JSON.stringify(o); let f = cache.get(k); if (!f) cache.set(k, (f = new C(l, o))); return f }`

interface Arm {
  label: string
  source: string
  /** Leave `@pyreon/core` and `@pyreon/reactivity` external. */
  externalPyreon?: boolean
}

interface Task {
  name: string
  arms: Arm[]
}

const tasks: Task[] = [
  {
    name: 'format a number',
    arms: [
      { label: '@pyreon/format/core', source: `import { formatNumber } from '${CORE}'\nconsole.log(formatNumber(1234.5, { locale: 'en-US' }))` },
      { label: '@pyreon/format (reactive), deps external', externalPyreon: true, source: `import { formatNumber } from '${INDEX}'\nconsole.log(formatNumber(1234.5))` },
      { label: '@pyreon/format (reactive), deps bundled', source: `import { formatNumber } from '${INDEX}'\nconsole.log(formatNumber(1234.5))` },
      { label: '@formatjs/intl', source: `import { createIntl, createIntlCache } from '@formatjs/intl'\nconst intl = createIntl({ locale: 'en-US' }, createIntlCache())\nconsole.log(intl.formatNumber(1234.5))` },
      { label: 'raw Intl + a cache helper', source: `${RAW}\nconsole.log(get(Intl.NumberFormat, 'en-US', undefined).format(1234.5))` },
      { label: 'toLocaleString', source: `console.log((1234.5).toLocaleString('en-US'))` },
    ],
  },
  {
    name: 'format bytes',
    arms: [
      { label: '@pyreon/format/core', source: `import { formatBytes } from '${CORE}'\nconsole.log(formatBytes(1536, { locale: 'en-US' }))` },
      { label: 'pretty-bytes', source: `import prettyBytes from 'pretty-bytes'\nconsole.log(prettyBytes(1536))` },
    ],
  },
  {
    name: 'format a duration',
    arms: [
      { label: '@pyreon/format/core', source: `import { formatDuration } from '${CORE}'\nconsole.log(formatDuration(3905000, { locale: 'en-US' }))` },
      { label: 'pretty-ms', source: `import prettyMilliseconds from 'pretty-ms'\nconsole.log(prettyMilliseconds(3905000))` },
      { label: 'humanize-duration', source: `import humanizeDuration from 'humanize-duration'\nconsole.log(humanizeDuration(3905000))` },
    ],
  },
  {
    name: 'format a date',
    arms: [
      { label: '@pyreon/format/core', source: `import { formatDate } from '${CORE}'\nconsole.log(formatDate('2026-11-18', { locale: 'en-US' }))` },
      { label: '@formatjs/intl', source: `import { createIntl, createIntlCache } from '@formatjs/intl'\nconst intl = createIntl({ locale: 'en-US' }, createIntlCache())\nconsole.log(intl.formatDate(new Date(2026, 10, 18)))` },
      { label: 'raw Intl + a cache helper', source: `${RAW}\nconsole.log(get(Intl.DateTimeFormat, 'en-US', { dateStyle: 'medium' }).format(new Date(2026, 10, 18)))` },
      { label: 'toLocaleString', source: `console.log(new Date(2026, 10, 18).toLocaleDateString('en-US', { dateStyle: 'medium' }))` },
    ],
  },
  {
    name: 'format a relative time',
    arms: [
      { label: '@pyreon/format/core', source: `import { formatRelativeTo } from '${CORE}'\nconsole.log(formatRelativeTo(1000, 301000, { locale: 'en-US' }))` },
      { label: '@formatjs/intl', source: `import { createIntl, createIntlCache } from '@formatjs/intl'\nconst intl = createIntl({ locale: 'en-US' }, createIntlCache())\nconsole.log(intl.formatRelativeTime(-5, 'minute'))` },
      { label: 'raw Intl + a cache helper', source: `${RAW}\nconsole.log(get(Intl.RelativeTimeFormat, 'en-US', { numeric: 'auto' }).format(-5, 'minute'))` },
    ],
  },
  {
    name: 'the whole set: number, currency, bytes, duration, date, relative time, list',
    arms: [
      {
        label: '@pyreon/format/core',
        source: `import { formatNumber, formatCurrency, formatBytes, formatDuration, formatDate, formatRelativeTo, formatList } from '${CORE}'\nconst o = { locale: 'en-US' }\nconsole.log(formatNumber(1234.5, o), formatCurrency(9.99, 'EUR', o), formatBytes(1536, o), formatDuration(3905000, o), formatDate('2026-11-18', o), formatRelativeTo(1000, 301000, o), formatList(['a', 'b'], o))`,
      },
      {
        label: '@pyreon/format (reactive), deps external',
        externalPyreon: true,
        source: `import { formatNumber, formatCurrency, formatBytes, formatDuration, formatDate, formatRelativeTo, formatList } from '${INDEX}'\nconsole.log(formatNumber(1234.5), formatCurrency(9.99, 'EUR'), formatBytes(1536), formatDuration(3905000), formatDate('2026-11-18'), formatRelativeTo(1000, 301000), formatList(['a', 'b']))`,
      },
      {
        label: '@pyreon/format (reactive), deps bundled',
        source: `import { formatNumber, formatCurrency, formatBytes, formatDuration, formatDate, formatRelativeTo, formatList } from '${INDEX}'\nconsole.log(formatNumber(1234.5), formatCurrency(9.99, 'EUR'), formatBytes(1536), formatDuration(3905000), formatDate('2026-11-18'), formatRelativeTo(1000, 301000), formatList(['a', 'b']))`,
      },
      {
        label: '@formatjs/intl + pretty-bytes + pretty-ms',
        source: `import { createIntl, createIntlCache } from '@formatjs/intl'\nimport prettyBytes from 'pretty-bytes'\nimport prettyMilliseconds from 'pretty-ms'\nconst intl = createIntl({ locale: 'en-US' }, createIntlCache())\nconsole.log(intl.formatNumber(1234.5), intl.formatNumber(9.99, { style: 'currency', currency: 'EUR' }), prettyBytes(1536), prettyMilliseconds(3905000), intl.formatDate(new Date(2026, 10, 18)), intl.formatRelativeTime(-5, 'minute'), intl.formatList(['a', 'b']))`,
      },
      {
        label: 'raw Intl + a cache helper (+ pretty-bytes, pretty-ms)',
        source: `${RAW}\nimport prettyBytes from 'pretty-bytes'\nimport prettyMilliseconds from 'pretty-ms'\nconsole.log(get(Intl.NumberFormat, 'en-US').format(1234.5), get(Intl.NumberFormat, 'en-US', { style: 'currency', currency: 'EUR' }).format(9.99), prettyBytes(1536), prettyMilliseconds(3905000), get(Intl.DateTimeFormat, 'en-US', { dateStyle: 'medium' }).format(new Date(2026, 10, 18)), get(Intl.RelativeTimeFormat, 'en-US', { numeric: 'auto' }).format(-5, 'minute'), get(Intl.ListFormat, 'en-US').format(['a', 'b']))`,
      },
    ],
  },
]

const gz = (text: string): number => gzipSync(text, { level: 9 }).length

let n = 0
console.log(`Gzip bytes per task; Bun.build, minify, browser target, NODE_ENV=production. ${new Date().toISOString().slice(0, 10)}\n`)

for (const task of tasks) {
  console.log(`### ${task.name}\n\n| library | gzip (B) | raw (B) |\n| --- | ---: | ---: |`)
  for (const arm of task.arms) {
    const file = join(OUT, `e${n++}.js`)
    writeFileSync(file, `${arm.source}\n`)
    const result = await Bun.build({
      entrypoints: [file],
      minify: true,
      target: 'browser',
      format: 'esm',
      define: { 'process.env.NODE_ENV': '"production"' },
      ...(arm.externalPyreon ? { external: ['@pyreon/core', '@pyreon/reactivity'] } : {}),
    })
    if (!result.success) throw new Error(`[Pyreon] [format-size] build failed: ${task.name} / ${arm.label}\n${JSON.stringify(result.logs)}`)
    const text = await result.outputs[0]!.text()
    console.log(`| ${arm.label} | ${gz(text)} | ${text.length} |`)
  }
  console.log('')
}
