/**
 * Built-in (graph stage): the AI-assets plugin. It generates the assets an AI
 * agent needs to use the whole library correctly on the first try — and does so
 * token-efficiently, so agents are fast and cheap:
 *
 *   - `guide`   — a PRESCRIPTIVE, compact usage guide (exact allowed prop
 *                 values, a correct example, and what to avoid per component).
 *   - `llms`    — the browsable `llms.txt`-style catalog.
 *   - `catalog` — the full typed machine surface (for structured tools/MCP).
 *
 * The plugin GENERATES the assets and hands them to an `onAsset` sink;
 * persistence (writing files, feeding an MCP server) is the consumer's concern,
 * so the core stays pure + filesystem-free.
 */
import type { CatalogGraphData } from '../core'
import type { AtlasPlugin } from './types'
import { defineAtlasPlugin } from './define'

export interface AgentAsset {
  /** prescriptive, token-efficient usage guide for LLM context */
  guide: string
  /** the browsable llms.txt-style catalog */
  llms: string
  /** the full typed machine surface */
  catalog: CatalogGraphData
}

export interface AiAssetsOptions {
  /** receives the generated assets once the graph is assembled */
  onAsset?: (asset: AgentAsset) => void
}

export function aiAssetsPlugin(options: AiAssetsOptions = {}): AtlasPlugin {
  return defineAtlasPlugin({
    name: 'atlas:ai-assets',
    graph({ graph }) {
      options.onAsset?.({
        guide: graph.toAgentGuide(),
        llms: graph.toLlmsText(),
        catalog: graph.toJSON(),
      })
    },
  })
}
