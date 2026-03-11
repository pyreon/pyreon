import { batch } from "../batch"
import { effect } from "../effect"
import { signal } from "../signal"

describe("batch", () => {
  test("defers notifications until end of batch", () => {
    const a = signal(1)
    const b = signal(2)
    let runs = 0
    effect(() => {
      a()
      b()
      runs++
    })
    expect(runs).toBe(1) // initial run

    batch(() => {
      a.set(10)
      b.set(20)
    })
    // should only re-run once despite two updates
    expect(runs).toBe(2)
  })

  test("effect sees final values after batch", () => {
    const s = signal(0)
    let seen = 0
    effect(() => {
      seen = s()
    })
    batch(() => {
      s.set(1)
      s.set(2)
      s.set(3)
    })
    expect(seen).toBe(3)
  })

  test("nested batches flush at outermost end", () => {
    const s = signal(0)
    let runs = 0
    effect(() => {
      s()
      runs++
    })
    expect(runs).toBe(1)

    batch(() => {
      batch(() => {
        s.set(1)
        s.set(2)
      })
      s.set(3)
    })
    expect(runs).toBe(2)
  })
})
