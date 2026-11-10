/**
 * Spec text through the generated pages into the consumer they are documented
 * for: a `@pyreon/zero-content` collection, which compiles `.md` as MDX.
 *
 * In MDX `{…}` is a JavaScript expression and `<…>` is JSX, so a third-party
 * OpenAPI `summary` of `{globalThis.x = 1}` was not text but CODE -- run at
 * build time (SSG) and in every reader's browser. The only thing in the way was
 * the HTML-comment banner, which MDX cannot parse, so every page failed to
 * compile; a page without it ran the payload.
 *
 * The oracle is the REAL consumer: the zero-content Vite plugin's `transform`
 * (remark + MDX + its own JSX lowering), and then the module it returns is
 * EXECUTED -- a payload that went live sets a `globalThis` sentinel. An
 * assertion on the Markdown string alone would hold the emitter to a
 * spelling, not to what a parser does with it.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import content from '@pyreon/zero-content/plugin'
import { parseSync } from 'oxc-parser'
import { resolveConfig } from '../core/config'
import { generate } from '../core/generate'

// Letters only: `md()` escapes punctuation, and an underscore in the
// sentinel would stop it matching the text the page rightly SHOWS.
const SENTINEL = 'lathePwn'

/** Every shape that opens code in MDX or HTML in Markdown, tagged by slot. */
function payloads(slot: string): string {
  const s = `${SENTINEL}${slot[0]?.toUpperCase()}${slot.slice(1)}`
  return [
    `{globalThis.${s}Expr = 1}`,
    `<b>{globalThis.${s}Jsx = 1}</b>`,
    `<img src="x" onerror="globalThis.${s}Html = 1" />`,
    // A backtick ends the code span the value is rendered into.
    `\` {globalThis.${s}Tick = 1} \``,
    `\`\`\` {globalThis.${s}Fence = 1}`,
    // A backslash in front of the brace must not escape the escaper.
    `\\{globalThis.${s}Bs = 1}`,
    `[x](javascript:globalThis.${s}Link=1)`,
    `:abbr[x]{onclick="globalThis.${s}Dir = 1"}`,
  ].join(' ')
}

const P = (slot: string): string => JSON.stringify(payloads(slot))

const HOSTILE = `
openapi: 3.0.3
info: { title: ${P('title')}, version: ${P('version')}, description: ${P('info')} }
servers: [{ url: 'https://api.test/v1' }]
paths:
  ${JSON.stringify(`/x/{id}/${payloads('path')}`)}:
    get:
      operationId: getX
      tags: [${P('tag')}]
      summary: ${P('summary')}
      description: ${P('desc')}
      parameters:
        - { name: id, in: path, required: true, schema: { type: string } }
        - { name: ${P('query')}, in: query, required: true, schema: { type: string, enum: [${P('enum')}] } }
        - { name: ${P('header')}, in: header, schema: { type: string } }
      responses:
        '200': { content: { application/json: { schema: { $ref: '#/components/schemas/M' } } } }
    post:
      operationId: postX
      tags: [${P('tag')}]
      requestBody: { required: true, content: { ${P('media')}: { schema: { type: string } } } }
      responses: { '204': { description: ok } }
components:
  schemas:
    M:
      type: object
      description: ${P('model')}
      properties:
        ${P('prop')}: { type: string, description: ${P('propdesc')}, enum: [${P('penum')}] }
`

function hostilePages(): [string, string][] {
  const cfg = resolveConfig({
    input: 'x',
    baseUrl: 'https://api.test/v1',
    plugins: ['schemas', 'client', 'queries', 'docs'],
  })
  return generate(HOSTILE, cfg)
    .files.filter((f) => f.path.startsWith('docs/'))
    .map((f) => [f.path, f.contents])
}

const EVAL_DIR = join(import.meta.dirname, `.mdx-eval-${process.pid}`)

afterAll(() => {
  rmSync(EVAL_DIR, { recursive: true, force: true })
})

type Transform = (
  this: { error: (msg: string) => never; warn: (msg: string) => void },
  code: string,
  id: string,
) => Promise<{ code: string } | null>

/** The page as the zero-content plugin compiles it for a collection. */
async function compilePage(body: string, path: string): Promise<string> {
  mkdirSync(EVAL_DIR, { recursive: true })
  const plugin = content({ highlight: false, mdxDir: join(EVAL_DIR, 'mdx') })
  const transform = plugin.transform as Transform
  const out = await transform.call(
    {
      error: (msg) => {
        throw new Error(msg)
      },
      warn: () => {},
    },
    body,
    `/proj/src/content/api/${path}`,
  )
  if (!out) throw new Error(`zero-content did not transform ${path}`)
  return out.code
}

/**
 * Every place the compiled module could RUN a payload: an identifier carrying
 * the sentinel, an element or event handler the payload spelled, a
 * `javascript:` URL. Text and string literals holding the payload are fine --
 * that is the page documenting it.
 */
function liveInCode(code: string): string[] {
  const { program, errors } = parseSync('page.js', code)
  expect(errors, 'compiled module parses').toEqual([])
  const hits: string[] = []
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const n of node) visit(n)
      return
    }
    if (!node || typeof node !== 'object') return
    const n = node as Record<string, unknown>
    if (n.type === 'Identifier' && typeof n.name === 'string') {
      if (n.name.startsWith(SENTINEL) || /^on(error|click)$/i.test(n.name)) hits.push(n.name)
    }
    if (n.type === 'Literal' && typeof n.value === 'string') {
      if (/^on(error|click)$/i.test(n.value)) hits.push(`attr:${n.value}`)
      if (/^\s*javascript:/i.test(n.value)) hits.push(`url:${n.value}`)
    }
    // `h('img', …)` / `h('b', …)`: an element the payload spelled.
    if (n.type === 'CallExpression') {
      const [tag] = n.arguments as { type: string; value?: unknown }[]
      if (tag?.type === 'Literal' && ['b', 'img', 'script'].includes(String(tag.value))) {
        hits.push(`element:${String(tag.value)}`)
      }
    }
    for (const key of Object.keys(n)) if (key !== 'parent') visit(n[key])
  }
  visit(program)
  return hits
}

/** Import the compiled page and render it: a live payload sets a sentinel. */
async function sentinelsAfterRender(code: string, name: string): Promise<string[]> {
  // The page's components come from the plugin's virtual modules; a stub that
  // renders nothing stands in -- what is under test is the page's own code.
  // The module lives inside the package so `@pyreon/core` resolves.
  const source = code.replace(
    /(["'])virtual:zero-content\/components\/(\w+)\1/g,
    (_m, _q: string, component: string) => {
      writeFileSync(
        join(EVAL_DIR, `${component}.mjs`),
        `const C = () => null\nexport default C\nexport { C as ${component} }\n`,
      )
      return JSON.stringify(`./${component}.mjs`)
    },
  )
  const file = join(EVAL_DIR, `${name}.mjs`)
  writeFileSync(file, source)
  const mod = (await import(/* @vite-ignore */ file)) as { default: () => unknown }
  mod.default()
  return Object.keys(globalThis).filter((k) => k.startsWith(SENTINEL))
}

describe('generated pages compiled by @pyreon/zero-content', () => {
  const pages = hostilePages()

  it('carries every hostile slot into the pages (the test reaches the sinks)', () => {
    const all = pages.map(([, body]) => body).join('\n')
    // (The PATH slot is not in this list: its braces are path-template syntax,
    // so it reaches the page normalized -- still compiled and executed below.)
    for (const slot of ['title', 'tag', 'summary', 'query', 'header', 'media', 'model']) {
      expect(all, slot).toContain(`${SENTINEL}${slot[0]?.toUpperCase()}${slot.slice(1)}Expr`)
    }
  })

  for (const [path, body] of hostilePages()) {
    it(`${path}: compiles, with no payload in code position`, async () => {
      expect(liveInCode(await compilePage(body, path))).toEqual([])
    })

    it(`${path}: renders without running a payload`, async () => {
      const code = await compilePage(body, path)
      const name = path.replace(/\W+/g, '-').slice(0, 60)
      expect(await sentinelsAfterRender(code, name)).toEqual([])
      // ...and the page still SHOWS the text it documents.
      expect(code).toContain(SENTINEL)
    })
  }

  it('keeps the generated marker without depending on a parse failure', async () => {
    for (const [path, body] of pages) {
      expect(body, path).toContain('@generated by @pyreon/lathe')
      // The marker sits in the frontmatter as a YAML comment, so it is not
      // part of the rendered page.
      expect(await compilePage(body, path), path).not.toContain('DO NOT EDIT')
    }
  })
})
