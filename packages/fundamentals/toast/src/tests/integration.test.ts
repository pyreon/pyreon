import { _pauseAll, _reset, _resumeAll, _toasts, toast } from '../toast'

/** Helper — get toast at index with assertion. */
function at(index: number) {
  const t = _toasts()[index]
  if (!t) throw new Error(`No toast at index ${index}`)
  return t
}

beforeEach(() => {
  _reset()
})

afterEach(() => {
  _reset()
})

// ─── toast() creates entries ────────────────────────────────────────────────

describe('toast() creates toast entries', () => {
  it('creates a toast with the given message', () => {
    toast('Hello world')
    expect(_toasts().length).toBe(1)
    expect(at(0).message).toBe('Hello world')
  })

  it('returns a unique string id', () => {
    const id1 = toast('First')
    const id2 = toast('Second')
    expect(typeof id1).toBe('string')
    expect(typeof id2).toBe('string')
    expect(id1).not.toBe(id2)
  })

  it('creates multiple toasts in order', () => {
    toast('A')
    toast('B')
    toast('C')
    expect(_toasts().length).toBe(3)
    expect(at(0).message).toBe('A')
    expect(at(1).message).toBe('B')
    expect(at(2).message).toBe('C')
  })

  it('defaults to type info, duration 4000, dismissible true', () => {
    toast('Default')
    const t = at(0)
    expect(t.type).toBe('info')
    expect(t.duration).toBe(4000)
    expect(t.dismissible).toBe(true)
  })

  it('starts in entering state', () => {
    toast('Entering')
    expect(at(0).state).toBe('entering')
  })

  it('accepts custom options', () => {
    toast('Custom', {
      type: 'error',
      duration: 10000,
      dismissible: false,
    })
    const t = at(0)
    expect(t.type).toBe('error')
    expect(t.duration).toBe(10000)
    expect(t.dismissible).toBe(false)
  })

  it('accepts action option', () => {
    const onClick = vi.fn()
    toast('With action', {
      action: { label: 'Undo', onClick },
    })
    const t = at(0)
    expect(t.action).toBeDefined()
    expect(t.action!.label).toBe('Undo')
    t.action!.onClick()
    expect(onClick).toHaveBeenCalledOnce()
  })
})

// ─── toast.success/error/warning/info variants ─────────────────────────────

describe('toast variant shortcuts', () => {
  it('toast.success sets type to success', () => {
    toast.success('Saved')
    expect(at(0).type).toBe('success')
    expect(at(0).message).toBe('Saved')
  })

  it('toast.error sets type to error', () => {
    toast.error('Failed')
    expect(at(0).type).toBe('error')
  })

  it('toast.warning sets type to warning', () => {
    toast.warning('Careful')
    expect(at(0).type).toBe('warning')
  })

  it('toast.info sets type to info', () => {
    toast.info('FYI')
    expect(at(0).type).toBe('info')
  })

  it('variant shortcuts accept options', () => {
    toast.success('Done', { duration: 2000, dismissible: false })
    expect(at(0).duration).toBe(2000)
    expect(at(0).dismissible).toBe(false)
  })
})

// ─── toast.loading ──────────────────────────────────────────────────────────

describe('toast.loading', () => {
  it('creates a persistent toast (duration 0)', () => {
    vi.useFakeTimers()
    toast.loading('Loading...')

    expect(at(0).type).toBe('info')
    expect(at(0).duration).toBe(0)

    vi.advanceTimersByTime(30000)
    expect(_toasts().length).toBe(1)

    vi.useRealTimers()
  })

  it('returns an id for later dismiss/update', () => {
    const id = toast.loading('Please wait')
    expect(typeof id).toBe('string')
    expect(_toasts().length).toBe(1)

    toast.dismiss(id)
    expect(_toasts().length).toBe(0)
  })
})

// ─── toast.dismiss ──────────────────────────────────────────────────────────

describe('toast.dismiss', () => {
  it('removes a specific toast by id', () => {
    const id1 = toast('First')
    toast('Second')
    expect(_toasts().length).toBe(2)

    toast.dismiss(id1)
    expect(_toasts().length).toBe(1)
    expect(at(0).message).toBe('Second')
  })

  it('clears all toasts when no id given', () => {
    toast('A')
    toast('B')
    toast('C')
    toast.dismiss()
    expect(_toasts().length).toBe(0)
  })

  it('is a no-op for unknown id', () => {
    toast('Hello')
    toast.dismiss('nonexistent')
    expect(_toasts().length).toBe(1)
  })

  it('calls onDismiss callback when dismissing by id', () => {
    const onDismiss = vi.fn()
    const id = toast('Hello', { onDismiss })
    toast.dismiss(id)
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('calls onDismiss for all toasts when dismissing all', () => {
    const cb1 = vi.fn()
    const cb2 = vi.fn()
    toast('A', { onDismiss: cb1 })
    toast('B', { onDismiss: cb2 })
    toast.dismiss()
    expect(cb1).toHaveBeenCalledOnce()
    expect(cb2).toHaveBeenCalledOnce()
  })

  it('clears timer when dismissing by id', () => {
    vi.useFakeTimers()
    const onDismiss = vi.fn()
    const id = toast('Hello', { onDismiss, duration: 5000 })
    toast.dismiss(id)
    expect(onDismiss).toHaveBeenCalledOnce()

    // Timer should have been cleared — no double call
    vi.advanceTimersByTime(5000)
    expect(onDismiss).toHaveBeenCalledOnce()
    vi.useRealTimers()
  })
})

// ─── toast.update ───────────────────────────────────────────────────────────

describe('toast.update', () => {
  it('updates message', () => {
    const id = toast('Original')
    toast.update(id, { message: 'Updated' })
    expect(at(0).message).toBe('Updated')
  })

  it('updates type', () => {
    const id = toast('Hello')
    toast.update(id, { type: 'success' })
    expect(at(0).type).toBe('success')
  })

  it('updates duration and restarts timer', () => {
    vi.useFakeTimers()
    const id = toast('Hello', { duration: 0 })

    toast.update(id, { duration: 2000 })
    expect(at(0).duration).toBe(2000)

    vi.advanceTimersByTime(2000)
    expect(_toasts().length).toBe(0)
    vi.useRealTimers()
  })

  it('updates multiple fields at once', () => {
    const id = toast('Loading', { duration: 0 })
    toast.update(id, { message: 'Done!', type: 'success', duration: 3000 })

    expect(at(0).message).toBe('Done!')
    expect(at(0).type).toBe('success')
    expect(at(0).duration).toBe(3000)
  })

  it('is a no-op for unknown id', () => {
    toast('Hello')
    toast.update('nonexistent', { message: 'Nope' })
    expect(at(0).message).toBe('Hello')
  })

  it('clears old timer when updating', () => {
    vi.useFakeTimers()
    const id = toast('Hello', { duration: 1000 })

    vi.advanceTimersByTime(500)
    toast.update(id, { message: 'Updated' })

    // Old timer would fire at 1000ms, but update reset it
    vi.advanceTimersByTime(500)
    expect(_toasts().length).toBe(1)

    // New timer fires at 1000ms from update
    vi.advanceTimersByTime(500)
    expect(_toasts().length).toBe(0)
    vi.useRealTimers()
  })
})

// ─── toast.promise ──────────────────────────────────────────────────────────

describe('toast.promise', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('creates a loading toast that transitions to success on resolve', async () => {
    const promise = Promise.resolve('data')

    toast.promise(promise, {
      loading: 'Loading...',
      success: 'Done!',
      error: 'Failed',
    })

    expect(_toasts().length).toBe(1)
    expect(at(0).message).toBe('Loading...')
    expect(at(0).type).toBe('info')
    expect(at(0).duration).toBe(0)

    await promise
    await vi.advanceTimersByTimeAsync(0)

    expect(at(0).message).toBe('Done!')
    expect(at(0).type).toBe('success')
    expect(at(0).duration).toBe(4000)
  })

  it('transitions to error on reject', async () => {
    const promise = Promise.reject(new Error('oops'))

    toast
      .promise(promise, {
        loading: 'Loading...',
        success: 'Done!',
        error: 'Failed',
      })
      .catch(() => {})

    try {
      await promise
    } catch {
      // expected
    }
    await vi.advanceTimersByTimeAsync(0)

    expect(at(0).message).toBe('Failed')
    expect(at(0).type).toBe('error')
  })

  it('supports function form for success message', async () => {
    const promise = Promise.resolve(42)

    toast.promise(promise, {
      loading: 'Calculating...',
      success: (data) => `Result: ${data}`,
      error: 'Failed',
    })

    await promise
    await vi.advanceTimersByTimeAsync(0)

    expect(at(0).message).toBe('Result: 42')
  })

  it('supports function form for error message', async () => {
    const err = new Error('network failure')
    const promise = Promise.reject(err)

    toast
      .promise(promise, {
        loading: 'Saving...',
        success: 'Saved!',
        error: (e: unknown) => `Failed: ${(e as Error).message}`,
      })
      .catch(() => {})

    try {
      await promise
    } catch {
      // expected
    }
    await vi.advanceTimersByTimeAsync(0)

    expect(at(0).message).toBe('Failed: network failure')
  })

  it('returns the original promise', async () => {
    const promise = Promise.resolve('value')
    const result = toast.promise(promise, {
      loading: 'Loading...',
      success: 'Done!',
      error: 'Failed',
    })

    expect(await result).toBe('value')
  })

  it('success toast auto-dismisses after default duration', async () => {
    const promise = Promise.resolve('ok')

    toast.promise(promise, {
      loading: 'Loading...',
      success: 'Done!',
      error: 'Failed',
    })

    await promise
    await vi.advanceTimersByTimeAsync(0)

    expect(at(0).duration).toBe(4000)
    vi.advanceTimersByTime(4000)
    expect(_toasts().length).toBe(0)
  })

  it('error toast auto-dismisses after default duration', async () => {
    const promise = Promise.reject(new Error('fail'))

    toast
      .promise(promise, {
        loading: 'Loading...',
        success: 'Done!',
        error: 'Failed',
      })
      .catch(() => {})

    try {
      await promise
    } catch {
      // expected
    }
    await vi.advanceTimersByTimeAsync(0)

    vi.advanceTimersByTime(4000)
    expect(_toasts().length).toBe(0)
  })
})

// ─── Auto-dismiss with timeout ──────────────────────────────────────────────

describe('auto-dismiss timing', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('auto-dismisses after default 4000ms', () => {
    toast('Hello')
    vi.advanceTimersByTime(3999)
    expect(_toasts().length).toBe(1)
    vi.advanceTimersByTime(1)
    expect(_toasts().length).toBe(0)
  })

  it('auto-dismisses after custom duration', () => {
    toast('Quick', { duration: 1000 })
    vi.advanceTimersByTime(1000)
    expect(_toasts().length).toBe(0)
  })

  it('does not auto-dismiss when duration is 0', () => {
    toast('Persistent', { duration: 0 })
    vi.advanceTimersByTime(60000)
    expect(_toasts().length).toBe(1)
  })

  it('calls onDismiss on auto-dismiss', () => {
    const onDismiss = vi.fn()
    toast('Hello', { onDismiss, duration: 2000 })
    vi.advanceTimersByTime(2000)
    expect(onDismiss).toHaveBeenCalledOnce()
  })
})

// ─── Pause/resume (hover behavior) ─────────────────────────────────────────

describe('pause and resume', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('_pauseAll stops all timers', () => {
    toast('A', { duration: 4000 })
    toast('B', { duration: 4000 })

    vi.advanceTimersByTime(2000)
    _pauseAll()

    vi.advanceTimersByTime(10000)
    expect(_toasts().length).toBe(2)
  })

  it('_resumeAll restarts with remaining time', () => {
    toast('Hello', { duration: 4000 })

    vi.advanceTimersByTime(3000) // 1000ms remaining
    _pauseAll()

    vi.advanceTimersByTime(5000) // paused
    expect(_toasts().length).toBe(1)

    _resumeAll()
    vi.advanceTimersByTime(999)
    expect(_toasts().length).toBe(1)

    vi.advanceTimersByTime(1)
    expect(_toasts().length).toBe(0)
  })

  it('_pauseAll is a no-op for persistent toasts', () => {
    toast('Persistent', { duration: 0 })
    _pauseAll()
    _resumeAll()
    vi.advanceTimersByTime(10000)
    expect(_toasts().length).toBe(1)
  })

  it('_resumeAll is safe to call without prior pause', () => {
    toast('Hello', { duration: 4000 })
    _resumeAll()
    vi.advanceTimersByTime(4000)
    expect(_toasts().length).toBe(0)
  })
})

// ─── Multiple toasts and unique IDs ─────────────────────────────────────────

describe('multiple toasts', () => {
  it('each toast gets a unique id', () => {
    const ids = new Set<string>()
    for (let i = 0; i < 20; i++) {
      ids.add(toast(`Toast ${i}`, { duration: 0 }))
    }
    expect(ids.size).toBe(20)
  })

  it('toasts accumulate in _toasts signal', () => {
    for (let i = 0; i < 10; i++) {
      toast(`Toast ${i}`, { duration: 0 })
    }
    expect(_toasts().length).toBe(10)
  })

  it('dismissing one does not affect others', () => {
    const id1 = toast('A', { duration: 0 })
    const id2 = toast('B', { duration: 0 })
    toast('C', { duration: 0 })

    toast.dismiss(id1)
    expect(_toasts().length).toBe(2)

    toast.dismiss(id2)
    expect(_toasts().length).toBe(1)
    expect(at(0).message).toBe('C')
  })
})

// ─── _reset test utility ────────────────────────────────────────────────────

describe('_reset utility', () => {
  it('clears all toasts and resets id counter', () => {
    vi.useFakeTimers()
    toast('A', { duration: 5000 })
    toast('B', { duration: 5000 })

    _reset()
    expect(_toasts().length).toBe(0)

    // New toast after reset should still work
    const id = toast('After reset')
    expect(typeof id).toBe('string')
    expect(_toasts().length).toBe(1)

    vi.useRealTimers()
  })
})
