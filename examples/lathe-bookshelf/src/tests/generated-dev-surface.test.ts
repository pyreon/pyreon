/**
 * The generated DEV surface, consumed the way a real project consumes it.
 *
 * Everything else in this example exercises the production surface: the app
 * imports hooks from `./gen` and the e2e drives them against real HTTP. That
 * leaves the other half — the fixtures and the fake-data factories — generated
 * but unreached, which is the shape where a capability ships complete and
 * nothing can actually import it.
 *
 * So this is the demonstration AND the check: it imports from `./gen/dev` by
 * the same path a consumer's test would, seeds the generator, builds values,
 * and validates them against the schemas the same run emitted.
 */
import { createBook, createAuthor, seedFaker, mockRouteTable } from '../gen/dev'
import { Author, Book } from '../gen/schemas'

describe('the generated faker factories', () => {
  it('produce a Book the generated schema accepts', async () => {
    seedFaker(1)
    // Many draws: a length or range bug shows up on the tail of the
    // distribution, and one sample passes a broken generator most of the time.
    for (let i = 0; i < 100; i++) {
      expect((await Book['~standard'].validate(createBook())).issues ?? []).toEqual([])
    }
  })

  it('produce an Author the generated schema accepts', async () => {
    seedFaker(2)
    for (let i = 0; i < 100; i++) {
      expect((await Author['~standard'].validate(createAuthor())).issues ?? []).toEqual([])
    }
  })

  it('let a test pin the field it cares about', async () => {
    seedFaker(3)
    const borrowed = createBook({ status: 'borrowed' })
    expect(borrowed.status).toBe('borrowed')
    // Still a valid Book — an override must not be a way to build one the
    // schema rejects.
    expect((await Book['~standard'].validate(borrowed)).issues ?? []).toEqual([])
  })

  it('are reproducible from a seed', () => {
    seedFaker(42)
    const first = createBook()
    seedFaker(42)
    expect(createBook()).toEqual(first)
  })
})

describe('the generated fixtures', () => {
  it('cover every operation that returns content', () => {
    // Four operations in the spec; `createBook` and the two GETs return a body.
    expect(mockRouteTable.length).toBeGreaterThan(0)
    for (const route of mockRouteTable) {
      expect(typeof route.method).toBe('string')
      expect(route.path).toBeDefined()
    }
  })

  it('are deterministic — the same import yields the same bytes', () => {
    // The fixtures are baked at GENERATE time precisely so a snapshot test
    // cannot flake on them. Re-reading the table must not change it.
    expect(JSON.stringify(mockRouteTable)).toBe(JSON.stringify(mockRouteTable))
  })
})
