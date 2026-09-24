/**
 * `detectRouteExports` fixture corpus.
 *
 * The detector used to be a hand-rolled character scanner that treated
 * every quote as a string opener. An apostrophe in JSX text or a quote in a
 * regex literal desynchronised it and hid every export after it, and its
 * `as`/`satisfies` stripper corrupted a `meta` string containing `(`, which
 * made the generated routes module a SyntaxError. Every fixture below is a
 * shape that either broke or was never covered. Each asserts the exports
 * AND, where a literal is captured, that the literal is valid JavaScript
 * that evaluates to the intended value.
 */
import { detectRouteExports, generateRouteModuleFromRoutes } from '../fs-router'
import { parseFileRoutes } from '../fs-router'

/** Evaluate a captured literal as plain JavaScript (what the generator inlines). */
function evalLiteral(text: string | undefined): unknown {
  expect(text).toBeDefined()
  return new Function(`return (${text})`)()
}

describe('detectRouteExports — fixture corpus', () => {
  it('an apostrophe in JSX text does not hide later exports', () => {
    const r = detectRouteExports(
      `export default function P() { return <p>Don't miss it</p> }
export const loader = async () => ({ ok: true })
export const renderMode = 'ssr'
export const middleware = () => {}`,
    )
    expect(r.hasLoader).toBe(true)
    expect(r.hasMiddleware).toBe(true)
    expect(r.hasRenderMode).toBe(true)
    expect(evalLiteral(r.renderModeLiteral)).toBe('ssr')
  })

  it('a quote inside a regex literal does not hide later exports', () => {
    const r = detectRouteExports(`const strip = (s: string) => s.replace(/'/g, '')
const dq = /"/
export const guard = () => true
export const meta = { title: 'Regex' }`)
    expect(r.hasGuard).toBe(true)
    expect(evalLiteral(r.metaLiteral)).toEqual({ title: 'Regex' })
  })

  it('template literals with ${} slots (incl. nested braces and quotes) are skipped', () => {
    const r = detectRouteExports(
      'const t = `a ${ { x: "}" }.x } b ${`inner \'${1}\'`} c`\nexport const loader = () => t\nexport const revalidate = 30',
    )
    expect(r.hasLoader).toBe(true)
    expect(r.revalidateLiteral).toBe('30')
  })

  it('export list, alias, and re-export forms', () => {
    const r = detectRouteExports(`function loader() {}
const g = () => true
export { loader, g as guard }
export { middleware } from './mw'
export * as error from './err'`)
    expect(r.hasLoader).toBe(true)
    expect(r.hasGuard).toBe(true)
    expect(r.hasMiddleware).toBe(true)
    expect(r.hasError).toBe(true)
  })

  it('export async function / export function', () => {
    const r = detectRouteExports(`export async function loader() { return 1 }
export function getStaticPaths() { return [] }`)
    expect(r.hasLoader).toBe(true)
    expect(r.hasGetStaticPaths).toBe(true)
  })

  it('satisfies / as const / nested as const are stripped to valid JS', () => {
    const r = detectRouteExports(`type M = { title: string; tags: readonly string[] }
export const loader = (async () => 1) satisfies () => Promise<number>
export const meta = { title: 'A', tags: ['x' as const, 'y'] } as const satisfies M
export const renderMode = ('isr' as const)
export const revalidate = 60 as const`)
    expect(r.hasLoader).toBe(true)
    expect(evalLiteral(r.metaLiteral)).toEqual({ title: 'A', tags: ['x', 'y'] })
    expect(evalLiteral(r.renderModeLiteral)).toBe('isr')
    expect(r.revalidateLiteral).toBe('60')
  })

  it('comments that contain `export const` do not register exports', () => {
    const r = detectRouteExports(`// export const loader = () => 1
/* export const guard = () => true */
/**
 * export const middleware = []
 */
export default function P() { return null }`)
    expect(r.hasLoader).toBe(false)
    expect(r.hasGuard).toBe(false)
    expect(r.hasMiddleware).toBe(false)
  })

  it('strings that contain `export const` do not register exports', () => {
    const r = detectRouteExports(`const s = "export const loader = 1"
const u = \`export const guard = 2\`
export default function P() { return s + u }`)
    expect(r.hasLoader).toBe(false)
    expect(r.hasGuard).toBe(false)
  })

  it('the sad-face meta survives as a valid, exact literal', () => {
    const r = detectRouteExports(
      `export const meta = { description: 'Known as the sad face :(', title: 'as satisfies (' }`,
    )
    expect(evalLiteral(r.metaLiteral)).toEqual({
      description: 'Known as the sad face :(',
      title: 'as satisfies (',
    })
  })

  it('a sad-face meta produces a generated routes module that parses', () => {
    const routes = parseFileRoutes(['index.tsx'])
    routes[0]!.exports = detectRouteExports(
      `export const meta = { description: 'Known as the sad face :(' }\nexport default function P() { return null }`,
    )
    const mod = generateRouteModuleFromRoutes(routes, '/r')
    // Syntax-check the generated module (imports stripped — they are not
    // resolvable here, and `new Function` rejects ESM syntax).
    const body = mod.replace(/^import .*$/gm, '').replace(/^export /gm, '')
    expect(() => new Function(body)).not.toThrow()
    expect(mod).toContain("'Known as the sad face :('")
  })

  it('type-only and ambient exports are ignored', () => {
    const r = detectRouteExports(
      `export type loader = () => void
export declare const guard: () => boolean
export type { middleware } from './mw'
export default function P() { return null }`,
      'page.ts',
    )
    expect(r.hasLoader).toBe(false)
    expect(r.hasGuard).toBe(false)
    expect(r.hasMiddleware).toBe(false)
  })

  it('non-literal and impure initializers are detected but not captured', () => {
    const r = detectRouteExports(`const T = 'x'
export const meta = { title: T }
export const renderMode = mode()
export const revalidate = \`\${60}\`
function mode() { return 'ssg' }`)
    expect(r.hasMeta && r.hasRenderMode && r.hasRevalidate).toBe(true)
    expect(r.metaLiteral).toBeUndefined()
    expect(r.renderModeLiteral).toBeUndefined()
    expect(r.revalidateLiteral).toBeUndefined()
  })

  it('`.ts` files parse `<T>value` assertions', () => {
    const r = detectRouteExports(`export const revalidate = <number>60\nexport const loader = () => 1`, 'x.ts')
    expect(r.hasLoader).toBe(true)
    expect(r.revalidateLiteral).toBe('60')
  })
})
