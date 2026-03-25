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

export { _reset, _toasts, toast } from "./toast"
export { Toaster } from "./toaster"
export type {
  Toast,
  ToasterProps,
  ToastOptions,
  ToastPosition,
  ToastPromiseOptions,
  ToastState,
  ToastType,
} from "./types"
