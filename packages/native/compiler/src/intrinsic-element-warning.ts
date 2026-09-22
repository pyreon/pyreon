/**
 * A lowercase JSX tag (`<div>`, `<span>`, `<svg>`, `<path>`) is a DOM or SVG
 * element. PMTC has no native lowering for one, and it used to fall through to
 * the generic component emit and be written as `div(…)` — a call that exists on
 * neither platform — with no warning. Inside a `<Flow>` custom node that is the
 * exact silent loss the flow parity plan forbids: a renderer built from DOM,
 * CSS or SVG has a supported route, `<FlowWebView>` from `@pyreon/flow/webview`,
 * and the warning must name it.
 *
 * Shared by both emitters so the two targets say the same thing.
 */
export function isIntrinsicElementTag(tag: string): boolean {
  const first = tag.charCodeAt(0)
  return first >= 97 && first <= 122 && !tag.includes('.')
}

export function intrinsicElementWarning(tag: string): string {
  return (
    `<${tag}> is a DOM/SVG element with no native lowering, so it would be written as a ` +
    `\`${tag}(…)\` call that exists on neither iOS nor Android. Use the shared vocabulary from ` +
    `\`@pyreon/primitives\` (Stack, Text, Image, …), keep web-only markup inside a \`<Web>\` ` +
    `branch, or, for a \`<Flow>\` node or edge renderer built from DOM, CSS or SVG, host the ` +
    `diagram with \`<FlowWebView>\` from \`@pyreon/flow/webview\`, which runs the web renderer ` +
    `unchanged on both platforms.`
  )
}

/** The route for an arbitrary SVG path string inside a native Flow renderer. */
export const FLOW_ARBITRARY_PATH_WARNING =
  'A native Flow <path> requires a structured path helper result (`get*Path({...}).path`) or the ' +
  'custom connection-line `path()` accessor. An arbitrary SVG path string needs a NativeIOS/NativeAndroid ' +
  'renderer, or host the diagram with `<FlowWebView>` from `@pyreon/flow/webview`, which draws it unchanged.'
