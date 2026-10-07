/**
 * A lowercase JSX tag (`<div>`, `<span>`, `<svg>`, `<path>`) is a DOM or SVG
 * element. PMTC has no native lowering for one, and it used to fall through to
 * the generic component emit and be written as `div(…)` — a call that exists on
 * neither platform — with no warning. A library whose own renderers are built
 * from DOM markup may have a supported route for it (a plugin's
 * `intrinsicAdvice`), and the warning appends it.
 *
 * Shared by both emitters so the two targets say the same thing.
 */
export function isIntrinsicElementTag(tag: string): boolean {
  const first = tag.charCodeAt(0)
  return first >= 97 && first <= 122 && !tag.includes('.')
}

export function intrinsicElementWarning(tag: string, advice: readonly string[] = []): string {
  return (
    `<${tag}> is a DOM/SVG element with no native lowering, so it would be written as a ` +
    `\`${tag}(…)\` call that exists on neither iOS nor Android. Use the shared vocabulary from ` +
    `\`@pyreon/primitives\` (Stack, Text, Image, …), keep web-only markup inside a \`<Web>\` ` +
    `branch${advice.map((sentence) => `, or, ${sentence}`).join('')}.`
  )
}
