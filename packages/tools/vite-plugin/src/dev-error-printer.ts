/**
 * Dev throw-time fix printer (ecosystem-DX Theme 6.1b).
 *
 * In DEV, the vite-plugin injects `import 'virtual:pyreon/dev-error-printer'`
 * into the app's `index.html`. That virtual module (source below) wires
 * `@pyreon/core`'s `registerErrorHandler` → the browser-safe
 * `@pyreon/compiler/diagnose` `diagnoseError` — so when a component/effect
 * throws in dev and the message matches a known Pyreon foot-gun, its
 * **cause + fix + fix-code** print to the console right at throw time.
 *
 * ## Decoupling (mirrors `__pyreon_count__` / HMR)
 *
 * The RUNTIME never imports the compiler. Only this injected DEV bootstrap
 * does — the compiler's error catalog (`@pyreon/compiler/diagnose`, extracted
 * in #2052 with ZERO `typescript` dependency) is a *browser-safe* module the
 * plugin pulls in exclusively for the dev bootstrap. Production never injects
 * the script, so nothing ships client-side.
 *
 * ## Why it fires
 *
 * `runtime-dom`'s mount/hydrate paths call `reportError` on component errors;
 * `reactivity`'s effect path forwards effect errors through the
 * `__pyreon_report_error__` bridge → `reportError` → every registered handler.
 * The plugin injects `resolve.dedupe: ['@pyreon/core']`, so the virtual
 * module's `@pyreon/core` is the SAME instance the app uses (one shared
 * `_errorHandlers`), which is what makes the handler actually receive errors.
 */

export const DEV_ERROR_PRINTER_IMPORT = 'virtual:pyreon/dev-error-printer'
// Vite stores virtual modules under the `\0`-prefixed id `resolveId` returns
// (never the `virtual:` string) — same convention as the HMR/islands modules.
export const DEV_ERROR_PRINTER_ID = '\0pyreon/dev-error-printer'

/**
 * The `<script type="module">` injected into `<head>` (dev only). An inline
 * module script whose sole `import` is the virtual module — Vite resolves the
 * `virtual:` id via this plugin's `resolveId`/`load`, so the browser runs the
 * bootstrap below.
 */
export const DEV_ERROR_PRINTER_SCRIPT_TAG = `<script type="module">import ${JSON.stringify(
  DEV_ERROR_PRINTER_IMPORT,
)}</script>`

/**
 * The virtual module's source — runs in the browser (dev only). Self-contained
 * (no plugin imports; it's a string served to the client). Kept defensive: a
 * diagnostic must NEVER throw back into the app, and an unknown error is a
 * silent no-op (returns before touching the console).
 */
export const DEV_ERROR_PRINTER_SOURCE = `import { registerErrorHandler } from '@pyreon/core'
import { diagnoseError } from '@pyreon/compiler/diagnose'

// Register once. Fires for component errors (runtime-dom mount/hydrate) AND
// effect errors (reactivity bridge) — see reportError in @pyreon/core.
registerErrorHandler((ctx) => {
  try {
    const err = ctx && ctx.error
    const msg = err instanceof Error ? (err.message || String(err)) : String(err)
    if (!msg) return
    const d = diagnoseError(msg)
    if (!d) return
    const badge = 'color:#c026d3;font-weight:bold'
    const plain = 'color:inherit;font-weight:normal'
    console.groupCollapsed('%c[Pyreon]%c ' + d.cause, badge, plain)
    console.info('%cFix:%c ' + d.fix, 'font-weight:bold', plain)
    if (d.fixCode) console.info(d.fixCode)
    if (d.related) console.info('Related: ' + d.related)
    console.groupEnd()
  } catch {
    // Diagnostics must never throw back into the framework.
  }
})
`
