import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import * as format from '@pyreon/format/core'
import * as i18n from '@pyreon/i18n/core'
import * as time from '@pyreon/time/core'
import * as fp from '../fp'
import * as schedule from '../index'

/**
 * Runs the code blocks of the docs page: every `// @check` block is executed with its own imports (nothing is in scope that the
 * block does not import), and every `// => value` line is compared with what the line evaluates to. So every output the page
 * shows is what the package prints, and every block imports what it uses.
 */
const PAGE = join(import.meta.dirname, '..', '..', '..', '..', '..', 'docs', 'src', 'content', 'docs', 'schedule.md')
const MODULES: Record<string, unknown> = {
  '@pyreon/schedule': schedule,
  '@pyreon/schedule/core': schedule,
  '@pyreon/schedule/fp': fp,
  '@pyreon/time': time,
  '@pyreon/format/core': format,
  '@pyreon/i18n/core': i18n,
}

interface Block {
  index: number
  lang: string
  code: string
}

function blocks(): Block[] {
  const out: Block[] = []

  for (const m of readFileSync(PAGE, 'utf8').matchAll(/```(tsx?)\n([\s\S]*?)```/g)) {
    if (m[2]!.startsWith('// @check')) out.push({ index: out.length + 1, lang: m[1]!, code: m[2]!.replace(/^\/\/ @check\n/, '') })
  }

  return out
}

/** `import { a, b } from 'x'` becomes `const { a, b } = __mods['x']`; type imports vanish; `EXPR // => V` becomes `__check(EXPR, V)`. */
function program(code: string): string {
  const lines: string[] = []
  const names = new Set<string>()

  for (const raw of code.split('\n')) {
    const imp = /^import (type )?\{([^}]*)\} from '([^']+)'$/.exec(raw)

    if (imp !== null) {
      if (imp[1] === undefined) lines.push(`const {${imp[2]}} = __mods[${JSON.stringify(imp[3])}]`)
      continue
    }
    const check = /^(?:(const|let) (\w+) = )?(.*?) \/\/ => (.*)$/.exec(raw)

    if (check === null) lines.push(raw)
    else {
      names.add('check')
      lines.push(`${check[1] === undefined ? '' : `${check[1]} ${check[2]} = `}__check(${check[3]}, ${check[4]})`)
    }
  }

  return lines.join('\n')
}

describe('the docs page runs', () => {
  const all = blocks().filter((b) => b.lang === 'ts')

  it('has a worthwhile number of runnable blocks and verified lines', () => {
    expect(all.length).toBeGreaterThan(18)
    expect(all.map((b) => b.code).join('').length).toBeGreaterThan(1000)
    expect(all.map((b) => b.code).join('\n').match(/ \/\/ => /g)!.length).toBeGreaterThan(40)
  })

  it.each(all.map((b) => [`block ${b.index}: ${b.code.split('\n').find((l) => l.startsWith('import'))?.slice(0, 70)}`, b] as const))('%s', (_label, b) => {
    const js = ts.transpileModule(program(b.code), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText.replace(/^"use strict";\n?/, '')
    let checked = 0
    const check = (actual: unknown, expected: unknown): unknown => {
      expect(actual).toEqual(expected)
      checked++

      return actual
    }

    new Function('__mods', '__check', js)(MODULES, check)
    if (/ \/\/ => /.test(b.code)) expect(checked).toBeGreaterThan(0)
  })

  it('every runnable block imports what it uses: a block with no imports of its own sees no names', () => {
    const lonely = all.filter((b) => !/^import /m.test(b.code))

    for (const b of lonely) expect(b.code, `block ${b.index}`).not.toMatch(/ \/\/ => /)
  })
})
