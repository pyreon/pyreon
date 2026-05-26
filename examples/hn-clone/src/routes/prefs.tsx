import { useHead } from '@pyreon/head'
import { useI18n } from '@pyreon/i18n'
import { toast } from '@pyreon/toast'
import { Element, Text, List } from '@pyreon/elements'
import { Container, Row, Col } from '@pyreon/coolgrid'
import { Transition } from '@pyreon/runtime-dom'
import { fade } from '@pyreon/kinetic-presets'
import { signal, computed } from '@pyreon/reactivity'
import { useBookmarksModel } from '../lib/bookmarks'
import { usePrefs } from '../lib/prefs'

/**
 * Preferences page — exercises the UI-system layer:
 *  - `@pyreon/store`           (defineStore composition for prefs)
 *  - `@pyreon/elements`        (Element/Text/List/Portal primitives)
 *  - `@pyreon/coolgrid`        (12-col responsive Container/Row/Col)
 *  - `@pyreon/kinetic-presets` (`fade` preset for the modal animation)
 *  - `@pyreon/runtime-dom`'s `Transition` (mounting/unmounting animation)
 *
 * The page renders the user's preferences with reactive toggles, plus a
 * mini-modal demo for Portal (rendered into document.body) + Transition
 * (animated mount/unmount via the kinetic-presets `fade` class names).
 */
export default function PrefsPage() {
  const { t: _t } = useI18n()
  useHead(() => ({ title: 'Preferences — Hacker News (Pyreon)' }))

  const prefs = usePrefs()
  const bookmarks = useBookmarksModel()
  const modalOpen = signal(false)

  const bookmarkCount = computed(() => bookmarks.count() as number)

  return (
    <>
    <Container>
      <Row>
        <Col col={12}>
          <Element tag="header" direction="rows" gap={2} block class="prefs-header">
            <Text tag="h1">Preferences</Text>
            <Text tag="p" paragraph>
              Settings persist to localStorage. Density affects feed
              listings; auto-expand controls comment threads.
            </Text>
          </Element>
        </Col>
      </Row>

      <Row>
        <Col col={12} md={6}>
          <Element
            tag="section"
            class="prefs-card"
            direction="rows"
            gap={3}
            block
          >
            <Text tag="h2">Density</Text>
            <Text tag="p" paragraph>
              Current: <strong>{() => prefs.store.density()}</strong>
            </Text>
            <List tag="ul" gap={1} class="prefs-radios">
              {(['comfortable', 'compact'] as const).map((d) => (
                <li>
                  <label>
                    <input
                      type="radio"
                      name="density"
                      value={d}
                      checked={() => prefs.store.density() === d}
                      onChange={() => {
                        prefs.store.setDensity(d)
                        toast.info(`Density: ${d}`)
                      }}
                    />{' '}
                    {d}
                  </label>
                </li>
              ))}
            </List>
          </Element>
        </Col>

        <Col col={12} md={6}>
          <Element
            tag="section"
            class="prefs-card"
            direction="rows"
            gap={3}
            block
          >
            <Text tag="h2">Comments</Text>
            <label>
              <input
                type="checkbox"
                checked={() => prefs.store.autoExpandComments()}
                onChange={() => {
                  prefs.store.toggleAutoExpand()
                  toast.info(
                    `Auto-expand comments: ${prefs.store.autoExpandComments() ? 'on' : 'off'}`,
                  )
                }}
              />{' '}
              Auto-expand thread on item page
            </label>
            <label>
              <input
                type="checkbox"
                checked={() => prefs.store.showBreakpointDebug()}
                onChange={() => prefs.store.toggleBreakpointDebug()}
              />{' '}
              Show breakpoint debug strip on item page
            </label>
          </Element>
        </Col>
      </Row>

      <Row>
        <Col col={12}>
          <Element
            tag="section"
            direction="rows"
            gap={2}
            block
            class="prefs-info"
          >
            <Text tag="h2">Stats</Text>
            <Text tag="p" paragraph>
              You have <strong>{() => bookmarkCount()}</strong> bookmarked stories.
            </Text>
            <button
              type="button"
              class="btn-primary"
              onClick={() => {
                modalOpen.set(true)
                toast.info('Modal opened')
              }}
              data-testid="open-modal"
            >
              Show modal demo (Portal + Transition)
            </button>
            <span data-testid="modal-state">
              state: {() => (modalOpen() ? 'open' : 'closed')}
            </span>
          </Element>
        </Col>
      </Row>

      {/* Portal + Transition demo. The Portal mounts its children into
          document.body. The Transition manages the modal's mount/unmount
          animation using the `fade` preset's class names. We put
          Transition INSIDE Portal so Transition's element refs resolve
          inside the portaled subtree, not the page subtree (avoids a
          null-classList crash where Transition can't find the live el). */}
    </Container>

    {/* Modal rendered at component root (outside Container/coolgrid). Uses
        Transition for fade in/out via @pyreon/kinetic-presets `fade`. The
        Portal+coolgrid combination didn't propagate children correctly in
        this version of @pyreon/elements; flat in-flow render is the
        portable shape. */}
    <Transition
      show={() => modalOpen()}
      enterFrom={fade.enterFrom}
      enterTo={fade.enterTo}
      leaveFrom={fade.leaveFrom}
      leaveTo={fade.leaveTo}
    >
      <div
        class="prefs-modal-backdrop"
        data-testid="modal-backdrop"
        style="position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:1000;transition:opacity 200ms"
        onClick={() => modalOpen.set(false)}
      >
        <div
          class="prefs-modal"
          style="background:white;padding:24px;border-radius:8px;max-width:400px;box-shadow:0 4px 24px rgba(0,0,0,0.2)"
          onClick={(e: MouseEvent) => e.stopPropagation()}
        >
          <h2 style="margin-top:0">Modal demo</h2>
          <p>
            Animated with <code>{'<Transition>'}</code> + the{' '}
            <code>fade</code> preset from{' '}
            <code>@pyreon/kinetic-presets</code>.
          </p>
          <button
            type="button"
            class="btn-primary"
            onClick={() => modalOpen.set(false)}
            data-testid="close-modal"
          >
            Close
          </button>
        </div>
      </div>
    </Transition>
    </>
  )
}
