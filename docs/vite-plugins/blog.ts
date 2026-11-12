/**
 * Two build-time pieces of pyreon.dev/blog (the module itself is
 * `@pyreon/zero-content/blog`, wired in content.config.ts and src/blog/):
 *
 *   - `blogBench()` rewrites the `::: bench` blocks of a post before
 *     `content()` compiles it (src/blog/bench.ts). It runs first: list it
 *     before `content()`.
 *   - `blogPlanned()` serves `virtual:pyreon-blog-planned`, the scheduled
 *     posts the index lists under "Up next" (src/blog/planned.ts): title,
 *     description, tags, day and reading time, never the slug or the body.
 *     The publish instant is read the way the content plugin reads its own
 *     (`resolvePublishNow` at the start of the build: the clock, or
 *     PYREON_CONTENT_NOW), so a post is published or planned in a build. The
 *     two reads are a moment apart; `upNext()` drops a planned post that is
 *     also published.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { parseFrontmatter, resolvePublishNow } from '@pyreon/zero-content/plugin'
import type { Plugin } from 'vite'
import { rewriteBenchBlocks } from '../src/blog/bench'
import { plannedPosts, type PostSource } from '../src/blog/planned'

/** The blog collection's folder (`blogCollection()`'s default path). */
const POSTS_DIR = 'src/content/blog'

const VIRTUAL_ID = 'virtual:pyreon-blog-planned'
const RESOLVED_ID = `\0${VIRTUAL_ID}`

export function blogBench(options: { moreLabel: string }): Plugin {
  let dir = ''
  return {
    name: 'pyreon-docs-blog-bench',
    enforce: 'pre',
    configResolved(config) {
      dir = resolve(config.root, POSTS_DIR) + sep
    },
    transform(code, id) {
      const file = id.split('?')[0] as string
      if (!file.startsWith(dir) || !file.endsWith('.md')) return null
      const out = rewriteBenchBlocks(code, options.moreLabel, file.slice(dir.length))
      return out === code ? null : { code: out, map: null }
    },
  }
}

/** Every post file in `dir`, split into frontmatter and body. */
export function readPosts(dir: string): PostSource[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => {
      const { data, content } = parseFrontmatter(readFileSync(join(dir, f), 'utf8'))
      return { data, body: content }
    })
}

export function blogPlanned(): Plugin {
  let dir = ''
  let now = Date.now()
  return {
    name: 'pyreon-docs-blog-planned',
    configResolved(config) {
      dir = resolve(config.root, POSTS_DIR)
    },
    buildStart() {
      now = resolvePublishNow()
    },
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : undefined
    },
    load: {
      filter: { id: /^\0virtual:pyreon-blog-planned$/ },
      handler(id) {
        if (id !== RESOLVED_ID) return undefined
        return `export default ${JSON.stringify(plannedPosts(readPosts(dir), now))}`
      },
    },
    handleHotUpdate(ctx) {
      if (!ctx.file.startsWith(dir) || !ctx.file.endsWith('.md')) return undefined
      const mod = ctx.server.moduleGraph.getModuleById(RESOLVED_ID)
      if (mod) ctx.server.moduleGraph.invalidateModule(mod)
      return undefined
    },
  }
}
