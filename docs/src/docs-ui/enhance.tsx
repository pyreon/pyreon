import { onMount } from '@pyreon/core'
import { startScrollSpy } from './toc'

const COPY_RESET_MS = 2000

/** The text a code block's copy button copies: the code as printed. Pure over the DOM; exported for tests. */
export function codeOf(button: Element): string {
  const pre = button.closest('.code-block')?.querySelector('.code-block__pre')
  return (pre?.textContent ?? '').replace(/\n$/, '')
}

/** Activates tab `index` of a `<CodeGroup>` (zero-content's markup: tabs + `data-active` on the panels). */
export function selectCodeGroupTab(group: Element, index: number): void {
  const tabs = group.querySelectorAll<HTMLElement>('.code-group__tab')
  tabs.forEach((tab, i) => {
    const on = i === index
    tab.setAttribute('aria-selected', on ? 'true' : 'false')
    tab.tabIndex = on ? 0 : -1
    tab.classList.toggle('code-group__tab--active', on)
  })
  group.querySelector('.code-group__panels')?.setAttribute('data-active', String(index))
}

/** A "#" link after each h2/h3 that has an id (the heading text stays its accessible name). */
export function addHeadingAnchors(root: ParentNode): void {
  for (const heading of root.querySelectorAll<HTMLElement>('h2[id], h3[id]')) {
    if (heading.querySelector('.dx-anchor') || heading.closest('pyreon-island')) continue
    const a = document.createElement('a')
    a.className = 'dx-anchor'
    a.href = `#${heading.id}`
    a.setAttribute('aria-label', `Link to this section: ${heading.textContent ?? ''}`)
    a.textContent = '#'
    heading.append(a)
  }
}

/**
 * The behaviour a docs article's static markup needs (an island,
 * `DocsEnhanceIsland`, one per page, rendering nothing):
 *
 *   - the copy button of every code block and the tabs of every code group
 *     (zero-content's `CodeBlock` / `CodeGroup` render them on the server;
 *     one delegated listener serves them all, so 40 code blocks cost no
 *     hydration),
 *   - a "#" anchor on each section heading,
 *   - scroll-spy for both "On this page" lists, and closing the inline one
 *     after a pick,
 *   - the sidebar scrolled to the current page (a page load starts it at the
 *     top, and the current page may be far down the list).
 */
export default function DocsEnhance() {
  onMount(() => {
    const article = document.getElementById('dx-article')
    const current = document.querySelector<HTMLElement>('.dx-aside [aria-current="page"]')
    const aside = current?.closest<HTMLElement>('.dx-aside')
    if (current && aside && aside.scrollHeight > aside.clientHeight) {
      const top = current.offsetTop - aside.clientHeight / 3
      if (top > 0) aside.scrollTop = top
    }
    const page = document.querySelector('.dx-page')
    // Marks the page's behaviour as attached (tests wait for it).
    page?.setAttribute('data-enhanced', '')
    const stopSpy = page ? startScrollSpy(page) : () => {}
    const inlineToc = document.querySelector<HTMLDetailsElement>('.dx-toc-inline')
    const onTocPick = (e: MouseEvent) => {
      if ((e.target as Element | null)?.closest('.dx-toc__link') && inlineToc) inlineToc.open = false
    }
    inlineToc?.addEventListener('click', onTocPick)
    if (!article) {
      return () => {
        stopSpy()
        inlineToc?.removeEventListener('click', onTocPick)
      }
    }
    addHeadingAnchors(article)

    const timers = new Set<ReturnType<typeof setTimeout>>()
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null
      const copy = target?.closest<HTMLElement>('.code-block__copy')
      if (copy) {
        if (typeof navigator === 'undefined' || !navigator.clipboard) return
        void navigator.clipboard.writeText(codeOf(copy)).then(
          () => {
            copy.textContent = 'Copied'
            copy.setAttribute('data-copied', 'true')
            const t = setTimeout(() => {
              timers.delete(t)
              copy.textContent = 'Copy'
              copy.removeAttribute('data-copied')
            }, COPY_RESET_MS)
            timers.add(t)
          },
          () => {
            // Clipboard refused (permissions, insecure context): the code stays selectable.
          },
        )
        return
      }
      const tab = target?.closest<HTMLElement>('.code-group__tab')
      const group = tab?.closest('.code-group')
      if (tab && group) {
        const index = [...group.querySelectorAll('.code-group__tab')].indexOf(tab)
        if (index >= 0) selectCodeGroupTab(group, index)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
      const tab = (e.target as Element | null)?.closest<HTMLElement>('.code-group__tab')
      const group = tab?.closest('.code-group')
      if (!tab || !group) return
      const tabs = [...group.querySelectorAll<HTMLElement>('.code-group__tab')]
      const next = (tabs.indexOf(tab) + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
      e.preventDefault()
      selectCodeGroupTab(group, next)
      tabs[next]?.focus()
    }
    article.addEventListener('click', onClick)
    article.addEventListener('keydown', onKey)
    return () => {
      stopSpy()
      inlineToc?.removeEventListener('click', onTocPick)
      article.removeEventListener('click', onClick)
      article.removeEventListener('keydown', onKey)
      for (const t of timers) clearTimeout(t)
      timers.clear()
    }
  })
  return null
}
