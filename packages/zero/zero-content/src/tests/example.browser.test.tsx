/**
 * <Example> browser tests — real Chromium via @vitest/browser.
 *
 * The Example component is the Pyreon-native docs DX primitive. These
 * tests lock in the load-bearing contracts that user-facing docs
 * pages rely on:
 *
 *  - Renders a `pyreon-example__loading` placeholder during async
 *    module resolution (no flicker of broken layout).
 *  - Mounts the resolved default export into the surface div.
 *  - When `share` prop is set, the loaded component receives the
 *    SAME signal instance across two `<Example>` calls — the
 *    cross-demo state-sharing contract that no MDX-flavor docs
 *    tool has.
 *  - When `share` is NOT set, each Example mounts with no shared
 *    prop (the local-signal fallback the example component owns).
 *  - When `file` is missing from the registry, renders a clear
 *    error message (not a silent blank).
 *  - When the loader resolves to a module with no default export,
 *    renders a clear error message (not a runtime crash).
 *
 * The cross-mount share test (`share="key"` flows reactively across
 * two Examples) is the contract that proves the entire design wins
 * — a user click in one example node updates the rendered output of
 * an entirely separate mounted example, in the same document, via
 * Pyreon's signal graph. No iframe, no postMessage, no string-blob.
 */
import { signal } from '@pyreon/reactivity'
import type { Signal } from '@pyreon/reactivity'
import type { ComponentFn } from '@pyreon/core'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Example } from '../components/Example'
import {
  _resetExampleRegistry,
  registerExamples,
} from '../components/example-registry'
import { clearAllSharedSignals } from '../components/shared-signal-registry'

// ── Test fixtures ──────────────────────────────────────────────────

interface SharedProps {
  shared?: Signal<number>
}

// A button example — increments `props.shared` (or its own signal).
const Counter: ComponentFn<SharedProps> = (props) => {
  const count = props.shared ?? signal(0)
  return (
    <div>
      <button
        class="counter-btn"
        type="button"
        onClick={() => count.update((n) => n + 1)}
      >
        bump
      </button>
      <span class="counter-value">{() => String(count())}</span>
    </div>
  )
}

// A read-only example — displays `props.shared`'s value. When two
// Examples share the same key, this one reactively reflects clicks
// in the Counter example.
const Readout: ComponentFn<SharedProps> = (props) => {
  const count = props.shared ?? signal(0)
  return (
    <div class="readout">
      latest: <strong>{() => String(count())}</strong>
    </div>
  )
}

// An example that throws on default-extract — used to verify the
// "no default export" error path.
const NoDefaultExample = { named: () => null }

beforeEach(() => {
  _resetExampleRegistry()
  clearAllSharedSignals()
  registerExamples({
    './examples/counter.tsx': async () => ({ default: Counter }),
    './examples/readout.tsx': async () => ({ default: Readout }),
    './examples/no-default.tsx': async () =>
      NoDefaultExample as unknown as { default: ComponentFn },
  })
})

afterEach(() => {
  _resetExampleRegistry()
  clearAllSharedSignals()
})

describe('<Example> browser — basic mount', () => {
  it('renders a loading placeholder before resolution', () => {
    const { container, unmount } = mountInBrowser(
      <Example file="./examples/counter" />,
    )
    expect(container.querySelector('.pyreon-example__loading')).toBeTruthy()
    expect(container.querySelector('.counter-btn')).toBeNull()
    unmount()
  })

  it('mounts the loaded component after the async import resolves', async () => {
    const { container, unmount } = mountInBrowser(
      <Example file="./examples/counter" />,
    )
    // Wait for onMount → loader → resolved component flip.
    await flush()
    await new Promise((r) => setTimeout(r, 10))
    await flush()
    expect(container.querySelector('.counter-btn')).toBeTruthy()
    expect(container.querySelector('.counter-value')?.textContent).toBe('0')
    expect(container.querySelector('.pyreon-example__loading')).toBeNull()
    unmount()
  })

  it('extension-less file path resolves to .tsx loader', async () => {
    const { container, unmount } = mountInBrowser(
      <Example file="./examples/counter" />,
    )
    await flush()
    await new Promise((r) => setTimeout(r, 10))
    await flush()
    expect(container.querySelector('.counter-btn')).toBeTruthy()
    unmount()
  })
})

describe('<Example> browser — error states', () => {
  it('renders a clear error when `file` is not registered', async () => {
    const { container, unmount } = mountInBrowser(
      <Example file="./examples/missing" />,
    )
    await flush()
    await new Promise((r) => setTimeout(r, 10))
    await flush()
    const err = container.querySelector('.pyreon-example__error')
    expect(err).toBeTruthy()
    expect(err?.textContent).toContain('missing')
    expect(err?.textContent).toContain('registerExamples')
    unmount()
  })

  it('renders a clear error when the resolved module has no default', async () => {
    const { container, unmount } = mountInBrowser(
      <Example file="./examples/no-default" />,
    )
    await flush()
    await new Promise((r) => setTimeout(r, 10))
    await flush()
    const err = container.querySelector('.pyreon-example__error')
    expect(err).toBeTruthy()
    expect(err?.textContent).toContain('no default export')
    unmount()
  })
})

describe('<Example> browser — share="key" — the cross-Example contract', () => {
  it('two Examples with the same share key receive the SAME signal', async () => {
    // Mount both into one container — the realistic page shape.
    const { container, unmount } = mountInBrowser(
      <div>
        <Example file="./examples/counter" share="cnt" />
        <Example file="./examples/readout" share="cnt" />
      </div>,
    )
    // Wait for both examples to load.
    await flush()
    await new Promise((r) => setTimeout(r, 20))
    await flush()

    expect(container.querySelector('.counter-btn')).toBeTruthy()
    expect(container.querySelector('.readout')).toBeTruthy()
    // Initial state: counter shows 0, readout shows 0.
    expect(container.querySelector('.counter-value')?.textContent).toBe('0')
    expect(
      container.querySelector('.readout strong')?.textContent,
    ).toBe('0')

    // The killer assertion: click the BUTTON in one Example, see the
    // READOUT in the OTHER Example react. Through the shared signal.
    const btn = container.querySelector<HTMLButtonElement>('.counter-btn')
    btn?.click()
    await flush()
    expect(container.querySelector('.counter-value')?.textContent).toBe('1')
    expect(
      container.querySelector('.readout strong')?.textContent,
    ).toBe('1')

    btn?.click()
    btn?.click()
    await flush()
    expect(container.querySelector('.counter-value')?.textContent).toBe('3')
    expect(
      container.querySelector('.readout strong')?.textContent,
    ).toBe('3')

    unmount()
  })

  it('different share keys do NOT cross — independent signals', async () => {
    const { container, unmount } = mountInBrowser(
      <div>
        <Example file="./examples/counter" share="a" />
        <Example file="./examples/readout" share="b" />
      </div>,
    )
    await flush()
    await new Promise((r) => setTimeout(r, 20))
    await flush()

    const btn = container.querySelector<HTMLButtonElement>('.counter-btn')
    btn?.click()
    btn?.click()
    await flush()
    expect(container.querySelector('.counter-value')?.textContent).toBe('2')
    // Readout uses key "b" — unchanged.
    expect(
      container.querySelector('.readout strong')?.textContent,
    ).toBe('0')

    unmount()
  })

  it('share key without explicit initial defaults to 0', async () => {
    const { container, unmount } = mountInBrowser(
      <Example file="./examples/readout" share="z" />,
    )
    await flush()
    await new Promise((r) => setTimeout(r, 20))
    await flush()
    expect(
      container.querySelector('.readout strong')?.textContent,
    ).toBe('0')
    unmount()
  })

  it('shareInitial sets a non-zero default for the first registration', async () => {
    const { container, unmount } = mountInBrowser(
      <Example
        file="./examples/readout"
        share="custom-init"
        shareInitial={42}
      />,
    )
    await flush()
    await new Promise((r) => setTimeout(r, 20))
    await flush()
    expect(
      container.querySelector('.readout strong')?.textContent,
    ).toBe('42')
    unmount()
  })

  it('no share prop = local signal — clicks in one Example do NOT affect another with no share', async () => {
    const { container, unmount } = mountInBrowser(
      <div>
        <Example file="./examples/counter" />
        <Example file="./examples/readout" />
      </div>,
    )
    await flush()
    await new Promise((r) => setTimeout(r, 20))
    await flush()
    const btn = container.querySelector<HTMLButtonElement>('.counter-btn')
    btn?.click()
    btn?.click()
    await flush()
    expect(container.querySelector('.counter-value')?.textContent).toBe('2')
    // Readout uses its own local signal — unaffected.
    expect(
      container.querySelector('.readout strong')?.textContent,
    ).toBe('0')
    unmount()
  })
})

describe('<Example> browser — chrome', () => {
  it('renders custom title when provided', async () => {
    const { container, unmount } = mountInBrowser(
      <Example file="./examples/counter" title="My Counter Demo" />,
    )
    await flush()
    await new Promise((r) => setTimeout(r, 20))
    await flush()
    const title = container.querySelector('.pyreon-example__title')
    expect(title?.textContent).toBe('My Counter Demo')
    unmount()
  })

  it('applies custom class to the outer wrapper when provided', async () => {
    const { container, unmount } = mountInBrowser(
      <Example file="./examples/counter" class="my-custom-class" />,
    )
    await flush()
    expect(container.querySelector('.my-custom-class')).toBeTruthy()
    unmount()
  })
})
