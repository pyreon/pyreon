import { _setSelectWaitHook } from './props'

/** The observer of a select whose value waits for a matching option. */
const WAIT = Symbol('pyreon.selectWait')

type WaitingSelect = HTMLSelectElement & { [WAIT]?: MutationObserver }

/**
 * `<select value>` whose matching option does not exist yet (#4820).
 * Assigning `select.value` selects an option only if it EXISTS at that moment,
 * so a `<For>` over a list that loads after mount left the first option
 * selected while the signal held a valid value. Such a select watches its own
 * children until the option arrives, applies the value once and stops. After
 * that the selection is the user's: a pick, an `onChange` that declines the
 * change, a removed option and an unmatched value (the browser default) behave
 * as without a framework; set the signal to select something else. A
 * `multiple` select, a nullish value and a value that matched at once cost a
 * property read. The observer lives only while the value is unmatched.
 */
function waitForOption(sel: WaitingSelect, value: unknown): void {
  sel[WAIT]?.disconnect()
  if (value == null || sel.multiple || sel.value === (value = String(value))) return
  const observer = (sel[WAIT] = new MutationObserver(() => {
    const prev = sel.selectedIndex
    sel.value = value as string
    // Still no such option: keep what the browser selected.
    if (sel.value === value) observer.disconnect()
    else sel.selectedIndex = prev
  }))
  observer.observe(sel, { childList: true, subtree: true })
}

/**
 * Turn on late-option handling for `<select value>` (#4820). The compiler
 * emits a call in every client module that renders `<select value>`, so apps
 * without one never ship it. Idempotent. Call it yourself only when you build
 * a `<select value>` with `h()` and no compiler.
 */
export function _selectWait(): void {
  _setSelectWaitHook(waitForOption)
}
