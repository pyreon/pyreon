/**
 * Svelte 5 impl — idiomatic Felte, driven through `FormBench.svelte`.
 *
 * The `.svelte` component is compiled by `@sveltejs/vite-plugin-svelte` (the
 * one extra compiler in the Vite config; it coexists with Pyreon's transform
 * because no other impl uses JSX). Felte is uncontrolled (`use:form` action),
 * so a keystroke updates the input natively + Felte records it; commit boundary
 * is Svelte 5's synchronous `flushSync()`.
 *
 * NOTE Felte validates on input + blur by default with no per-mode toggle, so
 * keystroke-blur and keystroke-change measure the same Felte behavior (its
 * eager default) — documented as the "note if not supported" fairness case.
 */
import { flushSync, mount, unmount } from 'svelte'
import { setInput, fieldInputCount, visibleErrorCount } from '../dom'
import { bench, type BenchSuite } from '../runner'
import { FIELD_NAMES } from '../../shared/schema'
import FormBench from './FormBench.svelte'

interface SvelteExports {
  resetForm: () => void
  setField: (name: string, value: string) => void
}
interface Mounted {
  api: SvelteExports
  dispose: () => void
}

function mountForm(container: HTMLElement): Mounted {
  const instance = mount(FormBench, { target: container })
  return {
    api: instance as unknown as SvelteExports,
    dispose: () => {
      void unmount(instance)
      container.innerHTML = ''
    },
  }
}

const TYPED = 'abcdefghijkl'
const commit = () => flushSync()

export async function runSvelte(container: HTMLElement): Promise<BenchSuite> {
  const suite: BenchSuite = { framework: 'Svelte (Felte)', container, results: [] }

  // ── mount-12-fields ──────────────────────────────────────────────────────
  {
    const live: Mounted[] = []
    await bench('mount-12-fields', suite, () => {
      live.push(mountForm(container))
    }, {
      reset: () => {
        live.pop()?.dispose()
      },
      commit,
      verify: (c) => {
        if (fieldInputCount(c) !== 12) throw new Error(`mount: expected 12 inputs, got ${fieldInputCount(c)}`)
      },
    })
    live.pop()?.dispose()
  }

  // ── keystroke-blur (Felte default validation timing) ─────────────────────
  {
    const { dispose } = mountForm(container)
    const input = container.querySelector('input[data-field="email"]') as HTMLInputElement
    await bench('keystroke-blur', suite, () => {
      for (let i = 1; i <= TYPED.length; i++) setInput(input, TYPED.slice(0, i))
    }, {
      reset: () => setInput(input, ''),
      commit,
      verify: () => {
        if (input.value !== TYPED) throw new Error('keystroke-blur: value not committed')
      },
    })
    dispose()
  }

  // ── keystroke-change (same Felte default; see NOTE) ──────────────────────
  {
    const { dispose } = mountForm(container)
    const input = container.querySelector('input[data-field="email"]') as HTMLInputElement
    await bench('keystroke-change', suite, () => {
      for (let i = 1; i <= TYPED.length; i++) setInput(input, TYPED.slice(0, i))
    }, {
      reset: () => setInput(input, ''),
      commit,
      verify: () => {
        if (input.value !== TYPED) throw new Error('keystroke-change: value not committed')
      },
    })
    dispose()
  }

  // ── reset-dirty-form ─────────────────────────────────────────────────────
  {
    const { api, dispose } = mountForm(container)
    await bench('reset-dirty-form', suite, () => {
      api.resetForm()
    }, {
      reset: () => {
        for (const name of FIELD_NAMES) api.setField(name, 'dirty')
        flushSync()
      },
      commit,
      verify: () => {
        const first = container.querySelector('input[data-field="first"]') as HTMLInputElement
        if (first.value !== '') throw new Error('reset: form not reset')
        if (visibleErrorCount(container) !== 0) throw new Error('reset: errors not cleared')
      },
    })
    dispose()
  }

  return suite
}
