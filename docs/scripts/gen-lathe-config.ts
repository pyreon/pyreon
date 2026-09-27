#!/usr/bin/env bun
/**
 * Generate the Lathe configuration reference from the `LatheSection` TYPE.
 *
 * The table in `lathe.md` used to be written by hand, and a key added to the
 * type (or a default changed in `resolveConfig`) left it describing a config
 * that no longer existed. It is now rendered from the interface itself: each
 * key's type from the checker (aliases expanded, so `client` lists its
 * values), its meaning from the first paragraph of its JSDoc, and its default
 * from the `@default` tag. `check-generated-fresh` fails when the committed
 * table and the type disagree.
 *
 * Writes between the `gen:lathe-config:start` / `gen:lathe-config:end` MDX
 * comment markers (MDX has no HTML comments, so they are `{/* … *\/}` blocks)
 * in `docs/src/content/docs/lathe.md`. Run `bun docs/scripts/gen-lathe-config.ts`.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SOURCE = join(REPO_ROOT, 'packages', 'tools', 'lathe', 'src', 'core', 'config.ts')
const PAGE = join(REPO_ROOT, 'docs', 'src', 'content', 'docs', 'lathe.md')
const START = '{/* gen:lathe-config:start */}'
const END = '{/* gen:lathe-config:end */}'

const program = ts.createProgram([SOURCE], {
  strict: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  skipLibCheck: true,
  noEmit: true,
})
const checker = program.getTypeChecker()
const file = program.getSourceFile(SOURCE)
if (!file) throw new Error(`[gen-lathe-config] cannot read ${SOURCE}`)

let section: ts.InterfaceDeclaration | undefined
ts.forEachChild(file, (node) => {
  if (ts.isInterfaceDeclaration(node) && node.name.text === 'LatheSection') section = node
})
if (!section) throw new Error('[gen-lathe-config] no `interface LatheSection` in core/config.ts')

/** The type as a reader wants it: a union alias spelled out, an array of one too. */
function typeText(member: ts.PropertySignature): string {
  const type = checker.getNonNullableType(checker.getTypeAtLocation(member))
  const flags = ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.InTypeAlias
  if (checker.isArrayType(type)) {
    const [item] = checker.getTypeArguments(type as ts.TypeReference)
    if (item) return `${item.isUnion() ? `(${checker.typeToString(item, undefined, flags)})` : checker.typeToString(item, undefined, flags)}[]`
  }
  // `Readonly<Record<string, X>>` prints as an index-signature literal;
  // name it the way the config is written instead.
  const index = checker.getIndexInfosOfType(type)
  if (index.length === 1 && type.getProperties().length === 0) {
    return `Record<string, ${checker.typeToString((index[0] as ts.IndexInfo).type)}>`
  }
  return checker.typeToString(type, undefined, flags)
}

/** First paragraph of the JSDoc, on one line. */
function meaning(member: ts.PropertySignature): string {
  const doc = ts.displayPartsToString(member.symbol?.getDocumentationComment(checker) ?? [])
  return (doc.split(/\n\s*\n/)[0] ?? '').replace(/\s+/g, ' ').trim()
}

function defaultOf(member: ts.PropertySignature): string {
  const tag = ts.getJSDocTags(member).find((t) => t.tagName.text === 'default')
  const text = typeof tag?.comment === 'string' ? tag.comment : ts.getTextOfJSDocComment(tag?.comment)
  if (!text) return '—'
  return /^['[\d]|^(true|false)$/.test(text.trim()) ? `\`${text.trim()}\`` : text.trim()
}

/** Markdown table cells cannot hold a raw `|`. */
const cell = (s: string): string => s.replace(/\\/g, '\\\\').replace(/\|/g, '\\|')

const rows: string[] = []
// `projects` repeats every other key, so it reads last.
const members = [...section.members].sort((a, b) => Number(isProjects(a)) - Number(isProjects(b)))
function isProjects(m: ts.TypeElement): boolean {
  return ts.isPropertySignature(m) && ts.isIdentifier(m.name) && m.name.text === 'projects'
}
for (const m of members) {
  if (!ts.isPropertySignature(m) || !m.name || !ts.isIdentifier(m.name)) continue
  const name = m.name.text
  const type = name === 'projects' ? '`{ name, input, …any key above }[]`' : `\`${cell(typeText(m))}\``
  rows.push(`| \`${name}\` | ${type} | ${cell(defaultOf(m))} | ${cell(meaning(m))} |`)
}

const table = [
  START,
  '{/* Generated from `LatheSection` in packages/tools/lathe/src/core/config.ts by',
  '    docs/scripts/gen-lathe-config.ts. Edit the type and its JSDoc, not this table. */}',
  '',
  '| key | type | default | meaning |',
  '| --- | --- | --- | --- |',
  ...rows,
  END,
].join('\n')

const page = readFileSync(PAGE, 'utf8')
const from = page.indexOf(START)
const to = page.indexOf(END)
if (from < 0 || to < 0) throw new Error(`[gen-lathe-config] ${PAGE} has no ${START} … ${END} markers`)
const next = page.slice(0, from) + table + page.slice(to + END.length)
if (next !== page) writeFileSync(PAGE, next)
process.stdout.write(`[gen-lathe-config] ${rows.length} keys → docs/src/content/docs/lathe.md\n`)
