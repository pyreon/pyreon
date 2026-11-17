import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { transformJSX } from '@pyreon/compiler'
import { describe, expect, it } from 'vitest'
import { allRules } from '../rules/index'
import { applyFixes, lintFile } from '../runner'
import type { Diagnostic, RuleEntry } from '../types'

/**
 * `pyreon/consistent-signal-read`. The contract that matters most is the fix:
 * it may only rewrite a read where the compiler emits the SAME code for both
 * forms, so every fixed case is compiled before and after and compared.
 */

const ID = 'pyreon/consistent-signal-read'
const HEAD = `import { signal, computed } from '@pyreon/reactivity'\n`

function lint(source: string, form?: 'called' | 'bare', file = '/p/src/a.tsx'): Diagnostic[] {
  const rules: Record<string, RuleEntry> = { [ID]: form ? ['warn', { form }] : 'warn' }
  return lintFile(file, source, allRules, { rules }).diagnostics.filter((d) => d.ruleId === ID)
}

/**
 * The compiled output, with the one known difference folded: a component prop
 * written `value={sig()}` takes the direct tier `_rpd(sig)`, while the bare
 * `value={sig}` gets the generic `_rp(() => sig())`. Both are reactive props
 * reading the same signal; `_rpd` additionally lets the child skip an effect.
 */
function compiled(source: string): string {
  return transformJSX(source, 'a.tsx')
    .code.replace(/_rpd\(([\w$]+)\)/g, '_rp(() => $1())')
    .replace(/\b_rpd\b/g, '_rp')
}

/** Fix, check the rule is satisfied in one pass, and that the compiled output did not change. */
function fixSame(body: string, form?: 'called' | 'bare'): string {
  const src = HEAD + body
  const diags = lint(src, form)
  expect(diags.length, 'expected a finding').toBeGreaterThan(0)
  const out = applyFixes(src, diags)
  expect(lint(out, form), 'one --fix pass must satisfy the rule').toEqual([])
  expect(compiled(out), 'the fix must not change the compiled output').toBe(compiled(src))

  return out.slice(HEAD.length)
}

const flagged = (body: string, form?: 'called' | 'bare', file?: string) =>
  lint(HEAD + body, form, file).map((d) => ({
    fixable: d.fix !== undefined,
    text: (HEAD + body).slice(d.span.start, d.span.end),
  }))

describe('pyreon/consistent-signal-read — form: called (default)', () => {
  it.each([
    [
      'JSX child',
      `const count = signal(0)\nexport const A = () => <div>{count}</div>`,
      `<div>{count()}</div>`,
    ],
    [
      'component child',
      `const count = signal(0)\nexport const A = () => <Text>{count}</Text>`,
      `<Text>{count()}</Text>`,
    ],
    [
      'DOM attribute',
      `const busy = signal(false)\nexport const A = () => <button disabled={busy}>x</button>`,
      `disabled={busy()}`,
    ],
    [
      '<Show when>',
      `const open = signal(false)\nexport const A = () => <Show when={open}><i /></Show>`,
      `when={open()}`,
    ],
    [
      '<For each>',
      `const items = signal([1])\nexport const A = () => <For each={items} by={(x) => x}>{(x) => <i>{x}</i>}</For>`,
      `each={items()}`,
    ],
    [
      'class object',
      `const on = signal(false)\nexport const A = () => <div class={{ active: on }} />`,
      `{ active: on() }`,
    ],
    [
      'style object',
      `const color = signal('red')\nexport const A = () => <div style={{ color: color }} />`,
      `{ color: color() }`,
    ],
    [
      'template literal',
      `const n = signal(0)\nexport const A = () => <div title={\`n=\${n}\`} />`,
      '`n=${n()}`',
    ],
    [
      'ternary',
      `const n = signal(0)\nexport const A = () => <div>{n > 0 ? 'pos' : 'zero'}</div>`,
      `n() > 0`,
    ],
    [
      'logical',
      `const open = signal(false)\nexport const A = () => <div>{open && <span />}</div>`,
      `open() && <span />`,
    ],
    [
      'argument of a call in JSX',
      `const n = signal(0)\nexport const A = () => <div>{String(n)}</div>`,
      `String(n())`,
    ],
    [
      'computed',
      `const n = signal(1)\nconst d = computed(() => n() * 2)\nexport const A = () => <div>{d}</div>`,
      `{d()}`,
    ],
    [
      'signal declared in a component',
      `export function A() {\n  const c = signal(0)\n  return <i>{c}</i>\n}`,
      `<i>{c()}</i>`,
    ],
    [
      'type layer',
      `const n = signal(0)\nexport const A = () => <div>{n as unknown as number}</div>`,
      `n() as unknown`,
    ],
    [
      'component prop inside an expression',
      `const name = signal('a')\nexport const A = () => <Comp value={name + '!'} />`,
      `value={name() + '!'}`,
    ],
  ])('%s: fixed to the called form, same compiled output', (_, body, expected) => {
    expect(fixSame(body)).toContain(expected)
  })

  it('reports the whole value of a component prop without a fix (a two-way binding on native)', () => {
    expect(
      flagged(`const draft = signal('')\nexport const A = () => <Field value={draft} />`),
    ).toEqual([{ fixable: false, text: 'draft' }])
    expect(
      flagged(`const pick = signal(0)\nexport const A = () => <Picker getValue={pick} />`),
    ).toEqual([{ fixable: false, text: 'pick' }])
  })

  it('reports a bare signal inside a function in JSX without a fix', () => {
    expect(
      flagged(
        `const n = signal(0)\nexport const A = () => <Button onClick={() => n.set(n + 1)}>+</Button>`,
      ),
    ).toEqual([{ fixable: false, text: 'n' }])
    expect(
      flagged(
        `const n = signal(0)\nexport const A = () => <button onClick={() => console.log(n)}>x</button>`,
      ),
    ).toEqual([{ fixable: false, text: 'n' }])
  })

  it.each([
    ['called read', `const n = signal(0)\nexport const A = () => <div>{n()}</div>`],
    ['accessor', `const n = signal(0)\nexport const A = () => <div>{() => n()}</div>`],
    [
      'signal API',
      `const n = signal(0)\nexport const A = () => <button onClick={() => n.set(n() + 1)}>{n.peek()}</button>`,
    ],
    [
      'object shorthand (identity)',
      `const n = signal(0)\nexport const A = () => <Comp data={{ n }} />`,
    ],
    ['spread', `const bag = signal({})\nexport const A = () => <Comp {...bag} />`],
    ['handler value', `const h = signal(0)\nexport const A = () => <Comp onPick={h} />`],
    ['ref value', `const el = signal(null)\nexport const A = () => <div ref={el} />`],
    ['outside JSX', `const n = signal(0)\nexport const f = () => console.log(n)`],
    [
      'let binding (not tracked by the compiler)',
      `let n = signal(0)\nexport const A = () => <div>{n}</div>`,
    ],
    ['object field', `const s = { n: signal(0) }\nexport const A = () => <div>{s.n}</div>`],
    [
      'hook result',
      `const { data } = useQuery(() => ({}))\nexport const A = () => <div>{data}</div>`,
    ],
    ['parameter', `export function Row(n: () => number) {\n  return <div>{n}</div>\n}`],
    ['imported name', `import { n } from './store'\nexport const A = () => <div>{n}</div>`],
    [
      'name bound twice (scope-blind collection)',
      `const n = signal(0)\nexport function A() {\n  const n = 5\n  return <div>{n}</div>\n}`,
    ],
    [
      'createSelector result',
      `import { createSelector } from '@pyreon/reactivity'\nconst s = signal(1)\nconst isSel = createSelector(s)\nexport const A = () => <div>{isSel}</div>`,
    ],
  ])('leaves %s alone', (_, body) => {
    expect(flagged(body)).toEqual([])
  })

  it('skips test files and Plain Mode files', () => {
    const body = `const n = signal(0)\nexport const A = () => <div>{n}</div>`
    expect(flagged(body, undefined, '/p/src/a.test.tsx')).toEqual([])
    expect(flagged(body, undefined, '/p/src/__tests__/a.tsx')).toEqual([])
    expect(flagged(`'use plain'\n${body}`)).toEqual([])
  })

  it('skips files the Pyreon compiler does not lower (a foreign JSX source, a compat project)', () => {
    const body = `const n = signal(0)\nexport const A = () => <div>{n}</div>`
    expect(flagged(`/** @jsxImportSource react */\n${body}`)).toEqual([])
    expect(flagged(`/** @jsxImportSource @pyreon/core */\n${body}`)).toHaveLength(1)

    const dir = mkdtempSync(join(tmpdir(), 'csr-compat-'))
    try {
      writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify({ dependencies: { '@pyreon/react-compat': '*' } }),
      )
      expect(flagged(body, undefined, join(dir, 'src', 'a.tsx'))).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('pyreon/consistent-signal-read — form: bare', () => {
  it.each([
    ['JSX child', `const n = signal(0)\nexport const A = () => <div>{n()}</div>`, `<div>{n}</div>`],
    [
      'DOM attribute',
      `const busy = signal(false)\nexport const A = () => <button disabled={busy()}>x</button>`,
      `disabled={busy}`,
    ],
    ['fragment child', `const n = signal(0)\nexport const A = () => <>{n()}</>`, `<>{n}</>`],
    [
      'component child',
      `const n = signal(0)\nexport const A = () => <Text>{n()}</Text>`,
      `<Text>{n}</Text>`,
    ],
  ])('%s: fixed to the bare form, same compiled output', (_, body, expected) => {
    expect(fixSame(body, 'bare')).toContain(expected)
  })

  it.each([
    [
      'component prop (bare would not type-check)',
      `const n = signal('a')\nexport const A = () => <Comp value={n()} />`,
    ],
    [
      'expression (bare would not type-check)',
      `const n = signal(0)\nexport const A = () => <div>{n() + 1}</div>`,
    ],
    [
      'style value',
      `const c = signal('red')\nexport const A = () => <div style={{ color: c() }} />`,
    ],
    [
      'handler body',
      `const n = signal(0)\nexport const A = () => <button onClick={() => n.set(n() + 1)}>x</button>`,
    ],
    ['accessor', `const n = signal(0)\nexport const A = () => <div>{() => n()}</div>`],
    ['bare already', `const n = signal(0)\nexport const A = () => <div>{n}</div>`],
    ['ambiguous name', `import { n } from './x'\nexport const A = () => <div>{n()}</div>`],
  ])('leaves %s alone', (_, body) => {
    expect(flagged(body, 'bare')).toEqual([])
  })
})
