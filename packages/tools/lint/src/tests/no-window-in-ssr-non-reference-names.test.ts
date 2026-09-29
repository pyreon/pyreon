/**
 * `no-window-in-ssr` must flag only a REFERENCE to a browser global — never a
 * NAME that merely spells one. A class method called `document()` is a member
 * name, not the global `document`; the same holds for every other binding-free
 * name position (class fields, accessors, object methods, interface members,
 * enum members, labels, re-export aliases, JSX attribute names).
 *
 * Every "name" case is paired with a "reference" case in the SAME position
 * class (a method BODY reading the real global still fires), so the matrix
 * proves the rule discriminates by position rather than going quiet on
 * classes wholesale.
 */
import { describe, expect, it } from 'vitest'
import { lintFile } from '../runner'
import { noWindowInSsr } from '../rules/ssr/no-window-in-ssr'

const R = 'pyreon/no-window-in-ssr'
function count(code: string, filePath = 'src/doc.tsx'): number {
  return lintFile(filePath, code, [noWindowInSsr], { rules: { [R]: 'error' } }).diagnostics.filter(
    (d) => d.ruleId === R,
  ).length
}

describe('no-window-in-ssr — names that spell a browser global are not references', () => {
  const quiet: Array<[string, string]> = [
    ['class method name', `export class Builder { document() { return 1 } }`],
    ['static class method name', `export class Builder { static window() { return 1 } }`],
    ['class getter name', `export class Builder { get location() { return '/' } }`],
    ['class setter name', `export class Builder { set history(v: string) { void v } }`],
    ['class field name', `export class Builder { navigator = 'x' }`],
    ['static class field name', `export class Builder { static document = 1 }`],
    ['class method call through this', `export class B { document() { return 1 } run() { return this.document() } }`],
    ['object method shorthand', `export const api = { document() { return 1 } }`],
    ['object getter', `export const api = { get window() { return 1 } }`],
    ['interface method signature', `export interface Api { document(): string }`],
    ['interface property signature', `export interface Api { window: number }`],
    ['type-literal method signature', `export type Api = { location(): string }`],
    ['abstract class method', `export abstract class A { abstract document(): string }`],
    ['abstract class field', `export abstract class A { abstract window: number }`],
    ['auto-accessor', `export class A { accessor location = '/' }`],
    ['abstract auto-accessor', `export abstract class A { abstract accessor history: string }`],
    ['enum member', `export enum Target { document, window }`],
    ['labelled statement', `export function f() { document: for (;;) { break document } }`],
    ['export alias', `const doc = 1\nexport { doc as document }`],
    ['JSX attribute name', `export const C = () => <Frame document="x" />`],
  ]
  for (const [name, code] of quiet) {
    it(`does NOT fire on a ${name}`, () => {
      expect(count(code)).toBe(0)
    })
  }

  const fires: Array<[string, string]> = [
    ['global read inside a method body', `export class Builder { document() { return document.title } }`],
    ['global read in a class field initializer', `export class Builder { w = window.innerWidth }`],
    ['global read in an object method body', `export const api = { document() { return window.name } }`],
    ['computed class member key', `export class B { [document.title]() { return 1 } }`],
    ['computed object key', `export const o = { [window.name]: 1 }`],
    ['bare global passed as a JSX attribute value', `export const C = () => <Frame document={document} />`],
  ]
  for (const [name, code] of fires) {
    it(`still FIRES on a ${name}`, () => {
      expect(count(code)).toBeGreaterThan(0)
    })
  }
})
