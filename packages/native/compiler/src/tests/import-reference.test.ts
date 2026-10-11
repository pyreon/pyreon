import { parseSync } from 'oxc-parser'
import { describe, expect, it } from 'vitest'
import { createImportReferenceQuery } from '../import-reference'
import type { AstNode } from '../call-lowering'

const imported = `import { SizedMap as Cache } from '@pyreon/sized-map';`
const fixtures = {
  sibling: `function shadow(Cache) { new Cache('local') } function real() { new Cache('import') }`,
  destructuring: `function f({ factory: Cache }) { new Cache('local') } new Cache('import')`,
  arrayPattern: `function f([Cache]) { new Cache('local') } new Cache('import')`,
  rest: `function f(...Cache) { new Cache('local') } new Cache('import')`,
  objectRest: `function f({ ...Cache }) { new Cache('local') } new Cache('import')`,
  arrow: `const f = ({ Cache }) => new Cache('local'); new Cache('import')`,
  enum: `function f() { enum Cache { A }; new Cache('local') } new Cache('import')`,
  defaults: `function f(value = new Cache('import')) { new Cache('local'); var Cache }`,
  defaultShadow: `function f(Cache, value = new Cache('local')) { new Cache('local') }`,
  block: `{ new Cache('local'); const Cache = other } new Cache('import')`,
  nestedVar: `function f() { new Cache('local'); if (ready) { var Cache } } new Cache('import')`,
  catch: `try {} catch ({ value: Cache }) { new Cache('local') } new Cache('import')`,
  loopLet: `for (let Cache of items) { new Cache('local') } new Cache('import')`,
  loopVar: `function f() { for (var Cache of items) {} new Cache('local') } new Cache('import')`,
  forInit: `for (let Cache = new Cache('local'); ready; new Cache('local')) {} new Cache('import')`,
  switchScope: `switch (new Cache('import')) { case 0: let Cache; new Cache('local') } new Cache('import')`,
  namedFunction: `const f = function Cache() { new Cache('local') }; new Cache('import')`,
  namedClass: `const C = class Cache { method() { new Cache('local') } }; new Cache('import')`,
  classDeclaration: `function f() { new Cache('local'); class Cache {} } new Cache('import')`,
  blockFunction: `{ new Cache('local'); function Cache() {} } new Cache('import')`,
  classStaticVar: `class Other { static { var Cache; new Cache('local') } method() { new Cache('import') } }`,
  computedDefault: `function f({ [new Cache('local')]: Cache }) {} new Cache('import')`,
  destructuredDefault: `function f() { const { missing: Cache = new Cache('local') } = other }`,
  typeAlias: `function f() { type Cache = string; new Cache('import') }`,
  typeCast: `new (Cache as any)('import')`,
}

function verify(source: string) {
  const parsed = parseSync('reference.tsx', source, { lang: 'tsx' })
  expect(parsed.errors).toEqual([])
  const query = createImportReferenceQuery(parsed.program as unknown as AstNode)
  let checked = 0
  const walk = (node: any) => {
    if (!node || typeof node !== 'object') return
    if (node.type === 'NewExpression') {
      let callee = node.callee
      while (callee.expression) callee = callee.expression
      expect(query(callee, '@pyreon/sized-map', 'SizedMap'), source).toBe(
        node.arguments[0].value === 'import',
      )
      expect(query(callee, '@foreign/library', 'SizedMap')).toBe(false)
      expect(query(callee, '@pyreon/sized-map', 'OtherExport')).toBe(false)
      checked++
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) for (const child of value) walk(child)
      else if (value && typeof value === 'object') walk(value)
    }
  }
  walk(parsed.program)
  expect(checked).toBeGreaterThan(0)
}

describe('lexical import-reference identity', () => {
  it.each(Object.entries(fixtures))('%s', (_name, body) => verify(imported + body))
  it('type-only imports cannot supply a runtime constructor', () =>
    verify(`import type { SizedMap as Cache } from '@pyreon/sized-map'; new Cache('local')`))
  it('type-only specifiers cannot supply a runtime constructor', () =>
    verify(`import { type SizedMap as Cache } from '@pyreon/sized-map'; new Cache('local')`))
})
