/* oxlint-disable complexity -- auditLayout is serialized into the page by page.evaluate, so it cannot call module helpers; its three passes (wide, clipped, tap) are flat guard lists */
/**
 * The same audit as site-pages.spec.ts, shared by site-project.spec.ts and
 * site-blog.spec.ts (it runs inside the page through `page.evaluate`, so it
 * is self-contained): every visible text node against its
 * effective (composited) background. Text painted with a gradient, inside an
 * SVG, or on an image background is skipped.
 */
export function auditContrast(): string[] {
  const parse = (c: string) => {
    const m = c.match(/rgba?\(([^)]+)\)/)
    if (!m) return null
    const [r, g, b, a = '1'] = m[1]!.split(/[ ,/]+/).filter(Boolean)
    return [Number(r), Number(g), Number(b), Number(a)] as const
  }
  const lum = ([r, g, b]: readonly number[]) => {
    const f = (v: number) => {
      const c = v / 255
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!)
  }
  const bgOf = (el: Element): number[] | null => {
    const layers: (readonly number[])[] = []
    for (let n: Element | null = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n)
      if (cs.backgroundImage !== 'none' && !/gradient\(/.test(cs.backgroundImage)) return null
      if (/gradient\(/.test(cs.backgroundImage) && cs.backgroundClip !== 'text') return null
      const c = parse(cs.backgroundColor)
      if (c && c[3] > 0) {
        layers.push(c)
        if (c[3] >= 1) break
      }
    }
    let out = [255, 255, 255]
    for (const l of layers.reverse()) out = out.map((v, i) => l[i]! * l[3]! + v * (1 - l[3]!))
    return out
  }
  const bad: string[] = []
  const walker = document.createTreeWalker(document.querySelector('#site-main')!, NodeFilter.SHOW_TEXT)
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    const text = t.textContent?.trim()
    const el = t.parentElement
    if (!text || !el) continue
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none' || el.closest('[aria-hidden=true],[hidden],details:not([open])')) continue
    if (cs.backgroundClip === 'text' || el.closest('svg')) continue
    const box = el.getBoundingClientRect()
    if (box.width < 2 || box.height < 2) continue
    const fg = parse(cs.color)
    const bg = bgOf(el)
    if (!fg || !bg || fg[3] < 0.5) continue
    const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x) as [number, number]
    const ratio = (a + 0.05) / (b + 0.05)
    const size = Number.parseFloat(cs.fontSize)
    const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700)
    if (ratio < (large ? 3 : 4.5)) bad.push(`${ratio.toFixed(2)} "${text.slice(0, 30)}" ${cs.color} on rgb(${bg.map(Math.round)})`)
  }
  return bad
}

/** The seven widths every site page is checked at: phones, tablet, the in-between laptop widths and a wide desktop. */
export const SITE_WIDTHS = [320, 390, 768, 1024, 1280, 1440, 1920] as const

/** Widths where the site treats the screen as touch (theme.ts `touch.media`: below the 992px breakpoint). */
export const TOUCH_WIDTHS = [320, 390, 768] as const

/**
 * Layout audit, run inside the page (self-contained, like `auditContrast`):
 *
 * - `scroll`: how far the page scrolls sideways (must be 0).
 * - `wide`: elements wider than the page outside their own scroll container
 *   (decorative absolutely-positioned glows excepted).
 * - `clipped`: text cut off by an `overflow: hidden/clip` box (a text run
 *   that ends outside the box that hides it). Nested scroll containers and
 *   ellipsis / line-clamp truncation are intentional and skipped.
 * - `tap` (with `touch`): controls smaller than 44px tall (24px wide). A
 *   link inside running text is exempt (WCAG 2.5.8's inline exception), as
 *   is anything hidden, inert or aria-hidden.
 */
export function auditLayout(touch: boolean): { scroll: number; wide: string[]; clipped: string[]; tap: string[] } {
  const cw = document.documentElement.clientWidth
  const main = document.querySelector('#site-main') ?? document.body
  const name = (e: Element) => `${e.tagName.toLowerCase()}.${String(e.getAttribute('class') ?? '').split(' ').slice(0, 2).join('.')}`
  const all = [...main.querySelectorAll<HTMLElement>('*')]
  const wide = all.filter((e) => {
    const box = e.getBoundingClientRect()
    if (box.width === 0 || box.right <= cw + 1) return false
    for (let n: HTMLElement | null = e; n && n !== main; n = n.parentElement) {
      const cs = getComputedStyle(n)
      if (cs.position === 'absolute' || cs.position === 'fixed') return false
      if (n !== e && /auto|scroll|hidden|clip/.test(cs.overflowX) && n.getBoundingClientRect().right <= cw + 1) return false
    }
    return true
  })
  const clipped: string[] = []
  for (const e of all) {
    const cs = getComputedStyle(e)
    if (!/hidden|clip/.test(cs.overflowX + cs.overflowY) || cs.textOverflow === 'ellipsis' || cs.webkitLineClamp !== 'none') continue
    if (e.scrollWidth <= e.clientWidth + 2 && e.scrollHeight <= e.clientHeight + 2) continue
    const box = e.getBoundingClientRect()
    if (box.width < 4 || e.closest('[aria-hidden=true],[hidden]')) continue
    const walker = document.createTreeWalker(e, NodeFilter.SHOW_TEXT)
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      const host = t.parentElement
      if (!t.textContent?.trim() || !host || host.closest('[aria-hidden=true],[hidden]') || getComputedStyle(host).visibility === 'hidden') continue
      let nested = false
      for (let n: HTMLElement | null = host; n && n !== e; n = n.parentElement) {
        const ns = getComputedStyle(n)
        if (/auto|scroll/.test(ns.overflowX + ns.overflowY) || ns.textOverflow === 'ellipsis') nested = true
      }
      if (nested) continue
      // Only an axis that hides its overflow clips: a box that scrolls sideways shows the rest on scroll.
      const clipsX = /hidden|clip/.test(cs.overflowX)
      const clipsY = /hidden|clip/.test(cs.overflowY)
      const range = document.createRange()
      range.selectNodeContents(t)
      const out = [...range.getClientRects()].some(
        (r) => r.width >= 1 && ((clipsX && (r.right > box.right + 2 || r.left < box.left - 2)) || (clipsY && (r.bottom > box.bottom + 2 || r.top < box.top - 2))),
      )
      if (out) {
        clipped.push(`${name(e)}: "${t.textContent.trim().slice(0, 30)}"`)
        break
      }
    }
  }
  const tap: string[] = []
  if (touch) {
    for (const e of document.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, summary, [role=button], [role=tab]')) {
      const b = e.getBoundingClientRect()
      if (b.width === 0 || b.height === 0) continue
      const cs = getComputedStyle(e)
      if (cs.visibility === 'hidden' || e.closest('[hidden],[inert],[aria-hidden=true]')) continue
      // A checkbox or radio with a label: the label is the tap target.
      if (e.matches('input[type=checkbox], input[type=radio]') && (e as HTMLInputElement).labels?.length) continue
      if (e.tagName === 'A' && cs.display === 'inline') {
        // Running text: the nearest block around the link holds more text than the link.
        let block = e.parentElement
        while (block && getComputedStyle(block).display === 'inline') block = block.parentElement
        if (block && (block.textContent ?? '').trim().length > (e.textContent ?? '').trim().length + 15) continue
      }
      // A live demo shows the package's own components at the package's sizes
      // (the design-system demo's sm/md buttons, the flow canvas), and a docs
      // live example renders the very code printed beside it: neither is
      // restyled. Their surrounding chrome is kit code and is checked.
      if (e.closest('pyreon-island[data-component=DemoDesign], pyreon-island[data-component=DemoFlow], pyreon-island[data-component=DocsExample]')) continue
      // Off-screen or visually hidden until focused (a skip link, sr-only text): not a target yet.
      if (b.bottom < 0 || b.right < 0 || (b.width <= 1 && b.height <= 1)) continue
      if (b.height < 43.5 || b.width < 24) tap.push(`${name(e)} "${(e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 24)}" ${Math.round(b.width)}x${Math.round(b.height)}`)
    }
  }
  return { scroll: document.documentElement.scrollWidth - cw, wide: wide.slice(0, 3).map(name), clipped: clipped.slice(0, 5), tap: tap.slice(0, 10) }
}

/** Cumulative layout shift since navigation (install `trackShifts` first). */
export function trackShiftsScript(): void {
  const w = window as unknown as { __cls: number }
  w.__cls = 0
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
      if (!entry.hadRecentInput) w.__cls += entry.value
    }
  }).observe({ type: 'layout-shift', buffered: true })
}
