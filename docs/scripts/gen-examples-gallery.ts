#!/usr/bin/env bun
/**
 * Generate the Examples GALLERY page from `docs/src/examples/**\/*.tsx` — a
 * single browsable page that mounts every runnable `<Example>` grouped by
 * topic (TanStack-style examples gallery). The example components already
 * exist + are typechecked; this just surfaces ALL of them (today only ~10 of
 * 45 appear anywhere). Single source of truth: the example files on disk.
 * Run: `bun docs/scripts/gen-examples-gallery.ts` from the repo root.
 */
import { readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { yaml } from './_md-safe'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const EX_DIR = join(REPO_ROOT, 'docs', 'src', 'examples')
const OUT = join(REPO_ROOT, 'docs', 'src', 'content', 'docs', 'examples.md')

const titleCase = (s: string) =>
  s.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bApi\b/g, 'API').replace(/\bSsr\b/g, 'SSR').replace(/\bUi\b/g, 'UI').replace(/\bDom\b/g, 'DOM')

const TOPIC_TITLE: Record<string, string> = {
  'runtime-dom': 'Runtime DOM',
  'ui-core': 'UI Core',
  'state-tree': 'State Tree',
  'url-state': 'URL State',
  dnd: 'Drag & Drop',
  i18n: 'i18n',
  rx: 'Rx',
}

// Collect topic → example slugs.
const topics: { topic: string; title: string; examples: string[] }[] = []
for (const topic of readdirSync(EX_DIR).sort()) {
  const dir = join(EX_DIR, topic)
  if (!statSync(dir).isDirectory()) continue
  const examples = readdirSync(dir)
    .filter((f) => f.endsWith('.tsx'))
    .map((f) => f.replace(/\.tsx$/, ''))
    .sort()
  if (examples.length) topics.push({ topic, title: TOPIC_TITLE[topic] ?? titleCase(topic), examples })
}
const total = topics.reduce((n, t) => n + t.examples.length, 0)

const out: string[] = ['---', `title: ${yaml('Examples')}`, `description: ${yaml(`A gallery of ${total} runnable Pyreon examples — every one mounted live on this page, grouped by topic.`)}`, '---', '']
out.push('# Examples')
out.push('')
out.push(
  `Every example below is a **real, typechecked Pyreon component mounted live on this page** — no sandbox, no install. ${total} examples across ${topics.length} topics. (Generated from \`docs/src/examples/\` by \`docs/scripts/gen-examples-gallery.ts\`.)`,
)
out.push('')
for (const t of topics) {
  out.push(`## ${t.title}`)
  out.push('')
  for (const ex of t.examples) {
    out.push(`### ${titleCase(ex)}`)
    out.push('')
    out.push(`<Example file="./examples/${t.topic}/${ex}" />`)
    out.push('')
  }
}
writeFileSync(OUT, out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n')
console.warn(`[gen-examples-gallery] ${total} examples across ${topics.length} topics → docs/src/content/docs/examples.md`)
