/**
 * The `llms.txt` that https://pyreon.dev/llms.txt serves (copied from the repo
 * root by vite-plugins/publish-llms-txt.ts) must pass Lighthouse's `llms-txt`
 * audit — run here through the audit's own code, pinned with the gate — and
 * follow the llmstxt.org shape. Every pyreon.dev link in it must point at a
 * page the site builds.
 */
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import LlmsTxtAudit from 'lighthouse/core/audits/agentic/llms-txt.js'
import { checkLlmsTxtShape } from '../../../scripts/gen-docs-core'

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const CONTENT = join(REPO_ROOT, 'docs/src/content/docs')
const llmsTxt = readFileSync(join(REPO_ROOT, 'llms.txt'), 'utf-8')

function audit(content: string): { score: number | null } {
  return LlmsTxtAudit.audit({ LlmsTxt: { status: 200, content } } as never) as { score: number | null }
}

describe('llms.txt', () => {
  it("passes Lighthouse's llms-txt audit", () => {
    expect(audit(llmsTxt).score).toBe(1)
  })

  it('the audit fails a file without Markdown links (the shape this replaced)', () => {
    expect(audit('# Pyreon\n\n> Summary.\n\n## Signals\n\n- @pyreon/reactivity — signals\n').score).toBe(0)
  })

  it('follows the llmstxt.org shape', () => {
    expect(checkLlmsTxtShape(llmsTxt)).toEqual([])
  })

  it('links only to pages the site builds', () => {
    const missing: string[] = []
    for (const [, url] of llmsTxt.matchAll(/\]\((https:\/\/pyreon\.dev\/[^)]*)\)/g)) {
      const path = new URL(url!).pathname
      if (path === '/llms-full.txt') {
        if (!existsSync(join(REPO_ROOT, 'llms-full.txt'))) missing.push(url!)
        continue
      }
      const slug = path.replace(/^\/docs\//, '')
      if (!path.startsWith('/docs/') || !existsSync(join(CONTENT, `${slug}.md`))) missing.push(url!)
    }
    expect(missing).toEqual([])
  })
})

describe('checkLlmsTxtShape', () => {
  const ok = '# T\n\n> Summary.\n\nProse.\n\n## Docs\n\n- [A](https://x.dev/a): note\n- [B](https://x.dev/b)\n'

  it('accepts the llmstxt.org shape', () => {
    expect(checkLlmsTxtShape(ok)).toEqual([])
  })

  it('rejects a code block, prose or a sub-heading inside a section', () => {
    expect(checkLlmsTxtShape(`${ok}\n\`\`\`ts\nconst x = 1\n\`\`\`\n`).join()).toContain('code block')
    expect(checkLlmsTxtShape(`${ok}plain text\n`).join()).toContain('may only hold')
    expect(checkLlmsTxtShape(`${ok}### Sub\n`).join()).toContain('only one H1')
  })

  it('rejects a missing H1, a missing blockquote, relative links and a file without links', () => {
    expect(checkLlmsTxtShape('> s\n').join()).toContain('H1')
    expect(checkLlmsTxtShape('# T\n\nProse [a](https://x.dev)\n').join()).toContain('blockquote')
    expect(checkLlmsTxtShape('# T\n\n> s\n\n## D\n\n- [a](/a)\n').join()).toContain('absolute https')
    expect(checkLlmsTxtShape('# T\n\n> s\n').join()).toContain('no Markdown links')
  })
})
