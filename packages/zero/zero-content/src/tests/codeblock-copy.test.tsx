/**
 * `<CodeBlock>` copy-button behavior — the clipboard write + copied-state
 * flip + 2s reset-timer path (`handleCopy`), previously uncovered (the
 * pipeline tests only assert rendered structure; the click handler needs
 * a clipboard stub). happy-dom provides no `navigator.clipboard`, so the
 * spec installs a controllable stub and drives the resolve/reject paths.
 */
import { mountReactive } from '@pyreon/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CodeBlock } from '../components/CodeBlock'

type ClipboardStub = { writeText: ReturnType<typeof vi.fn> }

function installClipboard(impl: (text: string) => Promise<void>): ClipboardStub {
  const writeText = vi.fn(impl)
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  })
  return { writeText }
}

function removeClipboard(): void {
  Object.defineProperty(navigator, 'clipboard', {
    value: undefined,
    configurable: true,
  })
}

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

describe('<CodeBlock> copy button', () => {
  afterEach(() => {
    removeClipboard()
    vi.useRealTimers()
  })

  it('writes the source to the clipboard and flips to Copied, resetting after 2s', async () => {
    const { writeText } = installClipboard(() => Promise.resolve())
    const { container, cleanup } = mountReactive(() => (
      <CodeBlock
        source={'const x = 1\n'}
        lang="ts"
        dangerouslySetInnerHTML={{ __html: '<pre>const x = 1</pre>' }}
      />
    ))
    const btn = container.querySelector('button.code-block__copy') as HTMLButtonElement
    expect(btn).not.toBeNull()
    expect(btn.textContent).toContain('Copy')

    btn.click()
    await flush()
    expect(writeText).toHaveBeenCalledWith('const x = 1\n')
    expect(btn.textContent).toContain('Copied')
    expect(btn.getAttribute('data-copied')).toBe('true')

    // The 2s reset window restores the idle label.
    await new Promise((r) => setTimeout(r, 2100))
    expect(btn.textContent).toContain('Copy')
    cleanup()
  }, 10_000)

  it('a quick second click restarts the reset window (timer cleared, no early flip)', async () => {
    installClipboard(() => Promise.resolve())
    const { container, cleanup } = mountReactive(() => (
      <CodeBlock
        source="abc"
        lang="ts"
        dangerouslySetInnerHTML={{ __html: '<pre>abc</pre>' }}
      />
    ))
    const btn = container.querySelector('button.code-block__copy') as HTMLButtonElement
    btn.click()
    await flush()
    expect(btn.getAttribute('data-copied')).toBe('true')
    // Second click ~halfway through the window restarts it.
    await new Promise((r) => setTimeout(r, 1000))
    btn.click()
    await flush()
    await new Promise((r) => setTimeout(r, 1200))
    // 2.2s after the FIRST click but only 1.2s after the second — still copied.
    expect(btn.getAttribute('data-copied')).toBe('true')
    await new Promise((r) => setTimeout(r, 1000))
    expect(btn.getAttribute('data-copied')).toBeNull()
    cleanup()
  }, 10_000)

  it('clipboard rejection is swallowed (no crash, no copied flip)', async () => {
    installClipboard(() => Promise.reject(new Error('insecure context')))
    const { container, cleanup } = mountReactive(() => (
      <CodeBlock
        source="abc"
        lang="ts"
        dangerouslySetInnerHTML={{ __html: '<pre>abc</pre>' }}
      />
    ))
    const btn = container.querySelector('button.code-block__copy') as HTMLButtonElement
    btn.click()
    await flush()
    expect(btn.getAttribute('data-copied')).toBeNull()
    cleanup()
  })

  it('no clipboard API → click is a silent no-op', async () => {
    removeClipboard()
    const { container, cleanup } = mountReactive(() => (
      <CodeBlock
        source="abc"
        lang="ts"
        dangerouslySetInnerHTML={{ __html: '<pre>abc</pre>' }}
      />
    ))
    const btn = container.querySelector('button.code-block__copy') as HTMLButtonElement
    btn.click()
    await flush()
    expect(btn.getAttribute('data-copied')).toBeNull()
    cleanup()
  })

  it('no source → no copy button rendered (copyable gates on string source)', () => {
    const { container, cleanup } = mountReactive(() => (
      <CodeBlock lang="ts" dangerouslySetInnerHTML={{ __html: '<pre>x</pre>' }} />
    ))
    expect(container.querySelector('button.code-block__copy')).toBeNull()
    cleanup()
  })
})
