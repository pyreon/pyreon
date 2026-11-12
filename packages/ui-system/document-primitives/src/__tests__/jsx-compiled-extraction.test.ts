import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { transformJSX_JS } from '@pyreon/compiler'
import { _pp, _rp, Fragment } from '@pyreon/core'
import { jsx, jsxs } from '@pyreon/core/jsx-runtime'
import { render } from '@pyreon/document'
import { signal } from '@pyreon/reactivity'
import { transformSync } from 'esbuild'
import { describe, expect, it } from 'vitest'
import * as primitives from '../index'
import { extractDocNode } from '../useDocumentExport'

interface Node {
  type: string
  props: Record<string, unknown>
  children: (Node | string)[]
}

/** All members of a zip (docx is OOXML) as one string, via the system `unzip`. Throws if it is missing. */
function unzipText(bytes: Uint8Array): string {
  const dir = mkdtempSync(join(tmpdir(), 'pyreon-jsx-docx-'))
  try {
    const file = join(dir, 'out.docx')
    writeFileSync(file, bytes)
    const out = spawnSync('unzip', ['-p', file], {
      encoding: 'latin1',
      maxBuffer: 64 * 1024 * 1024,
    })
    if (out.error || out.status !== 0) {
      throw new Error(
        `unzip failed (the system 'unzip' tool is required): ${out.error?.message ?? out.stderr}`,
      )
    }
    return out.stdout
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// #4303 — a document template written in JSX exported EMPTY.
//
// The production path is: the Pyreon compiler (`transformJSX`) rewrites the
// template (wrapping prop reads in `_pp` / `_rp` reactive-prop thunks and
// dynamic children in accessors), then Vite's OXC lowers the remaining JSX
// with the AUTOMATIC runtime (`jsx()` from `@pyreon/core/jsx-runtime`), which
// puts a component's children in `props.children` and leaves
// `vnode.children` empty. The extractor walked `vnode.children` only, and
// handed components raw reactive-prop thunks instead of values.
//
// Every other test builds trees with `h()` or hand-made vnodes, which carry
// children in `vnode.children` and no thunks — so they all passed. This file
// runs the REAL compiler and the REAL automatic runtime, then exports the
// result to Markdown, HTML and DOCX and checks the content arrived.

const SOURCE = `
import { DocDocument, DocPage, DocHeading, DocText, DocTable, DocList, DocListItem, DocSection, DocLink } from '@pyreon/document-primitives'

// A plain wrapper component (no _documentType) that forwards its children.
function Card(props) {
  return <DocSection direction="row">{props.children}</DocSection>
}

// A wrapper that returns several siblings through a fragment.
function Pair(props) {
  return (
    <>
      <DocText>{props.a}</DocText>
      <DocText>{props.b}</DocText>
    </>
  )
}

export function Report(props) {
  return (
    <DocDocument title={props.title} author="Ada">
      <DocPage>
        <DocHeading level={props.level}>Report for {props.client}</DocHeading>
        <DocText>Static paragraph.</DocText>
        <DocTable columns={props.columns} rows={props.rows} striped />
        <DocList ordered={props.ordered}>
          {props.items.map((item) => <DocListItem>{item}</DocListItem>)}
        </DocList>
        <Card>
          <DocText>Inside a wrapper</DocText>
        </Card>
        <Pair a="first sibling" b={props.second} />
        <DocLink href={props.href}>Read more</DocLink>
      </DocPage>
    </DocDocument>
  )
}
`

/** Compile `SOURCE` exactly as a Vite app does and return the `Report` component. */
function compileReport(): (props: Record<string, unknown>) => unknown {
  const pyreon = transformJSX_JS(SOURCE, 'report.tsx', {}).code
  const lowered = transformSync(pyreon, {
    loader: 'jsx',
    jsx: 'automatic',
    jsxImportSource: '@pyreon/core',
    format: 'esm',
  }).code
  // Bind every import by NAME (the compiler's helpers, the jsx runtime, the
  // primitives) and drop the import statements.
  const body = lowered
    .replace(/^import\s[\s\S]*?from\s*["'][^"']+["'];?$/gm, '')
    .replace(/^export\s+/gm, '')
  const scope: Record<string, unknown> = { ...primitives, _pp, _rp, jsx, jsxs, Fragment }
  const names = Object.keys(scope)
  // oxlint-disable-next-line no-new-func
  return new Function(...names, `${body}\nreturn Report`)(...names.map((n) => scope[n]))
}

const props = {
  title: 'Q4 Report',
  client: 'Acme',
  level: 'h2',
  columns: ['Region', 'Revenue'],
  rows: [
    ['EMEA', '1.2M'],
    ['APAC', '0.9M'],
  ],
  ordered: true,
  items: ['alpha item', 'beta item'],
  second: 'second sibling',
  href: 'https://example.com/more',
}

describe('extractDocNode — JSX templates through the real compiler + automatic runtime', () => {
  it('the compiled source really uses jsx() and reactive-prop thunks (guards the harness)', () => {
    const pyreon = transformJSX_JS(SOURCE, 'report.tsx', {}).code
    expect(pyreon).toContain('_pp(props')
    const lowered = transformSync(pyreon, {
      loader: 'jsx',
      jsx: 'automatic',
      jsxImportSource: '@pyreon/core',
    }).code
    expect(lowered).toContain('@pyreon/core/jsx-runtime')
  })

  it('extracts every child, with reactive props resolved to values', () => {
    const Report = compileReport()
    const tree = extractDocNode(() => Report(props))

    expect(tree.type).toBe('document')
    expect(tree.props).toEqual({ title: 'Q4 Report', author: 'Ada' })
    const page = tree.children[0] as unknown as Node
    expect(page.type).toBe('page')
    const kids = page.children as Node[]
    expect(kids.map((k) => k.type)).toEqual([
      'heading',
      'text',
      'table',
      'list',
      'section',
      'text',
      'text',
      'link',
    ])
    expect(kids[0]).toMatchObject({ props: { level: 2 }, children: ['Report for ', 'Acme'] })
    expect(kids[2]!.props).toMatchObject({
      columns: props.columns,
      rows: props.rows,
      striped: true,
    })
    expect(kids[3]).toMatchObject({
      props: { ordered: true },
      children: [
        { type: 'list-item', children: ['alpha item'] },
        { type: 'list-item', children: ['beta item'] },
      ],
    })
    expect(kids[4]).toMatchObject({ children: [{ type: 'text', children: ['Inside a wrapper'] }] })
    expect(kids[5]!.children).toEqual(['first sibling'])
    expect(kids[6]!.children).toEqual(['second sibling'])
    expect(kids[7]).toMatchObject({ props: { href: props.href }, children: ['Read more'] })
  })

  it('signal-backed (getter) props reach the primitives as live VALUES, not thunks', () => {
    // A getter-shaped prop is what a parent's reactive prop looks like at
    // runtime; `_pp(props, 'level')` then forwards a reactive-prop THUNK. The
    // runtime turns it back into a getter before calling the component; the
    // extractor must too, or `props.level ?? 'h1'` sees a function (level 1)
    // and `props.ordered` is a truthy function.
    const Report = compileReport()
    const title = signal('Draft')
    const level = signal('h3')
    const ordered = signal(false)
    const live = {
      ...props,
      get title() {
        return title()
      },
      get level() {
        return level()
      },
      get ordered() {
        return ordered()
      },
    }
    const first = extractDocNode(() => Report(live))
    const kidsOf = (t: typeof first) => (t.children[0] as unknown as Node).children as Node[]
    expect(first.props.title).toBe('Draft')
    expect(kidsOf(first)[0]!.props).toEqual({ level: 3 })
    expect(kidsOf(first)[3]!.props).toEqual({})
    title.set('Final')
    level.set('h2')
    ordered.set(true)
    const second = extractDocNode(() => Report(live))
    expect(second.props.title).toBe('Final')
    expect(kidsOf(second)[0]!.props).toEqual({ level: 2 })
    expect(kidsOf(second)[3]!.props).toEqual({ ordered: true })
  })

  it('exports the JSX-authored document with its content to Markdown, HTML and DOCX', async () => {
    const Report = compileReport()
    const tree = extractDocNode(() => Report(props)) as Parameters<typeof render>[0]

    const md = (await render(tree, 'md')) as string
    for (const text of [
      'Report for Acme',
      'Static paragraph.',
      'EMEA',
      'alpha item',
      'Inside a wrapper',
      'second sibling',
      'Read more',
    ]) {
      expect(md).toContain(text)
    }
    expect(md).toMatch(/^## Report for Acme/m)

    const html = (await render(tree, 'html')) as string
    for (const text of [
      '<title>Q4 Report</title>',
      'Report for Acme',
      '<td',
      'APAC',
      'beta item',
      'first sibling',
      'https://example.com/more',
    ]) {
      expect(html).toContain(text)
    }

    const docx = await render(tree, 'docx')
    expect(docx).toBeInstanceOf(Uint8Array)
    // A .docx is a zip whose members are deflated — unzip to read the XML.
    const xml = unzipText(docx as Uint8Array)
    for (const text of [
      'Report for Acme',
      'Static paragraph.',
      'EMEA',
      'alpha item',
      'second sibling',
    ]) {
      expect(xml).toContain(text)
    }
  })
})
