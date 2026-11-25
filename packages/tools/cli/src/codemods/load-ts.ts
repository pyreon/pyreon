import { createRequire } from 'node:module'

/**
 * TypeScript, loaded only when a codemod actually has a candidate file, so
 * `pyreon upgrade` runs on a project without it until a rewrite needs a parser.
 */
export function loadTs(codemodId: string): typeof import('typescript') {
  try {
    return createRequire(import.meta.url)('typescript') as typeof import('typescript')
  } catch {
    throw new Error(
      `[Pyreon] codemod ${codemodId} needs the \`typescript\` package. Install it (it is a peer dependency of @pyreon/cli) and re-run \`pyreon upgrade\`.`,
    )
  }
}
