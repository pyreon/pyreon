/**
 * Sanitizer auto-registration injection — the vite-plugin half of the
 * tree-shakeable default-sanitizer seam (@pyreon/runtime-dom/sanitizer).
 * A module whose SOURCE uses the sanitized `innerHTML` prop gets the
 * side-effect registration import prepended; `dangerouslySetInnerHTML`
 * (raw by design) does NOT trigger it.
 */
import { describe, expect, it } from 'vitest'
import pyreon from '../index'

async function transformWith(source: string): Promise<string> {
  const plugins = pyreon() as unknown as {
    name?: string
    transform?: (code: string, id: string) => Promise<{ code: string } | string | null>
  }[]
  const p = (Array.isArray(plugins) ? plugins : [plugins]).find(
    (x) => typeof x.transform === 'function',
  )!
  const out = await p.transform!.call(
    { error: (e: unknown) => { throw e } },
    source,
    '/app/src/Comp.tsx',
  )
  return typeof out === 'string' ? out : (out?.code ?? source)
}

describe('sanitizer auto-registration injection', () => {
  it('injects the registration import when a module uses the sanitized innerHTML prop', async () => {
    const out = await transformWith(`export const C = () => <div innerHTML={userHtml()} />`)
    expect(out).toContain(`import '@pyreon/runtime-dom/sanitizer'`)
  })

  it('does NOT inject for dangerouslySetInnerHTML (raw by design)', async () => {
    const out = await transformWith(
      `export const C = () => <div dangerouslySetInnerHTML={{ __html: trusted }} />`,
    )
    expect(out).not.toContain(`@pyreon/runtime-dom/sanitizer`)
  })

  it('does NOT inject for modules without innerHTML', async () => {
    const out = await transformWith(`export const C = () => <div class="x">hi</div>`)
    expect(out).not.toContain(`@pyreon/runtime-dom/sanitizer`)
  })
})
