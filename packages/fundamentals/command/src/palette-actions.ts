import { batch, isServer } from '@pyreon/reactivity'
import { untracked, warn } from './entry'
import type { PageFrame, PaletteCore } from './palette-core'
import type { Results } from './palette-results'
import type { PaletteMove, ResultItem } from './palette-types'
import type { Command } from './types'

/** The palette that is on screen: opening another one closes it. */
let visible: { core: PaletteCore; close(): void } | null = null

/**
 * Give focus back to the element that had it. While the dialog is still open that element is inert, so this waits for the
 * renderer to take the dialog down (a microtask later) and does nothing if the palette was opened again in the meantime.
 */
function restoreFocus(core: PaletteCore): void {
  const opener = core.opener
  core.opener = null
  if (core.options.restoreFocus === false || !(opener instanceof HTMLElement)) return
  queueMicrotask(() => {
    if (core.open.peek() || !opener.isConnected) return
    opener.focus({ preventScroll: true })
  })
}

function enterFrame(core: PaletteCore, results: Results, command: Command): void {
  const registered = core.commands.get(command.id) === command
  const frame: PageFrame = { id: command.id, command, parentQuery: core.query.peek() }
  batch(() => {
    core.frames.set([...untracked(results.pages), registered ? frame : { ...frame, external: true }])
    core.query.set('')
    core.active.set(null)
    core.runError.set(undefined)
  })
}

export function closePalette(core: PaletteCore): void {
  if (!core.open.peek()) return
  core.session++
  core.runController?.abort()
  core.runController = null
  core.source.cancel()
  batch(() => {
    core.open.set(false)
    core.running.set(null)
  })
  if (visible?.core === core) visible = null
  restoreFocus(core)
  core.options.onOpenChange?.(false)
}

/** Open at the root, or at a nested page by command id. Opening an open palette only navigates. */
export function openPalette(core: PaletteCore, results: Results, page?: string): void {
  if (isServer || core.disposed) return
  if (!core.open.peek()) {
    if (visible !== null && visible.core !== core) visible.close()
    core.session++
    core.opener = document.activeElement
    batch(() => {
      core.query.set('')
      core.frames.set([])
      core.active.set(null)
      core.runError.set(undefined)
      core.open.set(true)
    })
    visible = { core, close: () => closePalette(core) }
    core.options.onOpenChange?.(true)
  }
  if (page === undefined) return
  const command = core.commands.get(page)
  if (command === undefined || !(Array.isArray(command.children) || typeof command.children === 'function')) {
    warn(`command palette: open("${page}"): no registered command with that id has a page; opened at the root`)

    return
  }
  enterFrame(core, results, command)
}

export function backPage(core: PaletteCore, results: Results): boolean {
  const pages = untracked(results.pages)
  const top = pages.at(-1)
  if (top === undefined) return false
  batch(() => {
    core.frames.set(pages.slice(0, -1))
    core.query.set(top.parentQuery)
    core.active.set(null)
    core.runError.set(undefined)
  })

  return true
}

export function setQuery(core: PaletteCore, query: string): void {
  batch(() => {
    core.query.set(query)
    core.active.set(null)
    core.runError.set(undefined)
  })
}

/** The index to move to from `from` (-1 when nothing is active), for a number of steps, wrapping. */
function stepIndex(from: number, delta: number, count: number): number {
  if (from < 0) return delta > 0 ? Math.min(delta, count) - 1 : count + Math.max(delta, -count)
  const next = from + delta

  return ((next % count) + count) % count
}

function groupStarts(results: Results): number[] {
  return untracked(results.groups).flatMap((g) => (g.items[0] === undefined ? [] : [g.items[0].index]))
}

/** The index a move lands on, or -1 when there is nothing to land on. */
function target(results: Results, from: number, count: number, move: PaletteMove): number {
  if (count === 0) return -1
  if (typeof move === 'number') return stepIndex(from, move, count)
  if (move === 'first') return 0
  if (move === 'last') return count - 1
  const starts = groupStarts(results)
  if (move === 'nextGroup') return starts.find((s) => s > from) ?? starts[0] ?? 0
  const before = starts.filter((s) => s < from)

  return before.length > 0 ? (before.at(-1) as number) : (starts.at(-1) ?? 0)
}

export function moveActive(core: PaletteCore, results: Results, move: PaletteMove): void {
  const items = untracked(results.items)
  const at = target(
    results,
    items.findIndex((item) => item.id === core.active.peek()),
    items.length,
    move,
  )
  if (at >= 0) core.active.set((items[at] as ResultItem).id)
}

/** Run a row: open its page, or run its command and close (unless `keepOpen`). An error stays on the palette. */
export async function runRow(core: PaletteCore, results: Results, item: ResultItem): Promise<void> {
  if (!item.enabled) return
  if (item.hasPage) {
    enterFrame(core, results, item.command)

    return
  }
  if (core.running.peek() !== null) return
  const session = core.session
  const controller = new AbortController()
  core.runController = controller
  batch(() => {
    core.running.set(item.id)
    core.runError.set(undefined)
  })
  try {
    await core.commands.run(item.command, { source: 'palette', query: core.query.peek(), signal: controller.signal })
    if (session === core.session && item.command.keepOpen !== true) closePalette(core)
  } catch (error) {
    if (session === core.session) core.runError.set(error)
  } finally {
    if (session === core.session) core.running.set(null)
    if (core.runController === controller) core.runController = null
  }
}
