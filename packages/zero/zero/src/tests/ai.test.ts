import { describe, expect, it } from 'vitest'
import {
  generateAiPluginManifest,
  generateLlmsFullTxt,
  generateLlmsTxt,
  generateOpenApiSpec,
  inferJsonLd,
} from '../ai'

const baseConfig = {
  name: 'Test App',
  description: 'A test application',
  origin: 'https://example.com',
}

describe('generateLlmsTxt', () => {
  it('generates header with name and description', () => {
    const txt = generateLlmsTxt([], [], baseConfig)
    expect(txt).toContain('# Test App')
    expect(txt).toContain('> A test application')
  })

  it('lists static pages', () => {
    const routes = ['index.tsx', 'about.tsx', 'contact.tsx']
    const txt = generateLlmsTxt(routes, [], baseConfig)
    expect(txt).toContain('## Pages')
    expect(txt).toContain('[/](https://example.com)')
    expect(txt).toContain('[/about](https://example.com/about)')
    expect(txt).toContain('[/contact](https://example.com/contact)')
  })

  it('lists dynamic pages separately', () => {
    const routes = ['index.tsx', 'users/[id].tsx']
    const txt = generateLlmsTxt(routes, [], baseConfig)
    expect(txt).toContain('## Dynamic Pages')
    expect(txt).toContain('/users/:id')
  })

  it('excludes layout, error, loading files', () => {
    const routes = ['index.tsx', '_layout.tsx', '_error.tsx', '_loading.tsx']
    const txt = generateLlmsTxt(routes, [], baseConfig)
    expect(txt).not.toContain('_layout')
    expect(txt).not.toContain('_error')
    expect(txt).not.toContain('_loading')
  })

  it('includes page descriptions', () => {
    const routes = ['about.tsx']
    const txt = generateLlmsTxt(routes, [], {
      ...baseConfig,
      pageDescriptions: { '/about': 'Learn more about us' },
    })
    expect(txt).toContain('Learn more about us')
  })

  it('includes API descriptions', () => {
    const txt = generateLlmsTxt([], [], {
      ...baseConfig,
      apiDescriptions: {
        'GET /api/posts': 'List all posts',
        'POST /api/posts': 'Create a new post',
      },
    })
    expect(txt).toContain('## API Endpoints')
    expect(txt).toContain('GET /api/posts: List all posts')
    expect(txt).toContain('POST /api/posts: Create a new post')
  })

  it('auto-discovers API files', () => {
    const txt = generateLlmsTxt([], ['posts.ts', 'posts/[id].ts'], baseConfig)
    expect(txt).toContain('/api/posts')
    expect(txt).toContain('/api/posts/:id')
  })

  it('includes extra content', () => {
    const txt = generateLlmsTxt([], [], {
      ...baseConfig,
      llmsExtra: '## Authentication\nUse Bearer token.',
    })
    expect(txt).toContain('## Authentication')
    expect(txt).toContain('Use Bearer token.')
  })
})

describe('generateLlmsFullTxt', () => {
  it('generates full reference header', () => {
    const txt = generateLlmsFullTxt([], [], baseConfig)
    expect(txt).toContain('# Test App — Full Reference')
    expect(txt).toContain('Base URL: https://example.com')
  })

  it('includes route details', () => {
    const routes = ['index.tsx', 'about.tsx']
    const txt = generateLlmsFullTxt(routes, [], baseConfig)
    expect(txt).toContain('## All Routes')
    expect(txt).toContain('### /')
    expect(txt).toContain('### /about')
    expect(txt).toContain('Render mode: ssr')
  })

  it('marks dynamic routes', () => {
    const routes = ['users/[id].tsx']
    const txt = generateLlmsFullTxt(routes, [], baseConfig)
    expect(txt).toContain('(dynamic)')
  })
})

describe('inferJsonLd', () => {
  it('infers WebPage for website type', () => {
    const schemas = inferJsonLd({
      url: 'https://example.com/about',
      title: 'About',
      description: 'About us',
    })
    const webpage = schemas.find((s) => s['@type'] === 'WebPage')
    expect(webpage).toBeDefined()
    expect(webpage?.name).toBe('About')
    expect(webpage?.url).toBe('https://example.com/about')
  })

  it('infers Article for article type', () => {
    const schemas = inferJsonLd({
      url: 'https://example.com/blog/post',
      title: 'My Post',
      type: 'article',
      author: 'Vit',
      publishedTime: '2026-03-31',
      tags: ['pyreon', 'framework'],
    })
    const article = schemas.find((s) => s['@type'] === 'Article')
    expect(article).toBeDefined()
    expect(article?.headline).toBe('My Post')
    expect(article?.datePublished).toBe('2026-03-31')
    expect((article?.author as any)?.name).toBe('Vit')
    expect(article?.keywords).toBe('pyreon, framework')
  })

  it('infers Product for product type', () => {
    const schemas = inferJsonLd({
      url: 'https://example.com/product/1',
      title: 'Widget',
      type: 'product',
      description: 'A great widget',
    })
    const product = schemas.find((s) => s['@type'] === 'Product')
    expect(product).toBeDefined()
    expect(product?.name).toBe('Widget')
  })

  it('auto-generates BreadcrumbList from URL', () => {
    const schemas = inferJsonLd({
      url: 'https://example.com/blog/my-post',
      title: 'My Post',
    })
    const breadcrumb = schemas.find((s) => s['@type'] === 'BreadcrumbList')
    expect(breadcrumb).toBeDefined()
    const items = breadcrumb?.itemListElement as any[]
    expect(items.length).toBe(3) // Home, Blog, My post
    expect(items[0]?.name).toBe('Home')
    expect(items[1]?.name).toBe('Blog')
    expect(items[2]?.name).toBe('My post')
  })

  it('uses explicit breadcrumbs when provided', () => {
    const schemas = inferJsonLd({
      url: 'https://example.com/page',
      title: 'Page',
      breadcrumbs: [
        { name: 'Home', url: 'https://example.com' },
        { name: 'Page', url: 'https://example.com/page' },
      ],
    })
    const breadcrumb = schemas.find((s) => s['@type'] === 'BreadcrumbList')
    const items = breadcrumb?.itemListElement as any[]
    expect(items.length).toBe(2)
    expect(items[0]?.name).toBe('Home')
  })

  it('includes publisher for articles with siteName', () => {
    const schemas = inferJsonLd({
      url: 'https://example.com/blog/post',
      title: 'Post',
      type: 'article',
      siteName: 'Pyreon Blog',
    })
    const article = schemas.find((s) => s['@type'] === 'Article')
    expect((article?.publisher as any)?.name).toBe('Pyreon Blog')
  })
})

describe('generateAiPluginManifest', () => {
  it('generates valid manifest structure', () => {
    const manifest = generateAiPluginManifest(baseConfig)
    expect(manifest.schema_version).toBe('v1')
    expect(manifest.name_for_human).toBe('Test App')
    expect(manifest.name_for_model).toBe('test_app')
    expect(manifest.description_for_human).toBe('A test application')
  })

  it('normalizes name_for_model', () => {
    const manifest = generateAiPluginManifest({
      ...baseConfig,
      name: 'My Cool App! 2.0',
    })
    expect(manifest.name_for_model).toBe('my_cool_app_20')
  })

  it('includes contact and legal URLs', () => {
    const manifest = generateAiPluginManifest({
      ...baseConfig,
      contactEmail: 'hi@example.com',
      legalUrl: 'https://example.com/terms',
    })
    expect(manifest.contact_email).toBe('hi@example.com')
    expect(manifest.legal_info_url).toBe('https://example.com/terms')
  })

  it('points api.url to openapi.yaml', () => {
    const manifest = generateAiPluginManifest(baseConfig)
    expect((manifest.api as any).url).toBe('https://example.com/.well-known/openapi.yaml')
  })
})

describe('generateOpenApiSpec', () => {
  it('generates valid OpenAPI 3.0 structure', () => {
    const spec = generateOpenApiSpec([], baseConfig)
    expect(spec.openapi).toBe('3.0.0')
    expect((spec.info as any).title).toBe('Test App')
  })

  it('includes user-described endpoints', () => {
    const spec = generateOpenApiSpec([], {
      ...baseConfig,
      apiDescriptions: {
        'GET /api/posts': 'List posts',
        'POST /api/posts': 'Create post',
      },
    })
    const paths = spec.paths as any
    expect(paths['/api/posts']?.get?.summary).toBe('List posts')
    expect(paths['/api/posts']?.post?.summary).toBe('Create post')
  })

  it('converts :param to {param} for OpenAPI', () => {
    const spec = generateOpenApiSpec([], {
      ...baseConfig,
      apiDescriptions: {
        'GET /api/posts/:id': 'Get post',
      },
    })
    const paths = spec.paths as any
    expect(paths['/api/posts/{id}']).toBeDefined()
  })

  it('auto-discovers API files', () => {
    const spec = generateOpenApiSpec(['users.ts', 'users/[id].ts'], baseConfig)
    const paths = spec.paths as any
    expect(paths['/api/users']).toBeDefined()
    expect(paths['/api/users/{id}']).toBeDefined()
  })
})
