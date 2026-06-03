/**
 * @pyreon/toast — imperative toast notifications for Pyreon.
 *
 * No provider needed — call `toast()` from anywhere in your app,
 * and render `<Toaster />` once at the root.
 *
 * @example
 * import { toast, Toaster } from "@pyreon/toast"
 *
 * // In your root component:
 * function App() {
 *   return (
 *     <>
 *       <Toaster position="top-right" />
 *       <button onClick={() => toast.success("Saved!")}>Save</button>
 *     </>
 *   )
 * }
 *
 * // Anywhere in your app:
 * toast("Hello!")
 * toast.error("Something went wrong")
 * toast.promise(fetchData(), {
 *   loading: "Loading...",
 *   success: "Done!",
 *   error: "Failed",
 * })
 */

import { name as __pkgName, version as __pkgVersion } from '../package.json' with { type: 'json' }
import { registerSingleton } from '@pyreon/reactivity'

// Singleton sentinel — fail-loud detection of duplicate @pyreon/toast
// instances in the same heap. See @pyreon/reactivity/singleton-sentinel for
// full rationale. Hardcoded version is acceptable here — it's a diagnostic
// aid, not a load-bearing identity check.
registerSingleton(__pkgName, __pkgVersion, import.meta.url)

export { _reset, _toasts, toast } from './toast'
export { Toaster } from './toaster'
export type {
  Toast,
  ToasterProps,
  ToastOptions,
  ToastPosition,
  ToastPromiseOptions,
  ToastState,
  ToastType,
} from './types'
