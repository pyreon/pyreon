/**
 * DOM query engine — the Testing-Library `getBy*` / `queryBy*` / `getAllBy*` /
 * `findBy*` family. Kinds: Text, TestId, Role, LabelText, Placeholder.
 *
 * Each "kind" is defined once as a predicate over an element; `makeQueries`
 * derives the six standard variants from it so the behavior (throw-on-missing,
 * throw-on-multiple, null-on-missing, async retry) is uniform and defined in
 * one place.
 */

import { accessibleName, roleOf } from './roles'

export type TextMatch = string | RegExp | ((content: string, element: Element) => boolean)

/** Options for `getByRole` — narrow a role query by accessible name. */
export interface ByRoleOptions {
  name?: TextMatch
}

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

  getByRole: (role: string, opts?: ByRoleOptions) => HTMLElement
  queryByRole: (role: string, opts?: ByRoleOptions) => HTMLElement | null
  getAllByRole: (role: string, opts?: ByRoleOptions) => HTMLElement[]
  queryAllByRole: (role: string, opts?: ByRoleOptions) => HTMLElement[]
  findByRole: (role: string, opts?: ByRoleOptions & WaitOptions) => Promise<HTMLElement>
  findAllByRole: (role: string, opts?: ByRoleOptions & WaitOptions) => Promise<HTMLElement[]>

  getByLabelText: (text: TextMatch) => HTMLElement
  queryByLabelText: (text: TextMatch) => HTMLElement | null
  getAllByLabelText: (text: TextMatch) => HTMLElement[]
  queryAllByLabelText: (text: TextMatch) => HTMLElement[]
  findByLabelText: (text: TextMatch, opts?: WaitOptions) => Promise<HTMLElement>
  findAllByLabelText: (text: TextMatch, opts?: WaitOptions) => Promise<HTMLElement[]>

  getByPlaceholderText: (text: TextMatch) => HTMLElement
  queryByPlaceholderText: (text: TextMatch) => HTMLElement | null
  getAllByPlaceholderText: (text: TextMatch) => HTMLElement[]
  queryAllByPlaceholderText: (text: TextMatch) => HTMLElement[]
  findByPlaceholderText: (text: TextMatch, opts?: WaitOptions) => Promise<HTMLElement>
  findAllByPlaceholderText: (text: TextMatch, opts?: WaitOptions) => Promise<HTMLElement[]>
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

  // Role query is two-arg (role, { name }) — wrap the role+name pair as the
  // single `Arg` so it flows through the same six-variant machinery.
  const role = makeQueries<{ role: string; opts?: ByRoleOptions | undefined }>(
    root,
    'role',
    (r, { role: wanted, opts }) =>
      (Array.from(r.querySelectorAll('*')) as HTMLElement[]).filter((el) => {
        if (roleOf(el) !== wanted) return false
        if (opts?.name === undefined) return true
        return matchText(opts.name, accessibleName(el), el)
      }),
    ({ role: rr, opts }) =>
      opts?.name !== undefined ? `"${rr}" (name ${JSON.stringify(String(opts.name))})` : `"${rr}"`,
  )
  const roleArg = (r: string, opts?: ByRoleOptions) => ({ role: r, opts })

  const labelText = makeQueries<TextMatch>(
    root,
    'label text',
    (r, match) => {
      const out: HTMLElement[] = []
      for (const label of Array.from(r.querySelectorAll('label')) as HTMLLabelElement[]) {
        const own = (label.textContent ?? '').replace(/\s+/g, ' ').trim()
        if (!matchText(match, own, label)) continue
        // `for=` target, else the first labelable descendant.
        const forId = label.getAttribute('for')
        const control = forId
          ? (label.getRootNode() as Document | ShadowRoot).getElementById?.(forId)
          : label.querySelector('input, textarea, select')
        if (control) out.push(control as HTMLElement)
      }
      return out
    },
    (m) => JSON.stringify(String(m)),
  )

  const placeholder = makeQueries<TextMatch>(
    root,
    'placeholder text',
    (r, match) =>
      (Array.from(r.querySelectorAll('[placeholder]')) as HTMLElement[]).filter((el) =>
        matchText(match, el.getAttribute('placeholder') ?? '', el),
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

    getByRole: (r, opts) => role.getBy(roleArg(r, opts)),
    queryByRole: (r, opts) => role.queryBy(roleArg(r, opts)),
    getAllByRole: (r, opts) => role.getAllBy(roleArg(r, opts)),
    queryAllByRole: (r, opts) => role.queryAllBy(roleArg(r, opts)),
    findByRole: (r, opts) => role.findBy(roleArg(r, opts), opts),
    findAllByRole: (r, opts) => role.findAllBy(roleArg(r, opts), opts),

    getByLabelText: labelText.getBy,
    queryByLabelText: labelText.queryBy,
    getAllByLabelText: labelText.getAllBy,
    queryAllByLabelText: labelText.queryAllBy,
    findByLabelText: labelText.findBy,
    findAllByLabelText: labelText.findAllBy,

    getByPlaceholderText: placeholder.getBy,
    queryByPlaceholderText: placeholder.queryBy,
    getAllByPlaceholderText: placeholder.getAllBy,
    queryAllByPlaceholderText: placeholder.queryAllBy,
    findByPlaceholderText: placeholder.findBy,
    findAllByPlaceholderText: placeholder.findAllBy,
  }
}

export { textOf }
export type { WaitOptions }
