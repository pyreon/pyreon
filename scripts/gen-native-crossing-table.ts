#!/usr/bin/env bun
/**
 * Generates the "how each package crosses to native" table in
 * `docs/src/content/docs/multiplatform-libraries.md` from the SAME registry the
 * native coverage gate enforces (`REGISTRY` in `check-native-coverage.ts`).
 *
 * The coverage gate proves each entry compiles; this renders what the entry
 * CLAIMS, so the page a reader follows cannot disagree with the registry the
 * gate runs. Editing the table by hand fails `--check` (wired into validate-fast).
 *
 *   bun scripts/gen-native-crossing-table.ts            # rewrite the block
 *   bun scripts/gen-native-crossing-table.ts --check    # exit 1 when stale
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { type Mechanism, REGISTRY, WEBVIEW_HOST_CAVEATS } from './check-native-coverage'

const DOC = join(import.meta.dirname, '../docs/src/content/docs/multiplatform-libraries.md')
const START = '{/* gen:native-crossing:start */}'
const END = '{/* gen:native-crossing:end */}'

const SECTIONS: ReadonlyArray<{ mechanism: Mechanism; title: string; blurb: string }> = [
  {
    mechanism: 'pmtc-lowers',
    title: 'Lowers — the authoring API compiles to SwiftUI and Compose',
    blurb: 'Write it once in TypeScript; the compiler emits native code for both targets with no warnings.',
  },
  {
    mechanism: 'native-container',
    title: 'Native runtime — the package ships a Swift and a Kotlin runtime',
    blurb: 'The same API is backed by a runtime shipped as Swift and Kotlin source.',
  },
  {
    mechanism: 'webview-host',
    title: 'WebView-hosted — the same web engine inside a native shell',
    blurb: WEBVIEW_HOST_CAVEATS,
  },
  {
    mechanism: 'partial',
    title: 'Partial — a declared subset crosses; the rest warns by name',
    blurb: 'Only the listed surface lowers. Anything else produces a named compiler warning rather than a silent drop.',
  },
  {
    mechanism: 'web-first',
    title: 'Web-first — a gap that is tracked, not hidden',
    blurb: 'Expected to warn today; the coverage gate announces when one starts to cross.',
  },
]

/** Table cells are MDX: braces and pipes would be parsed as expressions / columns. */
function cell(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\{/g, '&#123;')
    .replace(/\}/g, '&#125;')
    .replace(/\|/g, '&#124;')
    .replace(/</g, '&lt;')
}

export function renderCrossingTable(): string {
  const out: string[] = [
    START,
    '',
    '> Generated from the native coverage registry (`scripts/check-native-coverage.ts`) by',
    '> `bun scripts/gen-native-crossing-table.ts` — edit the registry, not this table. The',
    '> coverage gate compiles every entry for both targets; `--check` fails when this drifts.',
    '',
  ]
  for (const { mechanism, title, blurb } of SECTIONS) {
    const members = REGISTRY.filter((e) => e.mechanism === mechanism).sort((a, b) =>
      a.name.localeCompare(b.name),
    )
    if (members.length === 0) continue
    out.push(`### ${title} (${members.length})`, '', cell(blurb), '', '| Package | How it crosses |', '| --- | --- |')
    for (const e of members) out.push(`| \`${e.name}\` | ${cell(e.rationale)} |`)
    out.push('')
  }
  out.push(END)
  return out.join('\n')
}

function main(): number {
  const check = process.argv.includes('--check')
  const doc = readFileSync(DOC, 'utf8')
  const rendered = renderCrossingTable()
  const start = doc.indexOf(START)
  const end = doc.indexOf(END)
  let next: string
  if (start === -1 || end === -1 || end < start) {
    if (check) {
      console.error(`✗ ${DOC} has no ${START} … ${END} block. Run: bun scripts/gen-native-crossing-table.ts`)
      return 1
    }
    next = `${doc.trimEnd()}\n\n## How each package crosses to native\n\n${rendered}\n`
  } else {
    next = doc.slice(0, start) + rendered + doc.slice(end + END.length)
  }
  if (next === doc) {
    console.log(`✓ native crossing table is current (${REGISTRY.length} packages)`)
    return 0
  }
  if (check) {
    console.error(
      '✗ the native crossing table in multiplatform-libraries.md is stale against the coverage registry.\n' +
        '  Run: bun scripts/gen-native-crossing-table.ts',
    )
    return 1
  }
  writeFileSync(DOC, next)
  console.log(`✓ rewrote the native crossing table (${REGISTRY.length} packages)`)
  return 0
}

if (import.meta.main) process.exit(main())
