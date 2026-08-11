import {
  describeStep,
  emptyTimeline,
  hotKeys,
  isLive,
  MAX_STEPS,
  record,
  seek,
  stateAt,
  stepBack,
  stepForward,
  type StoreStep,
} from '../store-timeline'

const write = (key: string, newValue: unknown, storeId = 'cart'): Omit<StoreStep, 'index'> => ({
  storeId,
  type: 'direct',
  changes: [{ key, oldValue: undefined, newValue }],
  state: { [key]: newValue },
})

describe('record', () => {
  it('appends a step and follows the tail', () => {
    const t = record(record(emptyTimeline(), write('a', 1)), write('b', 2))
    expect(t.steps).toHaveLength(2)
    expect(t.cursor).toBe(1)
    expect(isLive(t)).toBe(true)
  })

  it('does NOT yank the cursor when the viewer has stepped back', () => {
    // The property that makes the panel usable on a component that writes on a
    // timer: inspecting step 0 must not jump to the end on the next write.
    let t = record(record(emptyTimeline(), write('a', 1)), write('b', 2))
    t = stepBack(t)
    expect(t.cursor).toBe(0)
    t = record(t, write('c', 3))
    expect(t.cursor).toBe(0)
    expect(t.steps).toHaveLength(3)
    expect(isLive(t)).toBe(false)
  })

  it('bounds the timeline, trimming from the FRONT', () => {
    // A debugging aid, not a log — a write-in-a-loop interaction would grow it
    // for the life of the session.
    let t = emptyTimeline()
    for (let i = 0; i < MAX_STEPS + 25; i += 1) t = record(t, write(`k${i}`, i))
    expect(t.steps).toHaveLength(MAX_STEPS)
    // The OLDEST are gone, the newest kept.
    expect(t.steps.at(-1)?.changes[0]?.key).toBe(`k${MAX_STEPS + 24}`)
  })

  it('renumbers after trimming so index always equals array position', () => {
    // A step whose `index` disagrees with its slot is a bug generator for any
    // consumer that uses one to look up the other.
    let t = emptyTimeline()
    for (let i = 0; i < MAX_STEPS + 5; i += 1) t = record(t, write(`k${i}`, i))
    expect(t.steps.every((s, i) => s.index === i)).toBe(true)
  })

  it('keeps a stepped-back cursor pointing at the SAME write after a trim', () => {
    // Trimming shifts every index down; a cursor left alone would silently
    // start describing a different step than the one being looked at.
    let t = emptyTimeline()
    for (let i = 0; i < MAX_STEPS; i += 1) t = record(t, write(`k${i}`, i))
    t = seek(t, 10)
    const watched = t.steps[t.cursor]?.changes[0]?.key
    t = record(t, write('new', 1))
    expect(t.steps[t.cursor]?.changes[0]?.key).toBe(watched)
  })
})

describe('seek / stepBack / stepForward', () => {
  const three = ['a', 'b', 'c'].reduce((t, k) => record(t, write(k, k)), emptyTimeline())

  it('clamps at both ends rather than going out of range', () => {
    expect(seek(three, -5).cursor).toBe(0)
    expect(seek(three, 99).cursor).toBe(2)
  })

  it('steps back and forward', () => {
    expect(stepBack(three).cursor).toBe(1)
    expect(stepForward(stepBack(three)).cursor).toBe(2)
  })

  it('is a no-op on an empty timeline', () => {
    const empty = emptyTimeline()
    expect(stepBack(empty)).toBe(empty)
    expect(seek(empty, 3)).toBe(empty)
  })

  it('returns the SAME object when nothing moved', () => {
    // The panel re-renders on identity change; a new object per no-op seek
    // would repaint on every keypress that does not move the cursor.
    expect(seek(three, 2)).toBe(three)
  })
})

describe('stateAt', () => {
  it('returns the selected step state, not the newest', () => {
    // The whole point of time travel: the panel renders what the store looked
    // like THEN.
    let t = record(emptyTimeline(), { ...write('count', 1), state: { count: 1 } })
    t = record(t, { ...write('count', 2), state: { count: 2 } })
    expect(stateAt(t)).toEqual({ count: 2 })
    expect(stateAt(stepBack(t))).toEqual({ count: 1 })
  })

  it('is undefined before anything was recorded', () => {
    expect(stateAt(emptyTimeline())).toBeUndefined()
  })
})

describe('describeStep', () => {
  it('names the keys, not the values', () => {
    // A value can be an object of any size; the key is what says whether this
    // is the write you were looking for.
    const step: StoreStep = {
      index: 0,
      storeId: 'cart',
      type: 'patch',
      changes: [{ key: 'items', oldValue: [], newValue: [{ huge: 'object' }] }],
      state: {},
    }
    expect(describeStep(step)).toBe('cart · patch items')
  })

  it('distinguishes a patch from a direct set', () => {
    expect(describeStep({ ...base(), type: 'direct' })).toContain('set')
    expect(describeStep({ ...base(), type: 'patch' })).toContain('patch')
  })

  it('summarises a wide patch instead of listing every key', () => {
    const step: StoreStep = {
      ...base(),
      type: 'patch',
      changes: ['a', 'b', 'c', 'd', 'e'].map((key) => ({ key, oldValue: 0, newValue: 1 })),
    }
    expect(describeStep(step)).toBe('cart · patch a, b, c +2 more')
  })

  it('says so when a write changed nothing', () => {
    expect(describeStep({ ...base(), changes: [] })).toContain('no keys changed')
  })

  function base(): StoreStep {
    return { index: 0, storeId: 'cart', type: 'direct', changes: [{ key: 'x', oldValue: 0, newValue: 1 }], state: {} }
  }
})

describe('hotKeys', () => {
  it('reports keys written more than once, most-written first', () => {
    let t = emptyTimeline()
    for (const k of ['a', 'b', 'a', 'a', 'b', 'c']) t = record(t, write(k, 1))
    expect(hotKeys(t)).toEqual([
      { key: 'a', writes: 3 },
      { key: 'b', writes: 2 },
    ])
  })

  it('excludes keys written once — that is not thrashing', () => {
    const t = record(emptyTimeline(), write('a', 1))
    expect(hotKeys(t)).toEqual([])
  })

  it('counts every key of a multi-key patch', () => {
    const patch = (keys: string[]): Omit<StoreStep, 'index'> => ({
      storeId: 'cart',
      type: 'patch',
      changes: keys.map((key) => ({ key, oldValue: 0, newValue: 1 })),
      state: {},
    })
    const t = record(record(emptyTimeline(), patch(['a', 'b'])), patch(['b']))
    expect(hotKeys(t)).toEqual([{ key: 'b', writes: 2 }])
  })
})
