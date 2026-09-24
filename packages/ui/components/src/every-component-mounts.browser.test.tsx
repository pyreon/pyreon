import { h } from '@pyreon/core'
import { PyreonUI } from '@pyreon/ui-core'
import { theme } from '@pyreon/ui-theme'
import { afterEach, describe, expect, it } from 'vitest'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import * as components from './index'

/**
 * Every exported component mounts.
 *
 * A component library's long tail is the part nobody tests: the twenty
 * components that are declared, exported, documented — and rendered by no
 * spec at all. A rocketstyle chain with a bad `.theme()` key, a missing
 * import, or a base that no longer exists throws on FIRST MOUNT, which
 * means the first person to find it is a consumer, in their app, at
 * runtime.
 *
 * This is deliberately a SMOKE, not a behaviour suite: it asserts that
 * each component renders without throwing and puts a node in the
 * document. That is the bar a declaration is either above or below, and
 * it is exactly the class of breakage a declaration-only module can have.
 *
 * The list is derived from the barrel rather than hand-written, so a new
 * export is covered the day it lands — a hand-maintained list is the
 * "silent hole generator" shape the repo's rules name, and this is the
 * cheapest place to avoid it.
 *
 * Components needing required data or a parent context are given the
 * minimum to render; anything genuinely un-mountable in isolation is
 * listed with a reason rather than silently skipped.
 */

/**
 * Props for components that cannot render bare. Each entry is a REASON,
 * not a workaround — a component needing a parent context is a documented
 * composition requirement.
 */
const PROPS: Record<string, Record<string, unknown>> = {
  // Data-driven: no data, nothing to render.
  Tree: { data: [{ id: 'a', label: 'A' }] },
  Table: { data: [], columns: [] },
  Timeline: { items: [] },
  Breadcrumb: { data: [{ label: 'Home' }] },
  Pagination: { total: 10, page: 1 },
  // Value-driven.
  RingProgress: { value: 50 },
  Progress: { value: 50 },
  Rating: { value: 3 },
  Slider: { value: 50 },
  // Overlays need to be open to render anything.
  Modal: { open: true },
  Drawer: { open: true },
  Popover: { opened: true },
}

/**
 * Sub-components that only render inside their parent (an AccordionItem
 * outside an Accordion has no context to read). Listed with the parent
 * that owns them, so the omission is a documented composition fact rather
 * than an untested gap.
 */
const CONTEXT_BOUND = new Set([
  'AccordionItem',
  'AccordionTrigger',
  'AccordionContent',
  'TabsList',
  'TabsTrigger',
  'TabsContent',
  'GridRow',
  'GridCol',
  'FieldsetLegend',
  'StepperStep',
  'TimelineItem',
  'BreadcrumbItem',
  'ListItem',
  'MenuItem',
  'SelectOption',
])

const entries = Object.entries(components as Record<string, unknown>).filter(
  ([name, v]) => typeof v === 'function' && /^[A-Z]/.test(name) && !CONTEXT_BOUND.has(name),
)

let cleanup: (() => void) | undefined

afterEach(() => {
  cleanup?.()
  cleanup = undefined
  document.body.innerHTML = ''
})

describe('every exported component mounts without throwing', () => {
  it('the barrel actually exports components — the list is not empty', () => {
    // The totality guard. Without it a barrel that stopped exporting
    // anything would make this whole file pass vacuously.
    expect(entries.length, 'the smoke must have something to smoke').toBeGreaterThan(30)
  })

  for (const [name, Component] of entries) {
    it(`${name} renders`, () => {
      const props = PROPS[name] ?? {}
      let error: unknown
      try {
        const r = mountInBrowser(
          h(PyreonUI, { theme }, h(Component as never, props, 'content')),
        )
        cleanup = r.unmount
      } catch (e) {
        error = e
      }

      expect(error, `${name} threw on mount: ${String(error)}`).toBeUndefined()
      expect(
        document.body.querySelector('*'),
        `${name} mounted but rendered nothing`,
      ).not.toBeNull()
    })
  }
})
