import { onUnmount, Show } from '@pyreon/core'
import { useClickOutside, useEventListener } from '@pyreon/hooks'
import { signal } from '@pyreon/reactivity'
import { sourcePathOf } from './nav'

export const SITE_ORIGIN = 'https://pyreon.dev'
const REPO = 'pyreon/pyreon'
const BRANCH = 'main'

export const editUrlOf = (slug: string): string => `https://github.com/${REPO}/edit/${BRANCH}/${sourcePathOf(slug)}`
/** The page's Markdown source, served by GitHub (same text the page was built from on `main`). */
export const rawUrlOf = (slug: string): string => `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${sourcePathOf(slug)}`

/**
 * The prompt "Ask your AI" hands an assistant: the site's llms.txt for the
 * big picture, then this page (its URL and its Markdown). Pure; exported for
 * tests. Nothing is sent anywhere by the site: the reader copies it, or opens
 * it in an assistant of their choice through a plain link.
 */
export function aiPrompt(page: { title: string; url: string; raw?: string | undefined }): string {
  const source = page.raw ? ` (Markdown source: ${page.raw})` : ''
  return [
    `I'm working with Pyreon, a TypeScript UI framework. Read ${SITE_ORIGIN}/llms.txt for an overview of its packages and APIs,`,
    `then read the docs page "${page.title}" at ${page.url}${source}.`,
    'Answer my questions using those pages, and say when something is not covered there.',
    '',
    'My question: ',
  ].join('\n')
}

export const assistantLinks = (prompt: string): { label: string; href: string }[] => [
  { label: 'Open in Claude', href: `https://claude.ai/new?q=${encodeURIComponent(prompt)}` },
  { label: 'Open in ChatGPT', href: `https://chatgpt.com/?q=${encodeURIComponent(prompt)}` },
]

async function copyText(text: string | Promise<string>): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard) return false
  try {
    // A ClipboardItem with a promise keeps the click's user activation through
    // the fetch (Safari drops it across an await before writeText).
    if (typeof ClipboardItem !== 'undefined' && typeof text !== 'string') {
      const blob = text.then((t) => new Blob([t], { type: 'text/plain' }))
      await navigator.clipboard.write([new ClipboardItem({ 'text/plain': blob })])
      return true
    }
    await navigator.clipboard.writeText(await text)
    return true
  } catch {
    return false
  }
}

/** A transient status next to a button ("Copied", "Could not copy"). */
function useFlash() {
  const msg = signal('')
  let timer: ReturnType<typeof setTimeout> | undefined
  onUnmount(() => clearTimeout(timer))
  return {
    msg,
    flash: (text: string) => {
      msg.set(text)
      clearTimeout(timer)
      timer = setTimeout(() => msg.set(''), 2400)
    },
  }
}

function AskAi(props: { title: string; url: string; raw?: string | undefined; align?: 'start' | 'end' | undefined }) {
  const open = signal(false)
  const { msg, flash } = useFlash()
  let root: HTMLElement | null = null
  let button: HTMLButtonElement | null = null
  const prompt = aiPrompt(props)

  useClickOutside(() => root, () => open.set(false))
  useEventListener('keydown', (e) => {
    if (e.key === 'Escape' && open.peek()) {
      open.set(false)
      button?.focus()
    }
  })

  return (
    <div
      class="dx-ask"
      ref={(el: HTMLElement | null) => {
        root = el
      }}
    >
      <button
        type="button"
        class="dx-action"
        aria-expanded={() => (open() ? 'true' : 'false')}
        aria-controls="dx-ask-menu"
        ref={(el: HTMLButtonElement | null) => {
          button = el
        }}
        onClick={() => open.set(!open.peek())}
      >
        Ask your AI
      </button>
      <Show when={() => open()}>
        <div class={props.align === 'end' ? 'dx-ask__menu dx-ask__menu--end' : 'dx-ask__menu'} id="dx-ask-menu">
          <p class="dx-ask__note">A prompt that points your assistant at llms.txt and this page. Nothing is sent from this site.</p>
          <button
            type="button"
            class="dx-ask__item"
            onClick={async () => flash((await copyText(prompt)) ? 'Prompt copied' : 'Could not copy')}
          >
            Copy prompt
          </button>
          {assistantLinks(prompt).map((l) => (
            <a class="dx-ask__item" href={l.href} target="_blank" rel="noopener noreferrer" onClick={() => open.set(false)}>
              {l.label}
              <span aria-hidden="true"> ↗</span>
            </a>
          ))}
          <output class="dx-ask__status">{() => msg()}</output>
        </div>
      </Show>
    </div>
  )
}

/**
 * The page actions under the breadcrumbs: Edit this page · Copy as Markdown ·
 * Ask your AI. A page without a Markdown source (the docs home) shows only the
 * last one.
 */
export function PageActions(props: { title: string; url: string; slug?: string | undefined }) {
  const { msg, flash } = useFlash()
  const slug = props.slug
  const copyMarkdown = async () => {
    if (slug === undefined) return
    const text = fetch(rawUrlOf(slug)).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.text()
    })
    flash((await copyText(text)) ? 'Markdown copied' : 'Could not copy')
  }
  return (
    <div class="dx-actions">
      {slug !== undefined ? (
        <>
          <a class="dx-action" href={editUrlOf(slug)} rel="noopener noreferrer">
            Edit this page
          </a>
          <button type="button" class="dx-action" onClick={copyMarkdown}>
            Copy as Markdown
          </button>
        </>
      ) : null}
      <AskAi title={props.title} url={props.url} raw={slug !== undefined ? rawUrlOf(slug) : undefined} />
      <output class="dx-actions__status">{() => msg()}</output>
    </div>
  )
}
