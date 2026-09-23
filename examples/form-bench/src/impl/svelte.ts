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
import {
  expectDirtyDom,
  expectEmailError,
  expectLibraryValue,
  expectResetDom,
  fieldInputCount,
  setInput,
} from '../dom'
import { bench, settle, type BenchSuite } from '../runner'
import { FIELD_NAMES, validValues } from '../../shared/schema'
import FormBench from './FormBench.svelte'

interface SvelteExports {
  resetForm: () => void
  setField: (name: string, value: string) => void
  getValue: (name: string) => unknown
  touch: (name: string) => void
}
interface Mounted {
  api: SvelteExports
  dispose: () => void
}

function mountForm(container: HTMLElement): Mounted {
  const instance = mount(FormBench, { target: container })
  // Run mount effects now (the `use:form` action registers the inputs and
  // resets Felte's stores when it mounts). Inside `mount-12-fields` this is the
  // same work the `commit` hook would do; elsewhere it is untimed setup.
  flushSync()
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
    const { api, dispose } = mountForm(container)
    const input = container.querySelector('input[data-field="email"]') as HTMLInputElement
    await bench('keystroke-blur', suite, () => {
      // Commit PER keystroke, like every other column (a real user's keystrokes are
      // separate tasks). Committing once after all 12 let the scheduler coalesce
      // 12 renders into 1 — work no other column was allowed to skip.
      for (let i = 1; i <= TYPED.length; i++) {
        setInput(input, TYPED.slice(0, i))
        flushSync()
      }
    }, {
      reset: async () => {
        setInput(input, '')
        await settle()
      },
      commit,
      verify: () => expectLibraryValue('keystroke-blur', api.getValue('email'), TYPED),
    })
    dispose()
  }

  // ── keystroke-change (same Felte default; see NOTE) ──────────────────────
  {
    const { api, dispose } = mountForm(container)
    const input = container.querySelector('input[data-field="email"]') as HTMLInputElement
    // Felte renders an error only for a TOUCHED field (touched is set on blur),
    // so without this it validates per keystroke but renders nothing — one
    // fewer DOM write per run than every other column. Touch it (untimed).
    api.touch('email')
    flushSync()
    await bench('keystroke-change', suite, async () => {
      // One keystroke = dispatch, commit, then let its async validation settle
      // (see runner.ts `settle`) — identical in every column.
      for (let i = 1; i <= TYPED.length; i++) {
        setInput(input, TYPED.slice(0, i))
        flushSync()
        await settle()
      }
    }, {
      reset: async () => {
        setInput(input, '')
        await settle()
      },
      commit,
      verify: (c) => {
        expectLibraryValue('keystroke-change', api.getValue('email'), TYPED)
        expectEmailError(c)
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
      reset: async () => {
        const dirty = validValues()
        for (const name of FIELD_NAMES) api.setField(name, dirty[name])
        flushSync()
        await settle()
        expectDirtyDom(container, dirty)
      },
      commit,
      verify: expectResetDom,
    })
    dispose()
  }

  return suite
}
