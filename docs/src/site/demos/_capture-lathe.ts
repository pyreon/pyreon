/**
 * Real `lathe generate` data for the Lathe demo (DemoLathe.tsx).
 *
 * Captured 2026-11-11 by running @pyreon/lathe's own pipeline (`generate()`
 * from @pyreon/lathe/core, and the CLI's `renderReport`) on
 * examples/lathe-bookshelf/openapi.yaml with `--target web` for ALL 1023
 * non-empty plugin selections, and by running the CLI itself
 * (`lathe generate openapi.yaml --target web --plugins queries|atlas --out src/gen`).
 *
 * The bundle carries the compact form instead of the 1023 lists: `FILES` is
 * the file order of the all-plugins run, and `OWNERS[i]` the plugins whose
 * selection alone emits `FILES[i]`. "FILES filtered to those owned by a
 * selected plugin" reproduced every one of the 1023 runs exactly (verified,
 * 0 mismatches), and `expand()` below reproduced every run's expanded plugin
 * list. Bundling generate() itself would ship ~500 kB of pipeline to compute
 * a list it always computes the same way.
 */
export type Plugin = 'types' | 'schemas' | 'client' | 'queries' | 'mocks' | 'faker' | 'components' | 'atlas' | 'docs' | 'mcp'

export const PLUGINS: readonly Plugin[] = ["types","schemas","client","queries","mocks","faker","components","atlas","docs","mcp"]

/** packages/tools/lathe/src/core/config.ts → PLUGIN_REQUIRES (the import edges of the emitted code). */
export const REQUIRES: Readonly<Record<Plugin, readonly Plugin[]>> = {"types":[],"schemas":[],"client":["schemas"],"queries":["client"],"mocks":["client"],"faker":["schemas"],"components":["queries"],"atlas":["components","mocks"],"docs":[],"mcp":["client"]}

/** Same order-preserving depth-first walk as config.ts → expandPlugins(). */
export function expand(selected: readonly Plugin[]): Plugin[] {
  const out: Plugin[] = []
  const seen = new Set<Plugin>()
  const visit = (name: Plugin): void => {
    if (seen.has(name)) return
    seen.add(name)
    for (const dep of REQUIRES[name]) visit(dep)
    out.push(name)
  }
  for (const name of selected) visit(name)
  return out
}

export const FILES: readonly string[] = ["types.ts","schemas/Author.ts","schemas/Book.ts","schemas/Entity.ts","schemas/NewBook.ts","schemas.ts","client.ts","endpoints/authors.ts","endpoints/books.ts","queries/authors.ts","queries/books.ts","keys.ts","mocks.ts","mcp.ts","faker.ts","components.tsx","atlas.scenarios.ts","atlas.wrapper.tsx","docs/index.md","docs/authors.md","docs/books.md","docs/models.md","endpoints/index.ts","queries/index.ts","dev.ts","index.ts","package.json","lathe-manifest.json","api-surface.json"]

export const OWNERS: readonly (readonly Plugin[])[] = [["types"],["schemas","client","queries","mocks","faker","components","atlas","mcp"],["schemas","client","queries","mocks","faker","components","atlas","mcp"],["schemas","client","queries","mocks","faker","components","atlas","mcp"],["schemas","client","queries","mocks","faker","components","atlas","mcp"],["schemas","client","queries","mocks","faker","components","atlas","mcp"],["client","queries","mocks","components","atlas","mcp"],["client","queries","mocks","components","atlas","mcp"],["client","queries","mocks","components","atlas","mcp"],["queries","components","atlas"],["queries","components","atlas"],["queries","components","atlas"],["mocks","atlas"],["mcp"],["faker"],["components","atlas"],["atlas"],["atlas"],["docs"],["docs"],["docs"],["docs"],["client","queries","mocks","components","atlas","mcp"],["queries","components","atlas"],["mocks","faker","atlas"],["types","schemas","client","queries","mocks","faker","components","atlas","docs","mcp"],["types","schemas","client","queries","mocks","faker","components","atlas","docs","mcp"],["types","schemas","client","queries","mocks","faker","components","atlas","docs","mcp"],["types","schemas","client","queries","mocks","faker","components","atlas","docs","mcp"]]

/** The report's fixed lines, verbatim from the CLI run. */
export const REPORT_TITLE = "lathe / Bookshelf 1.2.0"
export const REPORT_COUNTS = "  4 models  4 operations  target=web"
export const REPORT_VERIFY = "  verify SKIPPED no native modules were generated (target is `web`)"
