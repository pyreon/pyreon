/**
 * AI integration utilities for Zero.
 *
 * - llms.txt auto-generation from routes and API routes
 * - JSON-LD auto-inference from route meta + Meta props
 * - AI plugin manifest (/.well-known/ai-plugin.json) from API routes
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { aiPlugin } from "@pyreon/zero/ai"
 *
 * export default {
 *   plugins: [
 *     aiPlugin({
 *       name: "My App",
 *       origin: "https://example.com",
 *       description: "A modern web application",
 *     }),
 *   ],
 * }
 * ```
 */
import type { Plugin } from 'vite'
import { parseFileRoutes, filePathToUrlPath } from './fs-router'
import type { FileRoute, RouteMeta } from './types'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AiPluginConfig {
  /** App/API name. */
  name: string
  /** App description for AI agents. */
  description: string
  /** Base URL. e.g. "https://example.com" */
  origin: string
  /** Contact email (required by OpenAI plugin spec). */
  contactEmail?: string
  /** Legal info URL. */
  legalUrl?: string
  /** Logo URL for the plugin. */
  logoUrl?: string
  /** Routes directory relative to project root. Default: "src/routes" */
  routesDir?: string
  /** API routes directory relative to project root. Default: "src/api" */
  apiDir?: string
  /**
   * API route descriptions — map of pattern to description.
   * Used for llms.txt and ai-plugin.json.
   *
   * @example
   * ```ts
   * apiDescriptions: {
   *   "GET /api/posts": "List all blog posts, supports ?page=N&limit=N",
   *   "GET /api/posts/:id": "Get a single post by ID",
   *   "POST /api/posts": "Create a new post (requires auth)",
   * }
   * ```
   */
  apiDescriptions?: Record<string, string>
  /**
   * Page descriptions — map of URL path to description.
   * Used for llms.txt. Falls back to route meta.title/description.
   */
  pageDescriptions?: Record<string, string>
  /**
   * Additional content to append to llms.txt.
   * Useful for authentication instructions, rate limits, etc.
   */
  llmsExtra?: string
}

// ─── llms.txt generation ────────────────────────────────────────────────────

/**
 * Generate llms.txt content from route files and config.
 *
 * Format follows the llms.txt proposal:
 * ```
 * # {name}
 * > {description}
 *
 * ## Pages
 * - [/about](/about): About page
 *
 * ## API
 * - GET /api/posts: List posts
 * ```
 *
 * @internal Exported for testing.
 */
export function generateLlmsTxt(
  routeFiles: string[],
  apiFiles: string[],
  config: AiPluginConfig,
): string {
  const lines: string[] = []

  // Header
  lines.push(`# ${config.name}`)
  lines.push(`> ${config.description}`)
  lines.push('')

  // Pages section
  const routes = parseFileRoutes(routeFiles)
  const pages = routes.filter(
    (r) => !r.isLayout && !r.isError && !r.isLoading && !r.isNotFound
      && !r.isCatchAll && !r.urlPath.includes(':'),
  )

  if (pages.length > 0) {
    lines.push('## Pages')
    lines.push('')
    for (const page of pages) {
      const desc = config.pageDescriptions?.[page.urlPath]
      const url = `${config.origin}${page.urlPath === '/' ? '' : page.urlPath}`
      if (desc) {
        lines.push(`- [${page.urlPath}](${url}): ${desc}`)
      } else {
        lines.push(`- [${page.urlPath}](${url})`)
      }
    }
    lines.push('')
  }

  // Dynamic routes (documented separately — AI needs to know about params)
  const dynamicRoutes = routes.filter(
    (r) => !r.isLayout && !r.isError && !r.isLoading && !r.isNotFound
      && (r.urlPath.includes(':') || r.isCatchAll),
  )
  if (dynamicRoutes.length > 0) {
    lines.push('## Dynamic Pages')
    lines.push('')
    for (const route of dynamicRoutes) {
      const desc = config.pageDescriptions?.[route.urlPath]
      if (desc) {
        lines.push(`- ${route.urlPath}: ${desc}`)
      } else {
        lines.push(`- ${route.urlPath}`)
      }
    }
    lines.push('')
  }

  // API section
  const apiPatterns = parseApiFiles(apiFiles)
  if (apiPatterns.length > 0 || config.apiDescriptions) {
    lines.push('## API Endpoints')
    lines.push('')

    // From apiDescriptions (most detailed — user-provided)
    if (config.apiDescriptions) {
      for (const [endpoint, desc] of Object.entries(config.apiDescriptions)) {
        lines.push(`- ${endpoint}: ${desc}`)
      }
    }

    // From auto-discovered API files (only those not already described)
    const describedPatterns = new Set(
      Object.keys(config.apiDescriptions ?? {}).map((k) => k.replace(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+/, '')),
    )
    for (const pattern of apiPatterns) {
      if (!describedPatterns.has(pattern)) {
        lines.push(`- ${pattern}`)
      }
    }
    lines.push('')
  }

  // Extra content
  if (config.llmsExtra) {
    lines.push(config.llmsExtra)
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * Generate llms-full.txt — expanded version with more detail.
 * Includes all route metadata and API descriptions.
 *
 * @internal Exported for testing.
 */
export function generateLlmsFullTxt(
  routeFiles: string[],
  apiFiles: string[],
  config: AiPluginConfig,
): string {
  const lines: string[] = []

  lines.push(`# ${config.name} — Full Reference`)
  lines.push(`> ${config.description}`)
  lines.push('')
  lines.push(`Base URL: ${config.origin}`)
  lines.push('')

  // All pages with details
  const routes = parseFileRoutes(routeFiles)
  const pages = routes.filter(
    (r) => !r.isLayout && !r.isError && !r.isLoading && !r.isNotFound,
  )

  if (pages.length > 0) {
    lines.push('## All Routes')
    lines.push('')
    for (const page of pages) {
      const desc = config.pageDescriptions?.[page.urlPath] ?? ''
      const dynamic = page.urlPath.includes(':') ? ' (dynamic)' : ''
      const catchAll = page.isCatchAll ? ' (catch-all)' : ''
      lines.push(`### ${page.urlPath}${dynamic}${catchAll}`)
      if (desc) lines.push(desc)
      lines.push(`- File: ${page.filePath}`)
      lines.push(`- Render mode: ${page.renderMode}`)
      lines.push('')
    }
  }

  // API endpoints with full detail
  if (config.apiDescriptions) {
    lines.push('## API Reference')
    lines.push('')
    for (const [endpoint, desc] of Object.entries(config.apiDescriptions)) {
      lines.push(`### ${endpoint}`)
      lines.push(desc)
      lines.push('')
    }
  }

  if (config.llmsExtra) {
    lines.push('## Additional Information')
    lines.push('')
    lines.push(config.llmsExtra)
    lines.push('')
  }

  return lines.join('\n')
}

// ─── JSON-LD auto-inference ─────────────────────────────────────────────────

export interface InferJsonLdOptions {
  /** Page URL. */
  url: string
  /** Page title. */
  title?: string
  /** Page description. */
  description?: string
  /** Page image. */
  image?: string
  /** Site name. */
  siteName?: string
  /** Page type hint. */
  type?: 'website' | 'article' | 'product' | 'profile'
  /** Article metadata. */
  publishedTime?: string
  /** Article author. */
  author?: string
  /** Article tags. */
  tags?: string[]
  /** Breadcrumb path segments. */
  breadcrumbs?: Array<{ name: string; url: string }>
}

/**
 * Auto-infer JSON-LD structured data from page metadata.
 *
 * Returns an array of JSON-LD objects (multiple schemas can apply to one page).
 * For example, an article page gets both `Article` and `BreadcrumbList`.
 *
 * @example
 * ```tsx
 * const schemas = inferJsonLd({
 *   url: "https://example.com/blog/my-post",
 *   title: "My Post",
 *   description: "A great article",
 *   type: "article",
 *   author: "Vit Bokisch",
 *   publishedTime: "2026-03-31",
 * })
 * // → [Article schema, BreadcrumbList schema]
 * ```
 */
export function inferJsonLd(options: InferJsonLdOptions): Record<string, unknown>[] {
  const schemas: Record<string, unknown>[] = []

  // Base: WebPage or Article
  if (options.type === 'article') {
    const article: Record<string, unknown> = {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: options.title,
      url: options.url,
    }
    if (options.description) article.description = options.description
    if (options.image) article.image = options.image
    if (options.publishedTime) article.datePublished = options.publishedTime
    if (options.author) {
      article.author = { '@type': 'Person', name: options.author }
    }
    if (options.tags && options.tags.length > 0) {
      article.keywords = options.tags.join(', ')
    }
    if (options.siteName) {
      article.publisher = { '@type': 'Organization', name: options.siteName }
    }
    schemas.push(article)
  } else if (options.type === 'product') {
    const product: Record<string, unknown> = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: options.title,
      url: options.url,
    }
    if (options.description) product.description = options.description
    if (options.image) product.image = options.image
    schemas.push(product)
  } else {
    const webpage: Record<string, unknown> = {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: options.title,
      url: options.url,
    }
    if (options.description) webpage.description = options.description
    if (options.image) webpage.thumbnailUrl = options.image
    schemas.push(webpage)
  }

  // BreadcrumbList from URL path or explicit breadcrumbs
  if (options.breadcrumbs && options.breadcrumbs.length > 0) {
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: options.breadcrumbs.map((bc, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: bc.name,
        item: bc.url,
      })),
    })
  } else {
    // Auto-generate breadcrumbs from URL path
    const urlObj = safeParseUrl(options.url)
    if (urlObj) {
      const segments = urlObj.pathname.split('/').filter(Boolean)
      if (segments.length > 0) {
        const items = [
          { '@type': 'ListItem', position: 1, name: 'Home', item: urlObj.origin },
        ]
        let path = ''
        for (let i = 0; i < segments.length; i++) {
          path += `/${segments[i]}`
          items.push({
            '@type': 'ListItem',
            position: i + 2,
            name: capitalize(segments[i]!.replace(/-/g, ' ')),
            item: `${urlObj.origin}${path}`,
          })
        }
        schemas.push({
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: items,
        })
      }
    }
  }

  return schemas
}

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
        const openApiPath = path.replace(/:(\w+)/g, '{$1}')
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
    const openApiPath = pattern.replace(/:(\w+)/g, '{$1}')
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

// ─── Vite plugin ────────────────────────────────────────────────────────────

/**
 * AI integration Vite plugin.
 *
 * Generates at build time:
 * - `/llms.txt` — concise site summary for AI agents
 * - `/llms-full.txt` — detailed reference for AI agents
 * - `/.well-known/ai-plugin.json` — OpenAI plugin manifest
 * - `/.well-known/openapi.yaml` — minimal OpenAPI spec from API routes
 *
 * In dev, serves these files via middleware.
 *
 * @example
 * ```ts
 * import { aiPlugin } from "@pyreon/zero/ai"
 *
 * export default {
 *   plugins: [
 *     aiPlugin({
 *       name: "My App",
 *       origin: "https://example.com",
 *       description: "A modern web application",
 *       apiDescriptions: {
 *         "GET /api/posts": "List blog posts",
 *         "GET /api/posts/:id": "Get post by ID",
 *       },
 *     }),
 *   ],
 * }
 * ```
 */
export function aiPlugin(config: AiPluginConfig): Plugin {
  let root = ''
  let isBuild = false
  let routeFiles: string[] = []
  let apiFiles: string[] = []

  return {
    name: 'pyreon-zero-ai',
    enforce: 'post',

    configResolved(resolvedConfig) {
      root = resolvedConfig.root
      isBuild = resolvedConfig.command === 'build'
    },

    async buildStart() {
      // Scan for route and API files
      try {
        const { readdir } = await import('node:fs/promises')
        const { join } = await import('node:path')

        const routesDir = join(root, config.routesDir ?? 'src/routes')
        const apiDir = join(root, config.apiDir ?? 'src/api')

        routeFiles = await scanDir(routesDir, routesDir)
        apiFiles = await scanDir(apiDir, apiDir)
      } catch {
        // Directories may not exist
      }
    },

    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? ''

        if (url === '/llms.txt') {
          res.setHeader('Content-Type', 'text/plain; charset=utf-8')
          res.end(generateLlmsTxt(routeFiles, apiFiles, config))
          return
        }

        if (url === '/llms-full.txt') {
          res.setHeader('Content-Type', 'text/plain; charset=utf-8')
          res.end(generateLlmsFullTxt(routeFiles, apiFiles, config))
          return
        }

        if (url === '/.well-known/ai-plugin.json') {
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(generateAiPluginManifest(config), null, 2))
          return
        }

        if (url === '/.well-known/openapi.yaml' || url === '/.well-known/openapi.json') {
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(generateOpenApiSpec(apiFiles, config), null, 2))
          return
        }

        next()
      })
    },

    async generateBundle() {
      if (!isBuild) return

      this.emitFile({
        type: 'asset',
        fileName: 'llms.txt',
        source: generateLlmsTxt(routeFiles, apiFiles, config),
      })

      this.emitFile({
        type: 'asset',
        fileName: 'llms-full.txt',
        source: generateLlmsFullTxt(routeFiles, apiFiles, config),
      })

      this.emitFile({
        type: 'asset',
        fileName: '.well-known/ai-plugin.json',
        source: JSON.stringify(generateAiPluginManifest(config), null, 2),
      })

      this.emitFile({
        type: 'asset',
        fileName: '.well-known/openapi.json',
        source: JSON.stringify(generateOpenApiSpec(apiFiles, config), null, 2),
      })
    },
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseApiFiles(files: string[]): string[] {
  return files
    .filter((f) => f.endsWith('.ts') || f.endsWith('.js'))
    .map((f) => {
      let path = f.replace(/\.\w+$/, '').replace(/\/index$/, '')
      if (!path.startsWith('/')) path = `/${path}`
      // Convert [param] to :param
      path = path.replace(/\[\.\.\.(\w+)\]/g, ':$1*').replace(/\[(\w+)\]/g, ':$1')
      return `/api${path === '/' ? '' : path}`
    })
}

async function scanDir(dir: string, base: string): Promise<string[]> {
  const { readdir, stat } = await import('node:fs/promises')
  const { join, relative } = await import('node:path')

  try {
    const entries = await readdir(dir)
    const files: string[] = []
    for (const entry of entries) {
      const full = join(dir, entry)
      const s = await stat(full)
      if (s.isDirectory()) {
        files.push(...(await scanDir(full, base)))
      } else {
        files.push(relative(base, full))
      }
    }
    return files
  } catch {
    return []
  }
}

function safeParseUrl(url: string): URL | null {
  try {
    return new URL(url)
  } catch {
    return null
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
