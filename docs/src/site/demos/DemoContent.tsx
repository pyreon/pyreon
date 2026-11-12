import type { VNodeChild } from '@pyreon/core'
import { For, Show } from '@pyreon/core'
import { signal, watch } from '@pyreon/reactivity'
import { Callout, defineCollection } from '@pyreon/zero-content'
import { z } from 'zod'
import { font, paper, radius, text } from '../theme'
import { el, tone, txt } from '../kit/bases'
import { DemoSurface, GlowCard } from '../kit/cards'
import { DemoGrid } from '../kit/demo'
import { CardNote } from '../kit/demo-parts'
import { Eyebrow } from '../kit/type'

/**
 * Content demo (`content.json` → demo): edit a Markdown page; the frontmatter
 * is checked against a real `defineCollection` with a Zod 4 schema (the
 * Standard Schema call the content plugin makes at build time), and a
 * missing field prints the plugin's own error text. The tip renders through
 * zero-content's real `Callout`. The preview itself uses a small Markdown
 * subset in the page; the build runs the full remark pipeline, which does
 * not ship to the browser. The note under the editor says so.
 */
const FILE = 'src/content/docs/install.md'

const docs = defineCollection({
  type: 'pages',
  schema: z.object({ title: z.string(), description: z.string() }),
})

const INITIAL = `---
title: Install
description: Get Pyreon running in a minute.
---

# Install

Create a project with one command.

:::tip
Use bun for the fastest installs.
:::

## Next steps

Read the **routing** guide.`

/** Flat `key: value` frontmatter, the shape this page uses. */
function splitFrontmatter(source: string): { data: Record<string, string>; body: string } {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(source)
  if (!m) return { data: {}, body: source }
  const data: Record<string, string> = {}
  for (const line of (m[1] ?? '').split('\n')) {
    const i = line.indexOf(':')
    if (i > 0) data[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
  return { data, body: source.slice(m[0].length) }
}

/**
 * The content plugin's message (`schema-validate.ts` `formatSchemaIssues`,
 * which is build-side and not exported to the browser), line for line.
 */
function formatIssues(
  issues: readonly { message: string; path?: readonly unknown[] | undefined }[],
): string {
  const lines = issues.map((i) => {
    const path = (i.path ?? [])
      .map((p) =>
        typeof p === 'object' && p !== null && 'key' in p
          ? String((p as { key: unknown }).key)
          : String(p),
      )
      .join('.')
    return path ? `  - ${path}: ${i.message}` : `  - ${i.message}`
  })
  return `[@pyreon/zero-content] ${FILE}: frontmatter does not match collection "docs" schema (${issues.length} issue${issues.length === 1 ? '' : 's'}):\n${lines.join('\n')}\n\nbuild failed`
}

const Strong = txt
  .config({ name: 'ContentStrong' })
  .attrs({ tag: 'strong' })
  .theme(() => ({ fontWeight: 650, color: paper.text }))
const InlineCode = txt
  .config({ name: 'ContentCode' })
  .attrs({ tag: 'code' })
  .theme(() => ({
    fontFamily: font.mono,
    fontSize: '0.9em',
    paddingLeft: 4,
    paddingRight: 4,
    borderRadius: 4,
    backgroundColor: paper.line,
  }))

function inline(s: string): VNodeChild[] {
  return s.split(/(\*\*[^*]+\*\*|`[^`]+`)/).map((part) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4)
      return <Strong>{part.slice(2, -2)}</Strong>
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2)
      return <InlineCode>{part.slice(1, -1)}</InlineCode>
    return part
  })
}

type Block =
  | { kind: 'h1' | 'h2' | 'p'; text: string }
  | { kind: 'callout'; type: 'tip' | 'note' | 'warning'; text: string }

function blocks(body: string): Block[] {
  const out: Block[] = []
  const lines = body.split('\n')
  let para: string[] = []
  const flush = () => {
    if (para.length) out.push({ kind: 'p', text: para.join(' ') })
    para = []
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const dir = /^:::(tip|note|warning)\s*$/.exec(line)
    if (dir) {
      flush()
      const inner: string[] = []
      for (i++; i < lines.length && (lines[i] ?? '').trim() !== ':::'; i++)
        inner.push(lines[i] ?? '')
      out.push({
        kind: 'callout',
        type: dir[1] as 'tip' | 'note' | 'warning',
        text: inner.join(' '),
      })
    } else if (line.startsWith('## ')) {
      flush()
      out.push({ kind: 'h2', text: line.slice(3) })
    } else if (line.startsWith('# ')) {
      flush()
      out.push({ kind: 'h1', text: line.slice(2) })
    } else if (!line.trim()) flush()
    else para.push(line)
  }
  flush()
  return out
}

const Editor = el
  .config({ name: 'ContentEditor' })
  .attrs({ block: true })
  .theme((_t, m) => ({
    extendCss: `
      & textarea {
        box-sizing: border-box; display: block; width: 100%; min-height: 340px; resize: vertical; margin: 0; padding: 14px;
        border: 1px solid ${tone(m, 'line')}; border-radius: ${radius.note}px; background: ${tone(m, 'well')}; color: ${tone(m, 'text')};
        font: ${text.code.size}px/${text.code.lineHeight} ${font.mono};
      }
      & textarea:focus-visible { outline: 2px solid ${tone(m, 'focus')}; outline-offset: 2px; }
    `,
  }))

const Meta = txt
  .config({ name: 'ContentMeta' })
  .attrs({ tag: 'p' })
  .theme(() => ({
    margin: 0,
    marginBottom: 10,
    fontFamily: font.mono,
    fontSize: 12,
    color: paper.ok,
  }))

const Page = el
  .config({ name: 'ContentPage' })
  .attrs({ tag: 'article', block: true })
  .theme(() => ({
    color: paper.text,
    fontSize: 15,
    lineHeight: 1.6,
    extendCss: `
      & h3 { margin: 0 0 8px; font-size: 26px; line-height: 1.2; }
      & h4 { margin: 18px 0 6px; font-size: 18px; }
      & p { margin: 0 0 10px; color: ${paper.mist}; }
      & .callout { display: block; margin: 10px 0; padding: 10px 14px; border-left: 3px solid ${paper.accent}; border-radius: 6px; background: ${paper.field}; color: ${paper.text}; }
      & .callout__title { display: inline-flex; gap: 6px; font-weight: 600; margin-right: 6px; }
      & .callout__body, & .callout__body p { display: inline; margin: 0; color: ${paper.text}; }
    `,
  }))

const ErrorBox = txt
  .config({ name: 'ContentError' })
  .attrs({ tag: 'pre' })
  .theme(() => ({
    margin: 0,
    padding: 14,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    borderRadius: 8,
    border: `1px solid ${paper.line}`,
    backgroundColor: paper.field,
    fontFamily: font.mono,
    fontSize: 12.5,
    lineHeight: 1.6,
    color: paper.err,
  }))

export default function DemoContent() {
  const source = signal(INITIAL)
  const result = signal<
    { ok: true; description: string; blocks: Block[] } | { ok: false; error: string }
  >({
    ok: true,
    description: 'Get Pyreon running in a minute.',
    blocks: blocks(splitFrontmatter(INITIAL).body),
  })

  // The same Standard Schema call the content plugin makes for every file.
  let run = 0
  watch(
    () => source(),
    (src) => {
      void check(src)
    },
  )
  async function check(src: string) {
    const id = ++run
    const { data, body } = splitFrontmatter(src)
    const v = await docs.schema['~standard'].validate(data)
    if (id !== run) return
    if (v.issues) result.set({ ok: false, error: formatIssues(v.issues) })
    else result.set({ ok: true, description: v.value.description, blocks: blocks(body) })
  }

  const ok = () => {
    const r = result()
    return r.ok ? r : null
  }

  return (
    <DemoGrid>
      <GlowCard padding="compact">
        <Eyebrow id="ct-src-label">{FILE}</Eyebrow>
        <Editor>
          <textarea
            id="ct-src"
            aria-labelledby="ct-src-label"
            spellCheck={false}
            value={() => source()}
            onInput={(e: Event) => source.set((e.currentTarget as HTMLTextAreaElement).value)}
          />
        </Editor>
        <CardNote>
          The frontmatter check is the real one: a defineCollection Zod schema and the content
          plugin's error text. The preview renders a small Markdown subset in the page; the build
          uses the full remark pipeline.
        </CardNote>
      </GlowCard>
      <DemoSurface aria-label="Rendered page">
        <div aria-live="polite">
          <Show
            when={() => ok() !== null}
            fallback={
              <ErrorBox>
                {() => {
                  const r = result()
                  return r.ok ? '' : r.error
                }}
              </ErrorBox>
            }
          >
            <Meta>{() => `✓ valid · ${ok()?.description ?? ''}`}</Meta>
            <Page>
              <For
                each={() =>
                  (ok()?.blocks ?? []).map((b, i) => ({ b, i, key: `${i}:${b.kind}:${b.text}` }))
                }
                by={(x) => x.key}
              >
                {(x) =>
                  // The preview sits under this section's h2: its page title is
                  // an h3 here (one h1 per page), styled as the page's title.
                  x.b.kind === 'h1' ? (
                    <h3>{inline(x.b.text)}</h3>
                  ) : x.b.kind === 'h2' ? (
                    <h4>{inline(x.b.text)}</h4>
                  ) : x.b.kind === 'callout' ? (
                    <Callout type={x.b.type}>{inline(x.b.text)}</Callout>
                  ) : (
                    <p>{inline(x.b.text)}</p>
                  )
                }
              </For>
            </Page>
          </Show>
        </div>
      </DemoSurface>
    </DemoGrid>
  )
}
