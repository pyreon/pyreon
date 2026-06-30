/**
 * React Hook Form impl — idiomatic RHF (uncontrolled `register` + zodResolver).
 *
 * RHF is the React performance king and the toughest peer: uncontrolled inputs
 * mean ~0 re-renders on the keystroke path, so this is exactly where a naïve
 * bench would flatter Pyreon. We measure it honestly — RHF's real per-keystroke
 * cost is its onChange ref-write + subscription bookkeeping (blur mode) and the
 * resolver run + field re-render (change mode).
 *
 * Built with `React.createElement` (no JSX) — same approach examples/benchmark
 * uses for its React entry — so there is no jsxImportSource conflict with the
 * Pyreon impl in the same Vite project.
 *
 * Commit boundary: `flushSync` wraps the user action so React commits
 * synchronously INSIDE the timed region (the DOM-bench's tightest-commit fix).
 * This is CPU-objective, not RHF's default async path — documented in
 * METHODOLOGY.md.
 */
import { zodResolver } from '@hookform/resolvers/zod'
import * as React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { useForm, type UseFormReturn } from 'react-hook-form'
import { setInput, fieldInputCount, visibleErrorCount } from '../dom'
import { bench, type BenchSuite } from '../runner'
import { FIELD_NAMES, emptyValues, formSchema, type FormValues } from '../../shared/schema'

// We drive commits via flushSync, the correct bench primitive — suppress
// React 19's "update not wrapped in act(...)" warning.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false

const rc = React.createElement
type Methods = UseFormReturn<FormValues>
type Mode = 'onBlur' | 'onChange' | 'onSubmit'

/** A 12-keystroke word typed per timed keystroke run — matches the Pyreon
 *  impl so both columns do identical work above the ~100µs timer floor. */
const TYPED = 'abcdefghijkl'

function FormImpl({ mode, onReady }: { mode: Mode; onReady: (m: Methods) => void }) {
  const methods = useForm<FormValues>({
    defaultValues: emptyValues(),
    resolver: zodResolver(formSchema),
    mode,
  })
  onReady(methods)
  const { register, formState } = methods
  const errors = formState.errors as Record<string, { message?: string } | undefined>
  return rc(
    'form',
    null,
    FIELD_NAMES.map((name) =>
      rc(
        'div',
        { key: name },
        rc('input', { 'data-field': name, ...register(name) }),
        rc('span', { 'data-error': name }, errors[name]?.message ?? ''),
      ),
    ),
  )
}

interface Mounted {
  methods: Methods
  root: Root
  dispose: () => void
}

function mountForm(container: HTMLElement, mode: Mode): Mounted {
  let captured: Methods | undefined
  const root = createRoot(container)
  flushSync(() => {
    root.render(rc(FormImpl, { mode, onReady: (m) => (captured = m) }))
  })
  return {
    methods: captured as Methods,
    root,
    dispose: () => {
      root.unmount()
      container.innerHTML = ''
    },
  }
}

export async function runRhf(container: HTMLElement): Promise<BenchSuite> {
  const suite: BenchSuite = { framework: 'React Hook Form', container, results: [] }

  // ── Scenario: mount-12-fields (fresh root each timed run) ────────────────
  {
    // 1-element stack — reset unmounts the prior root before fn mounts a
    // fresh one (real cold mount per run). Array access sidesteps the
    // closure-reassigned-`let` narrowing quirk in tsc.
    const live: Mounted[] = []
    await bench('mount-12-fields', suite, () => {
      live.push(mountForm(container, 'onBlur'))
    }, {
      reset: () => {
        live.pop()?.dispose()
      },
      verify: (c) => {
        if (fieldInputCount(c) !== 12) throw new Error(`mount: expected 12 inputs, got ${fieldInputCount(c)}`)
      },
    })
    live.pop()?.dispose()
  }

  // ── Scenario: keystroke-blur (no per-keystroke validation) ───────────────
  // Type a whole word per timed run, one flushSync per keystroke (each
  // keystroke is a discrete commit, matching Pyreon's per-keystroke patch),
  // so the per-run work clears Chromium's ~100µs performance.now() floor.
  {
    const { dispose } = mountForm(container, 'onBlur')
    const input = container.querySelector('input[data-field="email"]') as HTMLInputElement
    await bench('keystroke-blur', suite, () => {
      for (let i = 1; i <= TYPED.length; i++) flushSync(() => setInput(input, TYPED.slice(0, i)))
    }, {
      reset: () => flushSync(() => setInput(input, '')),
      verify: () => {
        if (input.value !== TYPED) throw new Error('keystroke-blur: value not committed')
      },
    })
    dispose()
  }

  // ── Scenario: keystroke-change (validate every keystroke) ────────────────
  {
    const { dispose } = mountForm(container, 'onChange')
    const input = container.querySelector('input[data-field="email"]') as HTMLInputElement
    await bench('keystroke-change', suite, () => {
      for (let i = 1; i <= TYPED.length; i++) flushSync(() => setInput(input, TYPED.slice(0, i)))
    }, {
      reset: () => flushSync(() => setInput(input, '')),
      verify: () => {
        if (input.value !== TYPED) throw new Error('keystroke-change: value not committed')
      },
    })
    dispose()
  }

  // ── Scenario: reset-dirty-form ───────────────────────────────────────────
  {
    const { methods, dispose } = mountForm(container, 'onBlur')
    await bench('reset-dirty-form', suite, () => {
      flushSync(() => methods.reset())
    }, {
      reset: () =>
        flushSync(() => {
          for (const name of FIELD_NAMES) {
            const el = container.querySelector(`input[data-field="${name}"]`) as HTMLInputElement
            setInput(el, 'dirty')
          }
        }),
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
