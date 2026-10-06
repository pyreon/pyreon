/**
 * Capture readiness for `atlas verify-browser` (#3837).
 *
 * A screenshot taken one frame after the click-walk records whatever a
 * JavaScript-driven animation happens to be showing at that instant — a canvas
 * `requestAnimationFrame` loop is invisible to Playwright's
 * `animations: 'disabled'` (that only fast-forwards CSS / Web Animations).
 * Before capturing, the runner therefore waits until the preview has been
 * UNCHANGED for a stable window, bounded by a hard cap. A preview that never
 * settles is NOT snapshotted: recording an arbitrary frame as a baseline is a
 * false signal in both directions.
 *
 * What counts as "changed" (all cheap, polled at rAF cadence):
 *   - any DOM mutation under the preview (a MutationObserver counter);
 *   - any element's geometry (catches JS-driven layout and transitions);
 *   - each `<canvas>`'s pixel content (an FNV hash of `toDataURL()`; a tainted
 *     canvas contributes a constant, geometry still applies);
 *   - a `<video>` that is playing, or an `<img>` still loading — these are not
 *     "stable" by definition, so they hold the wait open;
 *   - `document.fonts` loading — awaited first.
 *
 * CSS animations / transitions / Web Animations are NORMALISED, exactly the
 * way Playwright's `animations: 'disabled'` does it at capture time: finite
 * ones are `finish()`ed, infinite ones are `pause()`d. An infinite spinner is
 * therefore not "unsettled" (it is frozen, as the snapshot will freeze it); a
 * JS loop that never ends — which nothing can freeze — is.
 *
 * Static previews settle fast: when the preview holds no canvas, video or
 * loading image, the stable window is capped at {@link QUIET_SETTLE_MS}.
 */

/** Default length of the unchanged window before a capture (ms). */
export const DEFAULT_SETTLE_MS = 300
/** Default hard cap on the wait (ms); past it the scenario is `capture-unsettled`. */
export const DEFAULT_SETTLE_TIMEOUT_MS = 5000
/** Stable window used for previews with no canvas / video / loading image. */
export const QUIET_SETTLE_MS = 100

export type SettleOutcome =
  | { status: 'settled'; waitedMs: number }
  | { status: 'unsettled'; waitedMs: number; reasons: string[] }

/**
 * The in-page expression: an async function taking `(stableMs, timeoutMs,
 * quietMs)` and resolving a {@link SettleOutcome}. Exported as source because
 * it is evaluated inside the page; a syntax error would otherwise only
 * surface as a browser run dying, so it is parsed eagerly in tests.
 */
export const SETTLE_SOURCE = `(async (stableMs, timeoutMs, quietMs) => {
  const m = globalThis.__ATLAS_MODEL__
  const surface = m && m.previewElement && m.previewElement()
  const start = performance.now()
  if (!surface) return { status: 'settled', waitedMs: 0 }
  const frame = () => new Promise((resolve) => {
    let done = false
    const fin = () => { if (!done) { done = true; resolve() } }
    requestAnimationFrame(fin)
    setTimeout(fin, 50) // a hidden document never fires rAF; the cap must still end
  })
  const withinCap = (p) => Promise.race([p, new Promise((r) => setTimeout(r, Math.max(0, timeoutMs - (performance.now() - start))))])
  try { await withinCap(document.fonts.ready) } catch {}

  let mutations = 0
  const observer = new MutationObserver((records) => { mutations += records.length })
  observer.observe(surface, { subtree: true, childList: true, attributes: true, characterData: true })

  const hash = (str) => {
    let h = 2166136261
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
    return h >>> 0
  }
  const sample = () => {
    const busy = []
    // Normalise Web Animations the way Playwright's animations:'disabled' does.
    for (const a of surface.getAnimations({ subtree: true })) {
      try {
        const t = a.effect && a.effect.getComputedTiming()
        if (t && t.iterations === Infinity) { if (a.playState === 'running') a.pause() }
        else if (a.playState === 'running') a.finish()
      } catch {}
    }
    const canvases = surface.querySelectorAll('canvas')
    const videos = surface.querySelectorAll('video')
    const images = surface.querySelectorAll('img')
    let pendingImages = 0
    for (const img of images) if (!img.complete) pendingImages++
    let playing = 0
    for (const v of videos) if (!v.paused && !v.ended) playing++
    if (pendingImages > 0) busy.push(pendingImages + ' image(s) still loading')
    if (playing > 0) busy.push(playing + ' playing <video>')
    const parts = { mutations }
    let canvasIndex = 0
    for (const c of canvases) {
      let h = 0
      try { h = hash(c.toDataURL()) } catch { h = 1 }
      parts['canvas#' + canvasIndex++] = h
    }
    let g = 0
    let n = 0
    const all = [surface, ...surface.querySelectorAll('*')]
    for (const el of all) {
      if (n++ > 2000) break
      const r = el.getBoundingClientRect()
      g = (Math.imul(g, 31) + Math.round(r.x * 10) ^ Math.round(r.y * 10) ^ (Math.round(r.width * 10) << 3) ^ (Math.round(r.height * 10) << 7)) | 0
    }
    parts.geometry = g
    const quiet = canvases.length === 0 && videos.length === 0 && pendingImages === 0
    return { parts, busy, quiet }
  }

  try {
    let last = null
    let lastChange = performance.now()
    for (;;) {
      await frame()
      const now = performance.now()
      const s = sample()
      const changed = []
      if (last) for (const k of Object.keys(s.parts)) if (s.parts[k] !== last[k]) changed.push(k === 'mutations' ? 'DOM mutations' : k === 'geometry' ? 'element geometry' : k.replace('#', ' #') + ' pixels')
      if (s.busy.length > 0 || changed.length > 0 || last === null) {
        last = s.parts
        lastChange = now
        if (now - start >= timeoutMs) return { status: 'unsettled', waitedMs: Math.round(now - start), reasons: [...s.busy, ...changed] }
        continue
      }
      if (now - lastChange >= (s.quiet ? Math.min(stableMs, quietMs) : stableMs)) return { status: 'settled', waitedMs: Math.round(now - start) }
      if (now - start >= timeoutMs) return { status: 'unsettled', waitedMs: Math.round(now - start), reasons: ['not stable for ' + stableMs + 'ms'] }
    }
  } finally {
    observer.disconnect()
  }
})`

/** Human wording for an unsettled outcome (also the `fix` text). */
export function unsettledMessage(outcome: Extract<SettleOutcome, { status: 'unsettled' }>, settleMs: number, timeoutMs: number): string {
  const why = outcome.reasons.length > 0 ? ` — still changing: ${[...new Set(outcome.reasons)].join(', ')}` : ''
  return `the preview was not stable for ${settleMs}ms within ${timeoutMs}ms${why}. No screenshot was taken: a baseline recorded mid-animation is an arbitrary frame.`
}
