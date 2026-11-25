// ─── ai-manifests.ts ───────────────────────────────────────────────────────
//
// Internal: the `/.well-known/ai-plugin.json` manifest and the minimal
// OpenAPI spec `aiPlugin` emits, plus the API-file pattern parser they share
// with `ai.ts`. Split out of the public entry `ai.ts`, which imports from
// here, so these helpers are not public API; their unit tests reach them
// through `@pyreon/zero/internal-server`.

import type { AiPluginConfig } from './ai'

// ─── AI plugin manifest ─────────────────────────────────────────────────────

/**
 * Generate an OpenAI-compatible AI plugin manifest.
 *
 * Follows the /.well-known/ai-plugin.json spec.
 *
 * @internal Exported for testing.
 */
export function generateAiPluginManifest(config: AiPluginConfig): Record<string, unknown> {
  return {
    schema_version: 'v1',
    name_for_human: config.name,
    name_for_model: config.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''),
    description_for_human: config.description,
    description_for_model: config.description,
    auth: { type: 'none' },
    api: {
      type: 'openapi',
      url: `${config.origin}/.well-known/openapi.yaml`,
    },
    logo_url: config.logoUrl ?? `${config.origin}/favicon.svg`,
    contact_email: config.contactEmail ?? '',
    legal_info_url: config.legalUrl ?? `${config.origin}/legal`,
  }
}

/**
 * Generate a minimal OpenAPI 3.0 spec from API route descriptions.
 *
 * @internal Exported for testing.
 */
export function generateOpenApiSpec(
  apiFiles: string[],
  config: AiPluginConfig,
): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {}

  // From user-provided descriptions
  if (config.apiDescriptions) {
    for (const [endpoint, desc] of Object.entries(config.apiDescriptions)) {
      const match = endpoint.match(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(.+)$/)
      if (match) {
        const method = match[1]!.toLowerCase()
        const path = match[2]!
        // Convert :param to {param} for OpenAPI
        const openApiPath = path.replace(/:(\w[\w-]*)/g, '{$1}')
        if (!paths[openApiPath]) paths[openApiPath] = {}
        paths[openApiPath][method] = {
          summary: desc,
          responses: { '200': { description: 'Success' } },
        }
      }
    }
  }

  // Auto-discovered API files (fill in gaps)
  for (const pattern of parseApiFiles(apiFiles)) {
    const openApiPath = pattern.replace(/:(\w[\w-]*)/g, '{$1}')
    if (!paths[openApiPath]) {
      paths[openApiPath] = {
        get: {
          summary: `${openApiPath} endpoint`,
          responses: { '200': { description: 'Success' } },
        },
      }
    }
  }

  return {
    openapi: '3.0.0',
    info: {
      title: config.name,
      description: config.description,
      version: '1.0.0',
    },
    servers: [{ url: config.origin }],
    paths,
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

export function parseApiFiles(files: string[]): string[] {
  return files
    .filter((f) => f.endsWith('.ts') || f.endsWith('.js'))
    .map((f) => {
      let path = f.replace(/\.\w+$/, '').replace(/\/index$/, '')
      if (!path.startsWith('/')) path = `/${path}`
      // Convert [param] to :param
      path = path.replace(/\[\.\.\.(\w[\w-]*)\]/g, ':$1*').replace(/\[(\w[\w-]*)\]/g, ':$1')

      return `/api${path === '/' ? '' : path}`
    })
}
