/**
 * pyreon context — generates .pyreon/context.json for AI tool consumption
 *
 * Delegates scanning to @pyreon/compiler's unified project scanner,
 * then writes the result to disk and ensures .pyreon/ is gitignored.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { type ProjectContext, generateContext as scanProject } from '@pyreon/compiler'

export type { ComponentInfo, IslandInfo, ProjectContext, RouteInfo } from '@pyreon/compiler'

export interface ContextOptions {
  cwd: string
  outPath?: string | undefined
}

export async function generateContext(options: ContextOptions): Promise<ProjectContext> {
  const context = scanProject(options.cwd)

  // Write to .pyreon/context.json
  const outDir = options.outPath ? path.dirname(options.outPath) : path.join(options.cwd, '.pyreon')
  const outFile = options.outPath ?? path.join(outDir, 'context.json')

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true })
  }
  fs.writeFileSync(outFile, JSON.stringify(context, null, 2), 'utf-8')

  // Ensure .pyreon/ is in .gitignore
  ensureGitignore(options.cwd)

  const relOut = path.relative(options.cwd, outFile)
  console.log(
    `  ✓ Generated ${relOut} (${context.components.length} components, ${context.routes.length} routes, ${context.islands.length} islands)`,
  )

  return context
}

function ensureGitignore(cwd: string): void {
  const gitignorePath = path.join(cwd, '.gitignore')
  try {
    const content = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf-8') : ''

    if (!content.includes('.pyreon/') && !content.includes('.pyreon\n')) {
      const addition = content.endsWith('\n') ? '.pyreon/\n' : '\n.pyreon/\n'
      fs.appendFileSync(gitignorePath, addition)
    }
  } catch {
    // Ignore errors with .gitignore
  }
}
