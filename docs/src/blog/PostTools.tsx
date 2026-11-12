import { onMount } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { C } from '../site/kit/classes'

/**
 * The interactive parts of a blog post, one small island (a post page is
 * static HTML): the "Copy link" button it renders, plus two enhancements of
 * the server HTML around it, attached on mount and removed on unmount —
 *
 *   - the copy buttons the markdown pipeline prints in every code block
 *     (`.code-block__copy`) and the end row's copy-link button
 *     (`[data-copy-link]`, shown where the rail is hidden); without this
 *     island they would do nothing;
 *   - the table of contents (`[data-blog-toc]`) marking the section being
 *     read with `aria-current="location"`.
 *
 * Plain markup with the islands' class names (`kit/classes.ts`), so the
 * island ships no styling runtime. Props are JSON (labels and the URL).
 */
export type PostToolsProps = {
  url: string
  label: string
  copied: string
}

/** How far below the top of the window a heading counts as "being read" (the floating nav is ~90px). */
export const READING_LINE = 120

/** Index of the section being read: the last heading whose top is above the reading line. */
export function currentSection(tops: readonly number[], line = READING_LINE): number {
  let current = -1
  for (let i = 0; i < tops.length; i++) if ((tops[i] as number) <= line) current = i
  return current
}

const RESET_MS = 2000

export default function PostTools(props: PostToolsProps) {
  const copied = signal(false)
  let button: HTMLElement | null = null
  let linkTimer: ReturnType<typeof setTimeout> | undefined

  onMount(() => {
    const article = button?.closest('article')
    button?.setAttribute('data-hydrated', '')
    if (!article) return undefined
    const timers = new Set<ReturnType<typeof setTimeout>>()

    // Code blocks copy the block's text, the end row's "Copy link" (below
    // 992px, where the rail is hidden) the post's URL; each says so for two
    // seconds.
    const onClick = (e: MouseEvent) => {
      const target = e.target instanceof Element ? e.target.closest('.code-block__copy, [data-copy-link]') : null
      if (!(target instanceof HTMLButtonElement) || !navigator.clipboard) return
      const code = target.hasAttribute('data-copy-link') ? props.url : (target.closest('.code-block')?.querySelector('pre')?.textContent ?? '')
      const label = target.dataset['label'] ?? target.textContent ?? ''
      target.dataset['label'] = label
      navigator.clipboard
        .writeText(code)
        .then(() => {
          target.textContent = props.copied
          target.setAttribute('data-copied', '')
          const t = setTimeout(() => {
            target.textContent = label
            target.removeAttribute('data-copied')
            timers.delete(t)
          }, RESET_MS)
          timers.add(t)
        })
        .catch(() => {
          // Clipboard refused (permissions, insecure context): leave the label as it is.
        })
    }
    article.addEventListener('click', onClick)

    // Table of contents: mark the section under the reading line.
    const links = [...article.querySelectorAll<HTMLAnchorElement>('[data-blog-toc] a[href^="#"]')]
    const headings = links.map((a) => document.getElementById(decodeURIComponent(a.hash.slice(1))))
    let frame = 0
    const update = () => {
      frame = 0
      const index = currentSection(headings.map((h) => (h ? h.getBoundingClientRect().top : Number.POSITIVE_INFINITY)))
      links.forEach((a, i) => {
        if (i === index) a.setAttribute('aria-current', 'location')
        else a.removeAttribute('aria-current')
      })
    }
    const onScroll = () => {
      if (frame === 0) frame = requestAnimationFrame(update)
    }
    if (links.length > 0) {
      window.addEventListener('scroll', onScroll, { passive: true })
      update()
    }

    return () => {
      article.removeEventListener('click', onClick)
      window.removeEventListener('scroll', onScroll)
      if (frame !== 0) cancelAnimationFrame(frame)
      for (const t of timers) clearTimeout(t)
      if (linkTimer !== undefined) clearTimeout(linkTimer)
    }
  })

  const copyLink = () => {
    if (!navigator.clipboard) return
    navigator.clipboard
      .writeText(props.url)
      .then(() => {
        copied.set(true)
        if (linkTimer !== undefined) clearTimeout(linkTimer)
        linkTimer = setTimeout(() => {
          copied.set(false)
          linkTimer = undefined
        }, RESET_MS)
      })
      .catch(() => {
        // Clipboard refused: nothing to announce.
      })
  }

  return (
    <button
      type="button"
      class={C.pill}
      data-blog-tools=""
      ref={(el: HTMLElement | null) => {
        button = el
      }}
      onClick={copyLink}
    >
      <span aria-live="polite">{() => (copied() ? props.copied : props.label)}</span>
    </button>
  )
}
