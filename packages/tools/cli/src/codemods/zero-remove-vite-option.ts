import { createRequire } from 'node:module'
import type { Codemod } from './types'

type TS = typeof import('typescript')

/** TypeScript, loaded only when the codemod actually has a candidate file. */
function loadTs(): TS {
  try {
    return createRequire(import.meta.url)('typescript') as TS
  } catch {
    throw new Error(
      '[Pyreon] codemod zero-remove-vite-option needs the `typescript` package. Install it (it is a peer dependency of @pyreon/cli) and re-run `pyreon upgrade`.',
    )
  }
}

/**
 * `@pyreon/zero` 0.52 removed the `vite` option from `ZeroConfig`. It was
 * typed but NEVER READ, so an app that set it now fails to typecheck while
 * behaving identically without it. Removing the property is therefore
 * semantics-preserving; its contents are kept in a comment so a user who
 * believed it did something can move it into `defineConfig` deliberately.
 *
 * Only a `vite` property of an object literal passed DIRECTLY to a call of
 * `zero(...)` is touched.
 */
export const zeroRemoveViteOption: Codemod = {
  id: 'zero-remove-vite-option',
  package: '@pyreon/zero',
  introducedIn: '0.52.0',
  description:
    'Remove the never-read `vite` option from `zero({...})` (kept as a comment to move into defineConfig).',
  matches: (p) => /(^|\/)vite\.config\.[mc]?[jt]s$/.test(p),
  transform(source) {
    if (!/\bzero\s*\(/.test(source) || !/\bvite\s*:/.test(source)) return null
    const ts = loadTs()
    const sf = ts.createSourceFile('vite.config.ts', source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS)
    const edits: { start: number; end: number; text: string }[] = []
    const visit = (node: import('typescript').Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'zero' &&
        node.arguments[0] &&
        ts.isObjectLiteralExpression(node.arguments[0])
      ) {
        const obj = node.arguments[0]
        for (const prop of obj.properties) {
          const name = prop.name
          const isVite =
            (ts.isPropertyAssignment(prop) || ts.isShorthandPropertyAssignment(prop)) &&
            name !== undefined &&
            (ts.isIdentifier(name) || ts.isStringLiteral(name)) &&
            name.text === 'vite'
          if (!isVite) continue
          // Remove the property, its trailing comma, and the rest of its line.
          let end = prop.getEnd()
          while (end < source.length && /[ \t]/.test(source[end] as string)) end++
          if (source[end] === ',') end++
          const start = prop.getStart(sf)
          const kept = source
            .slice(start, prop.getEnd())
            .split('\n')
            .map((l) => `// ${l}`)
            .join('\n')
          edits.push({
            start,
            end,
            text: `// Removed by \`pyreon upgrade\` (zero-remove-vite-option): zero() never read this.\n${kept}`,
          })
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
    if (edits.length === 0) return null
    let out = source
    for (const e of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end)
    return out
  },
}
