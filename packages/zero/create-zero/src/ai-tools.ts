/**
 * AI-tool rule-file application.
 *
 * Each tool's files live in `templates/_shared/_ai/<tool>/`. The Pyreon
 * principles body is `templates/_shared/_ai/principles.md` — a partial
 * with a `{{commandsSuffix}}` placeholder where the doctor-command line
 * goes (CLAUDE.md gets it; the others don't, to match the established
 * conventions for each tool's audience).
 *
 * Per-tool flow:
 *   1. Read principles.md, substitute {{commandsSuffix}} with the tool's
 *      doctor-line (or empty).
 *   2. Copy the tool's overlay dir with {{principles}} → step-1 body.
 *
 * MCP is special: `.mcp.json` is a static file (no placeholders). The
 * overlay copy handles it verbatim.
 */

import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { copyOverlay } from './template-engine'
import type { AiToolId, ProjectConfig } from './templates'

const SHARED_AI_ROOT = resolve(import.meta.dirname, '..', 'templates', '_shared', '_ai')

const DOCTOR_SUFFIX = '\n- `bun run doctor` — checks for React patterns and other anti-patterns'

const TOOLS_WITH_DOCTOR_LINE: ReadonlySet<AiToolId> = new Set<AiToolId>(['claude'])

function loadPrinciples(tool: AiToolId): string {
  const raw = readFileSync(join(SHARED_AI_ROOT, 'principles.md'), 'utf8')
  const suffix = TOOLS_WITH_DOCTOR_LINE.has(tool) ? DOCTOR_SUFFIX : ''
  return raw.replace(/\{\{commandsSuffix\}\}/g, suffix)
}

export async function applyAiTools(config: ProjectConfig): Promise<void> {
  for (const tool of config.aiTools) {
    const overlayDir = join(SHARED_AI_ROOT, tool)
    // MCP overlay has no placeholders; markdown overlays have {{principles}}.
    const vars: Record<string, string> = tool === 'mcp' ? {} : { principles: loadPrinciples(tool) }
    await copyOverlay(overlayDir, config.targetDir, vars)
  }
}
