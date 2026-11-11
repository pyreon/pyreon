/**
 * Markup, styles and behaviour of zero's development error overlay.
 *
 * Self-contained by design: the overlay shows when the app failed to render,
 * so it cannot lean on the app's CSS, on web fonts, or on the framework
 * rendering anything. Everything here is a string of HTML and CSS plus one
 * plain DOM function.
 *
 * Two hosts use it:
 *   - the server (`error-overlay.ts`) sends it as a whole HTML document with
 *     status 500 when SSR, a loader or a middleware throws;
 *   - the browser (`dev-overlay.ts`) mounts it in a shadow root over the page
 *     when hydration reports a mismatch.
 *
 * Client-safe: no `node:*` import.
 */
import type { CodeFrame, OverlayReport } from './model'
import { formatCopyText, KIND_PHASE, KIND_TITLE } from './model'

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Escape, then render `inline code` spans the way the diagnose catalog writes them. */
function richText(str: string): string {
  return escapeHtml(str).replace(/`([^`\n]+)`/g, '<code>$1</code>')
}

/**
 * Colour tokens are the site's (pyreon.dev): dark by default, light under the
 * shared preference. Every text/background pair is held to 4.5:1 by
 * `overlay-contrast.test.ts`.
 */
export const OVERLAY_TOKENS = {
  dark: {
    obs: '#0A0A0E',
    obs2: '#111118',
    obs3: '#181822',
    line: '#23232E',
    line2: '#2E2E3B',
    ivory: '#F4EFE6',
    mist: '#C9C4B8',
    fog: '#8A8696',
    err: '#F87171',
    ok: '#4ADE80',
    link: '#22D3EE',
    well: '#0A0A0E',
    code: '#E6E0D2',
  },
  light: {
    obs: '#FAF5EB',
    obs2: '#FFFFFF',
    obs3: '#F4EFE6',
    line: '#E6DFD2',
    line2: '#D6CFC2',
    ivory: '#14141C',
    mist: '#45414F',
    fog: '#67637A',
    err: '#B91C1C',
    ok: '#11692F',
    link: '#0A6E89',
    well: '#F4EFE6',
    code: '#14141C',
  },
} as const

type Tokens = Record<keyof (typeof OVERLAY_TOKENS)['dark'], string>

function tokenVars(t: Tokens): string {
  return `--obs:${t.obs};--obs-2:${t.obs2};--obs-3:${t.obs3};--line:${t.line};--line-2:${t.line2};--ivory:${t.ivory};--mist:${t.mist};--fog:${t.fog};--err:${t.err};--ok:${t.ok};--link:${t.link};--well:${t.well};--code:${t.code};`
}

export const OVERLAY_CSS = `
.pz-ol{${tokenVars(OVERLAY_TOKENS.dark)}color-scheme:dark;
--sans:'Space Grotesk',ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
--mono:'JetBrains Mono',ui-monospace,'SFMono-Regular',Menlo,Consolas,monospace;
font-family:var(--sans);font-size:14px;line-height:1.5;color:var(--ivory);-webkit-text-size-adjust:100%;text-align:left}
@media (prefers-color-scheme:light){.pz-ol:not([data-theme=dark]){${tokenVars(OVERLAY_TOKENS.light)}color-scheme:light}}
.pz-ol[data-theme=light]{${tokenVars(OVERLAY_TOKENS.light)}color-scheme:light}
.pz-ol *,.pz-ol *::before,.pz-ol *::after{box-sizing:border-box}
.pz-ol [hidden]{display:none!important}
.pz-ol.pz-inline{position:fixed;inset:0;z-index:2147483647;overflow:auto;overscroll-behavior:contain;background:color-mix(in srgb,var(--obs) 82%,transparent);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px)}
.pz-ol.pz-page{min-height:100vh;background:var(--obs)}
.pz-wrap{max-width:860px;margin:36px auto;padding:0 16px}
.pz-case{border-radius:18px;border:1px solid color-mix(in srgb,var(--err) 40%,var(--line));background:var(--obs-2);box-shadow:0 30px 70px -30px rgba(0,0,0,.6);overflow:hidden;animation:pz-in .18s ease-out}
.pz-case:focus{outline:none}
@keyframes pz-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.pz-head{display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px;padding:14px 18px;border-bottom:1px solid var(--line);background:color-mix(in srgb,var(--err) 7%,var(--obs-2))}
.pz-sp{flex:1}
.pz-chip{display:inline-flex;align-items:center;height:22px;padding:0 8px;border-radius:999px;border:1px solid color-mix(in srgb,var(--err) 40%,transparent);font-family:var(--mono);font-size:11px;color:var(--err);white-space:nowrap}
.pz-where{font-family:var(--mono);font-size:12px;color:var(--mist);overflow-wrap:anywhere;min-width:0}
.pz-kbd{font-size:12px;color:var(--fog);white-space:nowrap}
.pz-ol kbd{font-family:var(--mono);font-size:11px;padding:1px 5px;border-radius:5px;border:1px solid var(--line-2);color:var(--mist);background:var(--obs-3)}
.pz-msg{margin:0;padding:18px 18px 6px;font-family:var(--mono);font-size:clamp(15px,1.8vw,18px);font-weight:500;line-height:1.5;color:var(--ivory);overflow-wrap:anywhere;white-space:pre-wrap}
.pz-details{margin:6px 18px 0;padding:0;display:grid;grid-template-columns:auto minmax(0,1fr);gap:4px 12px;font-size:13px}
.pz-details dt{color:var(--fog);font-family:var(--mono);font-size:12px}
.pz-details dd{margin:0;font-family:var(--mono);font-size:12.5px;color:var(--ivory);overflow-wrap:anywhere;white-space:pre-wrap}
.pz-file{display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px;padding:8px 18px 12px;font-family:var(--mono);font-size:12.5px}
.pz-file a{color:var(--link);overflow-wrap:anywhere;min-width:0}
.pz-b{height:32px;padding:0 13px;border-radius:8px;border:1px solid var(--line-2);background:transparent;color:var(--ivory);font:inherit;font-family:var(--sans);font-size:12.5px;cursor:pointer;white-space:nowrap}
.pz-b:hover{border-color:var(--fog)}
.pz-b.pri{background:var(--ivory);color:var(--obs);border-color:var(--ivory)}
.pz-ol a:focus-visible,.pz-ol button:focus-visible,.pz-ol summary:focus-visible,.pz-code:focus-visible{outline:2px solid var(--link);outline-offset:2px}
.pz-code{margin:0 18px;border-radius:12px;border:1px solid var(--line);background:var(--well);padding:10px 0;overflow-x:auto;font-family:var(--mono);font-size:12.5px;line-height:1.8}
.pz-l{display:grid;grid-template-columns:48px max-content;white-space:pre;min-width:max-content}
.pz-l>span{padding-right:14px;text-align:right;color:var(--fog);user-select:none}
.pz-l>code{font:inherit;color:var(--code);padding-right:14px}
.pz-l.pz-hl{background:color-mix(in srgb,var(--err) 12%,var(--well))}
.pz-l.pz-hl>span{color:var(--err)}
.pz-l.pz-caret>code{color:var(--err)}
.pz-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.pz-fix{margin:14px 18px 0;padding:12px 14px;border-radius:12px;border:1px solid color-mix(in srgb,var(--ok) 35%,var(--line));background:color-mix(in srgb,var(--ok) 6%,var(--obs-2))}
.pz-fix h3{margin:0;font-family:var(--mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--ok);font-weight:400}
.pz-fix p{margin:6px 0 0;font-size:14px;line-height:1.6;color:var(--mist);overflow-wrap:anywhere}
.pz-fix p.pz-do{color:var(--ivory)}
.pz-fix pre{margin:8px 0 0;padding:8px 10px;border-radius:8px;background:var(--well);border:1px solid var(--line);overflow-x:auto;font-family:var(--mono);font-size:12px;color:var(--code)}
.pz-ol code{font-family:var(--mono);font-size:.92em;color:var(--ivory)}
.pz-stack{margin:14px 18px 0;font-size:13px}
.pz-stack summary{cursor:pointer;color:var(--ivory);padding:6px 0}
.pz-stack summary span{color:var(--fog)}
.pz-stack ol{margin:6px 0 0;padding-left:22px;font-family:var(--mono);font-size:12px}
.pz-stack li{padding:3px 0;color:var(--ivory);overflow-wrap:anywhere}
.pz-stack li b{font-weight:500}
.pz-stack li span{margin-left:10px;color:var(--mist)}
.pz-stack li.pz-lib,.pz-stack li.pz-lib b,.pz-stack li.pz-lib span{color:var(--fog);font-weight:400}
.pz-actions{display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:16px 18px 18px;font-size:12.5px}
.pz-status{color:var(--mist)}
.pz-note{color:var(--fog)}
.pz-reopen{position:fixed;right:16px;bottom:16px;z-index:2147483647;height:36px;padding:0 14px;border-radius:999px;border:1px solid color-mix(in srgb,var(--err) 50%,var(--line));background:var(--obs-2);color:var(--err);font-family:var(--mono);font-size:12px;cursor:pointer}
@media (max-width:620px){.pz-wrap{margin:16px auto;padding:0 10px}.pz-head,.pz-msg,.pz-file,.pz-actions{padding-left:14px;padding-right:14px}.pz-code,.pz-fix,.pz-stack,.pz-details{margin-left:14px;margin-right:14px}.pz-l{grid-template-columns:38px max-content}}
@media (prefers-reduced-motion:reduce){.pz-case{animation:none}}
`

function renderFrame(frame: CodeFrame, label: string): string {
  const rows: string[] = []
  for (const l of frame.lines) {
    rows.push(
      `<div class="pz-l${l.highlight ? ' pz-hl' : ''}"><span>${l.number}</span><code>${escapeHtml(l.text) || ' '}${l.highlight ? '<span class="pz-sr"> (the error is on this line)</span>' : ''}</code></div>`,
    )
    if (l.highlight && frame.caret !== undefined) {
      rows.push(
        `<div class="pz-l pz-caret" aria-hidden="true"><span></span><code>${' '.repeat(frame.caret - 1)}^ here</code></div>`,
      )
    }
  }
  return `<div class="pz-code" role="region" aria-label="${escapeHtml(label)}" tabindex="0">${rows.join('')}</div>`
}

export interface RenderOverlayOptions {
  /** `page`: a whole document from the server. `inline`: mounted over the running app. */
  mode: 'page' | 'inline'
}

/** The overlay's markup (no `<style>`): a `.pz-ol` root holding the dialog. */
export function renderOverlayMarkup(report: OverlayReport, options: RenderOverlayOptions): string {
  const title = KIND_TITLE[report.kind]
  const phase = KIND_PHASE[report.kind]
  const parts: string[] = []
  parts.push(
    `<header class="pz-head"><span class="pz-chip">${escapeHtml(title)}</span><span class="pz-where" id="pz-where">${escapeHtml(report.route)} · ${escapeHtml(phase)}</span><span class="pz-sp"></span><span class="pz-kbd"><kbd>Esc</kbd> to dismiss</span></header>`,
  )
  parts.push(`<h2 class="pz-msg" id="pz-msg">${escapeHtml(report.message)}</h2>`)
  if (report.details && report.details.length > 0) {
    parts.push(
      `<dl class="pz-details">${report.details
        .map((d) => `<dt>${escapeHtml(d.label)}</dt><dd>${escapeHtml(d.value)}</dd>`)
        .join('')}</dl>`,
    )
  }
  if (report.location) {
    const loc = report.location
    const pos = `${loc.line}${loc.column !== undefined ? `:${loc.column}` : ''}`
    const href = `/__open-in-editor?file=${encodeURIComponent(`${loc.file}:${pos}`)}`
    parts.push(
      `<div class="pz-file"><a href="${escapeHtml(href)}" data-pz-open>${escapeHtml(`${loc.display}:${loc.line}`)}</a><span class="pz-sp"></span><button type="button" class="pz-b" data-pz-open="${escapeHtml(href)}">Open in editor</button></div>`,
    )
    if (report.frame) parts.push(renderFrame(report.frame, `Source of ${loc.display} around line ${loc.line}`))
  }
  if (report.fix) {
    const fix = report.fix
    parts.push(
      `<section class="pz-fix" aria-labelledby="pz-fix-h"><h3 id="pz-fix-h">How to fix it</h3><p>${richText(fix.cause)}</p><p class="pz-do">${richText(fix.fix)}</p>${fix.fixCode ? `<pre><code>${escapeHtml(fix.fixCode)}</code></pre>` : ''}</section>`,
    )
  }
  if (report.stack.length > 0) {
    const items = report.stack
      .map(
        (f) =>
          `<li${f.library ? ' class="pz-lib"' : ''}><b>${escapeHtml(f.fn || '(anonymous)')}</b><span>${escapeHtml(f.where)}</span>${f.library ? '<span class="pz-sr"> (library)</span>' : ''}</li>`,
      )
      .join('')
    parts.push(
      `<details class="pz-stack" open><summary>Stack <span>· library frames dimmed</span></summary><ol>${items}</ol></details>`,
    )
  }
  parts.push(
    `<div class="pz-actions"><button type="button" class="pz-b pri" data-pz-copy>Copy for your AI assistant</button><button type="button" class="pz-b" data-pz-reload>Reload</button>${report.note ? `<span class="pz-note">${escapeHtml(report.note)}</span>` : ''}<span class="pz-status" role="status" aria-live="polite" data-pz-status></span></div>`,
  )
  parts.push(`<textarea hidden aria-hidden="true" tabindex="-1" data-pz-copytext>${escapeHtml(formatCopyText(report))}</textarea>`)

  const dialog = `<section class="pz-case" role="alertdialog" aria-modal="true" aria-labelledby="pz-msg" aria-describedby="pz-where" tabindex="-1" data-pz-dialog>${parts.join('')}</section>`
  const reopen =
    options.mode === 'page'
      ? `<button type="button" class="pz-reopen" hidden data-pz-reopen>Show the error</button>`
      : ''
  return `<div class="pz-ol pz-${options.mode}" data-pz-ol><div class="pz-wrap" data-pz-wrap>${dialog}</div>${reopen}</div>`
}

/**
 * Wires the overlay: focus moves to the primary action and is trapped, Esc
 * dismisses (the page variant leaves a "Show the error" button; the inline
 * variant removes itself and gives focus back), and the copy, editor and
 * reload buttons work.
 *
 * MUST stay self-contained — no imports, no helpers from this module, plain
 * ES2019 — because the server page inlines it with `String(overlayBehaviour)`.
 * Returns a teardown.
 */
export function overlayBehaviour(scope: Document | ShadowRoot): () => void {
  const root = scope.querySelector('[data-pz-ol]') as HTMLElement
  const wrap = root.querySelector('[data-pz-wrap]') as HTMLElement
  const dialog = root.querySelector('[data-pz-dialog]') as HTMLElement
  const status = root.querySelector('[data-pz-status]') as HTMLElement
  const reopen = root.querySelector('[data-pz-reopen]') as HTMLButtonElement | null
  const copyText = root.querySelector('[data-pz-copytext]') as HTMLTextAreaElement
  const primary = root.querySelector('[data-pz-copy]') as HTMLButtonElement
  const host = 'host' in scope ? (scope as ShadowRoot).host : null
  const doc = host ? host.ownerDocument : (scope as Document)
  const previous = doc.activeElement as HTMLElement | null
  let open = true

  const say = (text: string) => {
    status.textContent = ''
    setTimeout(() => {
      status.textContent = text
    }, 30)
  }
  const activeEl = (): Element | null =>
    (host ? (scope as ShadowRoot).activeElement : doc.activeElement) as Element | null
  const focusables = (): HTMLElement[] =>
    Array.prototype.slice
      .call(dialog.querySelectorAll('a[href],button,summary,[tabindex="0"]'))
      .filter((el: HTMLElement) => !el.closest('[hidden]') && el.getClientRects().length > 0)

  const show = () => {
    open = true
    wrap.hidden = false
    if (reopen) reopen.hidden = true
    primary.focus()
  }
  const dismiss = () => {
    if (!open) return
    open = false
    if (host) {
      teardown()
      host.remove()
      if (previous && previous.isConnected && typeof previous.focus === 'function') previous.focus()
      return
    }
    wrap.hidden = true
    if (reopen) {
      reopen.hidden = false
      reopen.focus()
    }
  }

  const onKey = (e: KeyboardEvent) => {
    if (!open) return
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      dismiss()
      return
    }
    if (e.key !== 'Tab') return
    const items = focusables()
    if (items.length === 0) return
    const first = items[0] as HTMLElement
    const last = items[items.length - 1] as HTMLElement
    const active = activeEl()
    const inside = active !== null && dialog.contains(active)
    if (e.shiftKey && (active === first || !inside)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && (active === last || !inside)) {
      e.preventDefault()
      first.focus()
    }
  }
  const onFocusIn = (e: FocusEvent) => {
    if (!open) return
    const t = e.target as Node | null
    if (host ? t === host : t !== null && dialog.contains(t)) return
    primary.focus()
  }

  const onClick = (e: MouseEvent) => {
    const el = (e.target as Element).closest('[data-pz-open],[data-pz-copy],[data-pz-reload],[data-pz-reopen]')
    if (!el || !root.contains(el)) return
    if (el.hasAttribute('data-pz-reopen')) {
      show()
      return
    }
    if (el.hasAttribute('data-pz-reload')) {
      location.reload()
      return
    }
    if (el.hasAttribute('data-pz-open')) {
      e.preventDefault()
      const href = el.getAttribute('data-pz-open') || el.getAttribute('href') || ''
      fetch(href).then(
        (r) => say(r.ok ? 'Opening the file in your editor.' : `The dev server could not open your editor (HTTP ${r.status}).`),
        () => say('The dev server could not be reached to open your editor.'),
      )
      return
    }
    const text = copyText.value
    const fallback = () => {
      const ta = doc.createElement('textarea')
      ta.value = text
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      root.appendChild(ta)
      ta.select()
      let ok = false
      try {
        ok = doc.execCommand('copy')
      } catch {
        ok = false
      }
      ta.remove()
      primary.focus()
      say(ok ? 'Copied. Paste it into your AI assistant.' : 'Copying is blocked here. Select the error text and copy it by hand.')
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => say('Copied. Paste it into your AI assistant.'), fallback)
    } else fallback()
  }

  doc.addEventListener('keydown', onKey, true)
  doc.addEventListener('focusin', onFocusIn, true)
  root.addEventListener('click', onClick)
  function teardown() {
    doc.removeEventListener('keydown', onKey, true)
    doc.removeEventListener('focusin', onFocusIn, true)
    root.removeEventListener('click', onClick)
  }
  // The primary action sits at the bottom; opening must not scroll the
  // message out of view to reach it.
  primary.focus({ preventScroll: true })
  return teardown
}

/**
 * The shared colour preference: zero's `zero-theme` (what `useTheme` writes),
 * then the site-wide `pyreon-theme`, then the page's own `data-theme`, else
 * `undefined` so the CSS follows `prefers-color-scheme`.
 */
export function preferredTheme(): 'light' | 'dark' | undefined {
  const pick = (v: string | null | undefined) => (v === 'light' || v === 'dark' ? v : undefined)
  let stored: 'light' | 'dark' | undefined
  try {
    stored = pick(localStorage.getItem('zero-theme')) ?? pick(localStorage.getItem('pyreon-theme'))
  } catch {
    stored = undefined
  }
  return stored ?? pick(document.documentElement.getAttribute('data-theme'))
}

/** The full HTML document the server sends (status 500) when SSR, a loader or a middleware throws. */
export function renderOverlayDocument(report: OverlayReport): string {
  const title = `${KIND_TITLE[report.kind]}: ${report.route}`
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)} · Pyreon Zero (dev)</title>
<style>html,body{margin:0;padding:0}body{background:#0A0A0E}@media (prefers-color-scheme:light){body{background:#FAF5EB}}${OVERLAY_CSS}</style>
</head>
<body>
${renderOverlayMarkup(report, { mode: 'page' })}
<script>(function(){var t=(${String(preferredTheme)})();var r=document.querySelector('[data-pz-ol]');if(t&&r){r.setAttribute('data-theme',t);document.body.style.background=t==='light'?'${OVERLAY_TOKENS.light.obs}':'${OVERLAY_TOKENS.dark.obs}'}(${String(overlayBehaviour)})(document)})()</script>
</body>
</html>`
}
