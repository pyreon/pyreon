import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import * as http from '@pyreon/http'
import * as core from '../core'
import * as components from '../components'
import * as form from '../form'
import * as query from '../query'
import * as chunked from '../transport-chunked'
import * as s3 from '../transport-s3'
import * as tus from '../transport-tus'
import * as xhr from '../transport-xhr'
import * as upload from '../index'

/**
 * Runs the code blocks of the docs page: every `// @check` block is executed with its own imports (nothing is in scope that the
 * block does not import), and every `// => value` line is compared with what the line evaluates to. So every output the page
 * shows is what the package prints, and every block imports what it uses.
 */
const PAGE = join(import.meta.dirname, '..', '..', '..', '..', '..', 'docs', 'src', 'content', 'docs', 'upload.md')

const MODULES: Record<string, unknown> = {
  '@pyreon/upload': upload,
  '@pyreon/upload/core': core,
  '@pyreon/upload/transport-xhr': xhr,
  '@pyreon/upload/components': components,
  '@pyreon/upload/form': form,
  '@pyreon/upload/query': query,
  '@pyreon/upload/transport-chunked': chunked,
  '@pyreon/upload/transport-s3': s3,
  '@pyreon/upload/transport-tus': tus,
  '@pyreon/http': http,
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
    expect(all.length).toBeGreaterThan(6)
    expect(all.map((b) => b.code).join('').length).toBeGreaterThan(1000)
    expect(all.map((b) => b.code).join('\n').match(/ \/\/ => /g)!.length).toBeGreaterThan(15)
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

  it('the reference Zero routes and presign routes on the page are the files the tests run', () => {
    const route = readFileSync(join(import.meta.dirname, 'reference-zero-routes.ts'), 'utf8').trimEnd().replace("'./reference-chunked'", "'~/server/chunked-handler'")
    const presign = readFileSync(join(import.meta.dirname, 'reference-presign.ts'), 'utf8').trimEnd()
    const blocks = [...readFileSync(PAGE, 'utf8').matchAll(/```ts\n([\s\S]*?)```/g)].map((m) => m[1]!.trimEnd())

    expect(blocks).toContain(route)
    expect(blocks).toContain(presign)
  })

  it('every checked block imports every upload name it uses', () => {
    const names = new Set([...Object.keys(upload), ...Object.keys(core), ...Object.keys(xhr), ...Object.keys(chunked), ...Object.keys(s3), ...Object.keys(tus), ...Object.keys(components), ...Object.keys(form), ...Object.keys(query)])
    const missing: string[] = []

    for (const b of blocks().filter((x) => /@pyreon\/upload/.test(x.code))) {
      const imported = new Set([...b.code.matchAll(/import (?:type )?\{([^}]*)\}/g)].flatMap((m) => m[1]!.split(',').map((x) => x.trim().split(' as ').pop()!)))

      for (const n of names) if (new RegExp(`(?<![\\w.])${n}\\(|<${n}[ >/]`).test(b.code) && !imported.has(n)) missing.push(`block ${b.index}: ${n}`)
    }
    expect(missing).toEqual([])
  })

  it('the reference handler on the page is the file the Chromium tests run as their server', () => {
    const file = readFileSync(join(import.meta.dirname, 'reference-chunked.ts'), 'utf8').trimEnd()
    const first = file.split('\n')[0]!
    const blocks = [...readFileSync(PAGE, 'utf8').matchAll(/```ts\n([\s\S]*?)```/g)].map((m) => m[1]!.trimEnd()).filter((b) => b.startsWith(first))

    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toBe(file)
  })

  it('every runnable block imports what it uses: a block with no imports of its own sees no names', () => {
    const lonely = all.filter((b) => !/^import /m.test(b.code))

    for (const b of lonely) expect(b.code, `block ${b.index}`).not.toMatch(/ \/\/ => /)
  })
})
