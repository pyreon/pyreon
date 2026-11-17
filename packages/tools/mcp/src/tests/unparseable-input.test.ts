import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createServer } from '../index'
import { prepareSnippet } from '../snippet-input'

// Every MCP tool that takes source code used to give a verdict on input it
// could not parse: the detectors parse with an error-recovering parser, find
// nothing in a tree they cannot read, and "nothing" came back as
// "✓ No issues found". These run through the real handlers over JSON-RPC.

const F = '```'

const GOOD = `import { signal } from '@pyreon/reactivity'
export const Counter = () => {
  const count = signal(0)
  return <button onClick={() => count.set(count() + 1)}>{count()}</button>
}`

const DESTRUCTURED = `const Greeting = ({ name }) => <h1>{name}</h1>`
const CLEAN = '✓ No issues found. The code follows Pyreon patterns correctly.'

let client: Client
let server: ReturnType<typeof createServer>

beforeAll(async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  server = createServer()
  await server.connect(serverTransport)
  client = new Client({ name: 'test', version: '0.0.0' })
  await client.connect(clientTransport)
})

afterAll(async () => {
  await client.close()
  await server.close()
})

async function call(name: string, args: Record<string, unknown>): Promise<string> {
  const result = (await client.callTool({ name, arguments: args })) as {
    content: Array<{ type: string; text: string }>
  }
  expect(result.content).toHaveLength(1)
  return result.content[0]!.text
}

const validate = (code: string, filename?: string) =>
  call('validate', filename ? { code, filename } : { code })

describe('validate — input it cannot parse never gets a clean verdict', () => {
  it('valid code: output unchanged', async () => {
    expect(await validate(GOOD)).toBe(CLEAN)
    expect(await validate(DESTRUCTURED)).toMatch(/^Found 1 issue:\n\n1\. \*\*props-destructured\*\* \(line 1, column 19\)/)
  })

  it('a single fenced block is unwrapped, validated, and the result says so', async () => {
    const clean = await validate(`${F}tsx\n${GOOD}\n${F}`)
    expect(clean.startsWith(CLEAN)).toBe(true)
    expect(clean).toContain('wrapped in a markdown code fence (```tsx); the fence was stripped')

    // The code inside the fence is really checked: before the fix this
    // returned the clean line because the fence made it a template string.
    const bad = await validate(`${F}tsx\n${DESTRUCTURED}\n${F}`)
    expect(bad).toMatch(/^Found 1 issue:/)
    expect(bad).toContain('props-destructured** (line 1, column 19)')
    expect(bad).toContain('the fence was stripped')
  })

  it('a fence without a language tag, tildes, and surrounding blank lines are unwrapped too', async () => {
    expect((await validate(`${F}\n${GOOD}\n${F}`)).startsWith(CLEAN)).toBe(true)
    expect((await validate(`~~~ts\nexport const x = 1\n~~~`)).startsWith(CLEAN)).toBe(true)
    expect((await validate(`\n\n${F}tsx\n${GOOD}\n${F}\n\n`)).startsWith(CLEAN)).toBe(true)
  })

  it('prose around a fence, or several fences: reported as markdown, not guessed', async () => {
    const prose = await validate(`Here is the component:\n${F}tsx\n${GOOD}\n${F}\nHope it helps!`)
    expect(prose).toMatch(/^✗ The input is markdown, not source code: it has 2 code-fence lines/)
    expect(prose).toContain('line 1, column 1: Unexpected keyword or identifier.')
    expect(prose).not.toContain('No issues found')

    const two = await validate(`${F}tsx\n${GOOD}\n${F}\n\n${F}tsx\n${GOOD}\n${F}`)
    expect(two).toMatch(/^✗ The input is markdown, not source code: it has 4 code-fence lines/)
    expect(two).not.toContain('No issues found')
  })

  it('truncated JSX: the verdict is the syntax error with its position', async () => {
    const text = await validate('export const C = () => <div>')
    expect(text).toBe(
      "✗ Syntax error at line 1, column 25: JSX element 'div' has no corresponding closing tag.\n" +
        'The code does not parse as TSX (snippet.tsx), so it was not fully validated (1 more syntax error after this one). Fix the syntax and call the tool again.',
    )
  })

  it('stray tokens, prose and TypeScript-only syntax errors are syntax errors', async () => {
    expect(await validate('const x = 1 )) }')).toMatch(/^✗ Syntax error at line 1, column 13: ',' expected\./)
    expect(await validate('Please write me a counter component that increments when clicked.')).toMatch(
      /^✗ Syntax error at line 1, column 1: Unexpected keyword or identifier\./,
    )
    expect(await validate('function f(a: ): number { return 1 }')).toMatch(
      /^✗ Syntax error at line 1, column 15: Type expected\./,
    )
  })

  it('a syntax error stays the verdict when the detectors found something in the part that parsed', async () => {
    const text = await validate(`${DESTRUCTURED}\nconst broken = (`)
    expect(text).toMatch(/^✗ Syntax error at line 2/)
    expect(text).toContain('In the part that did parse, the detectors found 1 issue:')
    expect(text).toContain('props-destructured')
    expect(text).not.toMatch(/^Found/)
  })

  it('empty and whitespace-only input say so', async () => {
    expect(await validate('')).toBe('✗ Nothing to check: the input is empty. Nothing was validated.')
    expect(await validate('  \n\t\n')).toBe('✗ Nothing to check: the input is empty. Nothing was validated.')
    expect(await validate(`${F}tsx\n\n${F}`)).toBe(
      '✗ Nothing to check: the input is an empty markdown code fence. Nothing was validated.',
    )
  })

  it('Vue and Svelte files are unsupported; Vue-looking content in a .tsx is a syntax error', async () => {
    const vue = `<template><div>{{ count }}</div></template>\n<script setup lang="ts">\nconst count = ref(0)\n</script>`
    expect(await validate(vue, 'App.vue')).toMatch(/^✗ Unsupported file type: "App\.vue"/)
    expect(await validate('<script>let n = 0</script>\n<p>{n}</p>', 'App.svelte')).toMatch(
      /^✗ Unsupported file type: "App\.svelte"/,
    )
    expect(await validate(vue)).toMatch(/^✗ Syntax error at line 1, column 1: JSX expressions must have one parent element\./)
  })

  it('very large valid input still validates clean', async () => {
    const big = Array.from({ length: 3000 }, (_, i) => `export const C${i} = () => <div>{${i}}</div>`).join('\n')
    expect(await validate(big)).toBe(CLEAN)
  })
})

describe('the other source-taking tools refuse unparseable input too', () => {
  it('explain_reactivity', async () => {
    expect(await call('explain_reactivity', { code: 'export const C = () => <div>' })).toMatch(
      /^✗ Syntax error at line 1, column 25:[^\n]*\nThe code does not parse as TSX \(snippet\.tsx\), so it was not analysed/,
    )
    const fenced = await call('explain_reactivity', { code: `${F}tsx\n${GOOD}\n${F}` })
    expect(fenced).toMatch(/^Reactivity map for snippet\.tsx — 1 live/)
    expect(fenced).toContain('the fence was stripped')
  })

  it('migrate_react and migrate_pyreon do not rewrite a broken tree', async () => {
    for (const tool of ['migrate_react', 'migrate_pyreon']) {
      expect(await call(tool, { code: 'const x = 1 )) }' })).toMatch(
        /^✗ Syntax error at line 1, column 13: ',' expected\.\nThe code does not parse as TSX \(component\.tsx\), so it was not migrated/,
      )
      expect(await call(tool, { code: '' })).toBe('✗ Nothing to check: the input is empty. Nothing was migrated.')
      // A fenced block is unwrapped, not nested inside the output fence.
      const fenced = await call(tool, { code: `${F}tsx\n${GOOD}\n${F}` })
      expect(fenced).toMatch(/^## Migrated Code\n\n```tsx\nimport \{ signal \}/)
      expect(fenced).toContain('the fence was stripped')
    }
  })

  it('diagnose does not say the component "triggered no static detectors"', async () => {
    const text = await call('diagnose', {
      error: 'TypeError: count is not a function',
      componentSource: 'export const C = () => <div>',
    })
    expect(text).toContain('### Component source not checked')
    expect(text).toContain("✗ Syntax error at line 1, column 25: JSX element 'div' has no corresponding closing tag.")
    expect(text).not.toContain('triggered no static detectors')
  })

  it('explain_error does not say "No Pyreon/React anti-patterns detected"', async () => {
    const text = await call('explain_error', {
      report: JSON.stringify({ error: 'boom', component: 'Card' }),
      componentSource: 'Here is my component, it crashes when I click.',
    })
    expect(text).toContain('## Static analysis\n\n✗ Syntax error at line 1, column 1')
    expect(text).toContain('Card.tsx')
    expect(text).not.toContain('No Pyreon/React anti-patterns detected')
  })
})

describe('prepareSnippet', () => {
  it('classifies each input shape', () => {
    expect(prepareSnippet(GOOD, 'a.tsx')).toEqual({ kind: 'ok', code: GOOD, fence: null })
    expect(prepareSnippet(`${F}jsx\n${GOOD}\n${F}`, 'a.tsx')).toEqual({ kind: 'ok', code: GOOD, fence: { language: 'jsx' } })
    expect(prepareSnippet(' ', 'a.tsx')).toEqual({ kind: 'empty', fence: null })
    expect(prepareSnippet('x', 'a.vue')).toEqual({ kind: 'unsupported', filename: 'a.vue' })
    expect(prepareSnippet('x', 'snippet')).toMatchObject({ kind: 'ok' })
    expect(prepareSnippet(`${F}tsx\n${GOOD}`, 'a.tsx')).toMatchObject({ kind: 'markdown', fenceLines: 1 })
    // A closing fence with a different character does not close the block.
    expect(prepareSnippet(`${F}tsx\n${GOOD}\n~~~`, 'a.tsx')).toMatchObject({ kind: 'markdown' })
    expect(prepareSnippet('const x = (', 'a.tsx')).toMatchObject({ kind: 'syntax-error', code: 'const x = (' })
  })

  it('code that parses but holds fence-looking lines in a comment is code, not markdown', () => {
    const code = `/*\n${F}ts\nconst a = 1\n${F}\n*/\nexport const b = 2`
    expect(prepareSnippet(code, 'a.ts')).toEqual({ kind: 'ok', code, fence: null })
  })
})
