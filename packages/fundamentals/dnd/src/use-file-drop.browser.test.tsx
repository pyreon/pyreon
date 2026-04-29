import { describe, expect, it } from 'vitest'
import { useFileDrop } from './use-file-drop'

// Real-Chromium browser test for `useFileDrop`'s drop pathway. The
// happy-dom unit suite (`src/tests/dnd.test.ts`) covers the signal
// surface — `isOver`, `isDraggingFiles`, accept-filter wiring — but
// can't drive pragmatic-drag-and-drop's external/file adapter end-to-
// end because happy-dom's `DataTransfer` polyfill is incomplete enough
// that the adapter's window-level dragenter activation rejects the
// synthetic event.
//
// This test uses pdnd's official Playwright pattern (window-level
// `dragenter` + element-level `dragover` + `drop`, all sharing one
// DataTransfer) — same shape as the app-showcase `/dnd` e2e file-drop
// spec — but at the package level so a regression in `useFileDrop`'s
// `onDrop` wiring surfaces in `bun run test:browser` against
// @pyreon/dnd directly, before any consumer-app e2e runs.
//
// Why both this AND the e2e spec: the e2e exercises the FULL stack
// (Pyreon JSX → ref-callback → element resolution → pdnd → onDrop →
// signal write → DOM update). This unit-level test isolates the
// PDND-bridge layer — if pdnd updates and breaks `getFiles({source})`
// or the `onDrop` callback signature, this test fails BEFORE the e2e
// (which depends on a 100+ ms dev-server boot).

describe('useFileDrop — real-Chromium drop flow', () => {
  it('fires onDrop with the dropped File when the full pdnd sequence runs', async () => {
    const dropZone = document.createElement('div')
    dropZone.style.cssText = 'width: 200px; height: 200px'
    document.body.appendChild(dropZone)

    let received: File[] | null = null
    const result = useFileDrop({
      element: () => dropZone,
      onDrop: (files) => {
        received = files
      },
    })

    // pdnd registers its drop target asynchronously via `queueMicrotask`
    // (see `use-file-drop.ts` setup function). Yield a microtask so the
    // adapter is wired before we dispatch.
    await Promise.resolve()
    await new Promise<void>((r) => setTimeout(r, 0))

    const file = new File(['<bytes>'], 'avatar.png', { type: 'image/png' })
    const dataTransfer = new DataTransfer()
    dataTransfer.items.add(file)

    // 1. `dragenter` on `window` activates pdnd's external adapter.
    //    Bubbling a zone-targeted dragenter is platform-fragile (works
    //    on macOS Chromium, fails on Linux Chromium under headless);
    //    dispatching directly on window is the deterministic path
    //    documented in pdnd's own Playwright suite.
    window.dispatchEvent(new DragEvent('dragenter', { dataTransfer }))

    // 2. `dragover` + `drop` on the zone with the same DataTransfer
    //    instance — pdnd reads the file list from the event's transfer
    //    at drop time.
    dropZone.dispatchEvent(new DragEvent('dragover', { dataTransfer }))
    dropZone.dispatchEvent(new DragEvent('drop', { dataTransfer }))

    // pdnd's onDrop fires synchronously off the drop event, but the
    // signal write is wrapped in our cleanup-aware effect — yield once
    // more to let any pending microtasks flush.
    await Promise.resolve()

    expect(received).not.toBeNull()
    expect(received).toHaveLength(1)
    expect(received![0]!.name).toBe('avatar.png')
    expect(received![0]!.type).toBe('image/png')
    expect(result.isOver()).toBe(false)

    dropZone.remove()
  })

  it('filters out files that fail the `accept` pattern', async () => {
    const dropZone = document.createElement('div')
    dropZone.style.cssText = 'width: 200px; height: 200px'
    document.body.appendChild(dropZone)

    let received: File[] | null = null
    useFileDrop({
      element: () => dropZone,
      // PDF-only accept — image file should be rejected.
      accept: ['application/pdf'],
      onDrop: (files) => {
        received = files
      },
    })

    await Promise.resolve()
    await new Promise<void>((r) => setTimeout(r, 0))

    const file = new File(['<bytes>'], 'avatar.png', { type: 'image/png' })
    const dataTransfer = new DataTransfer()
    dataTransfer.items.add(file)

    window.dispatchEvent(new DragEvent('dragenter', { dataTransfer }))
    dropZone.dispatchEvent(new DragEvent('dragover', { dataTransfer }))
    dropZone.dispatchEvent(new DragEvent('drop', { dataTransfer }))

    await Promise.resolve()

    // The hook filters BEFORE invoking `onDrop` — when zero files
    // survive the filter, `onDrop` is never called.
    expect(received).toBeNull()

    dropZone.remove()
  })

  it('respects maxFiles by truncating the dropped list', async () => {
    const dropZone = document.createElement('div')
    dropZone.style.cssText = 'width: 200px; height: 200px'
    document.body.appendChild(dropZone)

    let received: File[] | null = null
    useFileDrop({
      element: () => dropZone,
      accept: ['image/*'],
      maxFiles: 2,
      onDrop: (files) => {
        received = files
      },
    })

    await Promise.resolve()
    await new Promise<void>((r) => setTimeout(r, 0))

    const dataTransfer = new DataTransfer()
    dataTransfer.items.add(new File(['a'], 'a.png', { type: 'image/png' }))
    dataTransfer.items.add(new File(['b'], 'b.png', { type: 'image/png' }))
    dataTransfer.items.add(new File(['c'], 'c.png', { type: 'image/png' }))

    window.dispatchEvent(new DragEvent('dragenter', { dataTransfer }))
    dropZone.dispatchEvent(new DragEvent('dragover', { dataTransfer }))
    dropZone.dispatchEvent(new DragEvent('drop', { dataTransfer }))

    await Promise.resolve()

    expect(received).not.toBeNull()
    expect(received).toHaveLength(2) // truncated from 3
    expect(received![0]!.name).toBe('a.png')
    expect(received![1]!.name).toBe('b.png')

    dropZone.remove()
  })
})
