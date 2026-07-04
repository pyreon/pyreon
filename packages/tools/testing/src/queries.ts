/**
 * DOM query engine — the Testing-Library `getBy*` / `queryBy*` / `getAllBy*` /
 * `findBy*` family. PR1 ships the Text + TestId query kinds; Role / LabelText /
 * Placeholder / DisplayValue land in PR2 alongside `fireEvent` + `waitFor`.
 *
 * Each "kind" (Text, TestId, …) is defined once as a predicate over an
 * element; `makeQueries` derives the six standard variants from it so the
 * behavior (throw-on-missing, throw-on-multiple, null-on-missing, async
 * retry) is uniform and defined in one place.
 */

export type TextMatch = string | RegExp | ((content: string, element: Element) => boolean)

function matchText(match: TextMatch, content: string, element: Element): boolean {
  if (typeof match === 'string') return content === match
  if (match instanceof RegExp) return match.test(content)
  return match(content, element)
}

/** Normalized text content — collapsed whitespace, trimmed (TL default). */
function textOf(el: Element): string {
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim()
}

// ── the six variants derived from one predicate ───────────────────────────

interface QuerySet<Arg> {
  getBy: (arg: Arg) => HTMLElement
  queryBy: (arg: Arg) => HTMLElement | null
  getAllBy: (arg: Arg) => HTMLElement[]
  queryAllBy: (arg: Arg) => HTMLElement[]
  findBy: (arg: Arg, opts?: WaitOptions) => Promise<HTMLElement>
  findAllBy: (arg: Arg, opts?: WaitOptions) => Promise<HTMLElement[]>
}

interface WaitOptions {
  timeout?: number
  interval?: number
}

function makeQueries<Arg>(
  root: () => ParentNode,
  kind: string,
  findAll: (root: ParentNode, arg: Arg) => HTMLElement[],
  describe: (arg: Arg) => string,
): QuerySet<Arg> {
  const queryAllBy = (arg: Arg) => findAll(root(), arg)
  const queryBy = (arg: Arg) => {
    const all = queryAllBy(arg)
    if (all.length > 1)
      throw new Error(
        `Found multiple elements by ${kind} ${describe(arg)} (${all.length}). Use getAllBy${kind}.`,
      )
    return all[0] ?? null
  }
  const getAllBy = (arg: Arg) => {
    const all = queryAllBy(arg)
    if (all.length === 0)
      throw new Error(`Unable to find an element by ${kind} ${describe(arg)}.`)
    return all
  }
  const getBy = (arg: Arg) => {
    const all = getAllBy(arg)
    if (all.length > 1)
      throw new Error(
        `Found multiple elements by ${kind} ${describe(arg)} (${all.length}). Use getAllBy${kind}.`,
      )
    return all[0]!
  }
  const retry = async <T>(get: () => T, opts?: WaitOptions): Promise<T> => {
    const timeout = opts?.timeout ?? 1000
    const interval = opts?.interval ?? 50
    const start = performance.now()
    // eslint-disable-next-line no-constant-condition
    for (;;) {
      try {
        return get()
      } catch (err) {
        if (performance.now() - start >= timeout) throw err
        await new Promise((r) => setTimeout(r, interval))
      }
    }
  }
  return {
    getBy,
    queryBy,
    getAllBy,
    queryAllBy,
    findBy: (arg, opts) => retry(() => getBy(arg), opts),
    findAllBy: (arg, opts) => retry(() => getAllBy(arg), opts),
  }
}

// ── bound query surface returned by render() + `screen` ───────────────────

export interface BoundQueries {
  getByText: (match: TextMatch) => HTMLElement
  queryByText: (match: TextMatch) => HTMLElement | null
  getAllByText: (match: TextMatch) => HTMLElement[]
  queryAllByText: (match: TextMatch) => HTMLElement[]
  findByText: (match: TextMatch, opts?: WaitOptions) => Promise<HTMLElement>
  findAllByText: (match: TextMatch, opts?: WaitOptions) => Promise<HTMLElement[]>

  getByTestId: (id: TextMatch) => HTMLElement
  queryByTestId: (id: TextMatch) => HTMLElement | null
  getAllByTestId: (id: TextMatch) => HTMLElement[]
  queryAllByTestId: (id: TextMatch) => HTMLElement[]
  findByTestId: (id: TextMatch, opts?: WaitOptions) => Promise<HTMLElement>
  findAllByTestId: (id: TextMatch, opts?: WaitOptions) => Promise<HTMLElement[]>
}

export function bindQueries(container: ParentNode): BoundQueries {
  const root = () => container

  const text = makeQueries<TextMatch>(
    root,
    'text',
    (r, match) =>
      (Array.from(r.querySelectorAll('*')) as HTMLElement[]).filter((el) => {
        // Match the element whose OWN text (excluding descendants) matches —
        // avoids every ancestor also matching a leaf's text.
        const own = Array.from(el.childNodes)
          .filter((n) => n.nodeType === Node.TEXT_NODE)
          .map((n) => n.textContent ?? '')
          .join('')
          .replace(/\s+/g, ' ')
          .trim()
        return own.length > 0 && matchText(match, own, el)
      }),
    (m) => JSON.stringify(String(m)),
  )

  const testId = makeQueries<TextMatch>(
    root,
    'testId',
    (r, match) =>
      (Array.from(r.querySelectorAll('[data-testid]')) as HTMLElement[]).filter((el) =>
        matchText(match, el.getAttribute('data-testid') ?? '', el),
      ),
    (m) => JSON.stringify(String(m)),
  )

  return {
    getByText: text.getBy,
    queryByText: text.queryBy,
    getAllByText: text.getAllBy,
    queryAllByText: text.queryAllBy,
    findByText: text.findBy,
    findAllByText: text.findAllBy,
    getByTestId: testId.getBy,
    queryByTestId: testId.queryBy,
    getAllByTestId: testId.getAllBy,
    queryAllByTestId: testId.queryAllBy,
    findByTestId: testId.findBy,
    findAllByTestId: testId.findAllBy,
  }
}

export { textOf }
export type { WaitOptions }
