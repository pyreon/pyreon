/**
 * Shared by the two CSP browser files. A policy set through `<meta http-equiv>`
 * cannot be lifted, and CodeMirror keeps ONE `<style>` per document, so each
 * case runs in its own file (its own frame): the control (no nonce) and the fix.
 */
export const NONCE = 'pyreon-code-csp-test'

export const violations: SecurityPolicyViolationEvent[] = []

/** Apply `style-src 'self' 'nonce-…'` (no `'unsafe-inline'`) to this frame. */
export function applyPolicy(): void {
  const meta = document.createElement('meta')
  meta.httpEquiv = 'Content-Security-Policy'
  meta.content = `style-src 'self' 'nonce-${NONCE}'`
  document.head.appendChild(meta)
  document.addEventListener('securitypolicyviolation', (e) => violations.push(e))
}

/** Violations of the stylesheet rule (a `<style>` element), not of anything else. */
export const styleElementViolations = (): string[] =>
  violations
    .filter((v) => v.effectiveDirective === 'style-src-elem' || v.effectiveDirective === 'style-src')
    .map((v) => v.effectiveDirective)

export async function until(pred: () => boolean, ms = 10_000): Promise<void> {
  const start = Date.now()
  while (!pred()) {
    if (Date.now() - start > ms) throw new Error('until(): timed out')
    await new Promise((r) => setTimeout(r, 20))
  }
}
