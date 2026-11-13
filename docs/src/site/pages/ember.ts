/**
 * The one word of a hook headline that gets the ember gradient (the content
 * set does not name it for story and compare pages): the first measured
 * figure ("4×", "2.6×", "6.5×"), else the last word ("Ever.", "line.").
 */
export function emberWordOf(title: string): string {
  const figure = /\d[\d.,–-]*×/.exec(title)
  if (figure) return figure[0]
  const words = title.trim().split(/\s+/)
  return words[words.length - 1] ?? ''
}
