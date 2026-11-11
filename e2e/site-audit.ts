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
