/**
 * Cross-arm DOM-shape gate: every arm of a scenario must end each op with the
 * same DOM.
 *
 * ## The defect this exists to prevent
 *
 * The deep-tree scenario mounted with a context value of `''`. Solid's
 * `insert` creates no text node for an empty string; Pyreon's text binding
 * creates one. The per-arm verifier counted `.leaf` elements (equal), so the
 * run passed while the arms built DOMs 1,024 text nodes apart and the browser
 * did different clone/insert work for each. A per-arm verifier checks an arm
 * against the scenario's model; it cannot see what the OTHER arms built. This
 * module compares the arms with each other.
 *
 * ## What is compared
 *
 * `captureDomShape` walks the scenario container after an op and records, for
 * every node below it: element count, CONTENT text nodes (and how many of them
 * are empty), anchor text nodes, comments, the element tag sequence (hashed)
 * and the full `textContent` (length + hash). `compareDomShapes` groups the
 * arms by each COMPARED field per op and reports every field on which they
 * disagree, naming the arms on each side. The same arm on two page loads must
 * agree with itself too.
 *
 * Text nodes are split by role, because frameworks legitimately differ in the
 * bookkeeping nodes they keep:
 *  - a CONTENT text node carries text, or is EMPTY and the only child of its
 *    element — an empty content slot (`<span class="leaf">""</span>`, the
 *    deep-tree defect). Compared: every arm must render the same content.
 *  - an ANCHOR text node is empty and has siblings — a framework's position
 *    marker (Svelte 5 puts an empty text node after the comment that opens
 *    every `{#if}` block and component). Recorded, NOT compared.
 * Comments are bookkeeping too (Pyreon's `<For>` range markers, Vue's fragment
 * anchors, Svelte's `<!>`): recorded, NOT compared. Elements, content text and
 * the text itself are what the scenario asks every arm to render, so they must
 * match exactly.
 *
 * Known blind spot: an empty text node that shares its element with other
 * nodes (`<p>Hello {name}</p>` with `name === ''`) is classified as an anchor.
 * Fixtures must not render empty values; the per-arm verifiers check values.
 *
 * One framework keeps an anchor that is ALONE in its parent: Svelte 5 leaves
 * an empty text node in an `{#each}` block's parent when the list is empty
 * (`<tbody>""</tbody>` after `clear`). The structure cannot tell that apart
 * from an empty content slot, so arms listed in `EMPTY_TEXT_ANCHOR_ARMS` have
 * every empty text node counted as an anchor (`asAnchorArm`). An asymmetric
 * empty value still fails the gate through the other arms.
 *
 * Pure apart from `captureDomShape`'s DOM read; tested from
 * `packages/internals/test-utils/src/tests/bench-dom-shape.test.ts`.
 */

export interface DomShape {
  elements: number
  /** Content text nodes: non-empty, or empty and the sole child of their parent. */
  texts: number
  /** Empty content slots: empty text nodes that are their parent's only child (a subset of `texts`). */
  emptyTexts: number
  /** Empty text nodes with siblings — framework position markers. Not compared. */
  anchorTexts: number
  comments: number
  /** FNV-1a (hex) over the element tag names in document order. */
  tagHash: string
  textLength: number
  /** FNV-1a (hex) over the container's `textContent`. */
  textHash: string
}

export type DomShapeField = keyof DomShape

/** The fields that must be identical across arms (see the module comment). */
export const COMPARED_FIELDS: readonly DomShapeField[] = [
  'elements',
  'texts',
  'emptyTexts',
  'tagHash',
  'textLength',
  'textHash',
]

/** 32-bit FNV-1a over UTF-16 code units, as 8 hex digits. */
export function fnv1a(input: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

const ELEMENT_NODE = 1
const TEXT_NODE = 3
const COMMENT_NODE = 8

/** Node-type census of everything below `root` (the root itself excluded). */
export function captureDomShape(root: Node): DomShape {
  let elements = 0
  let texts = 0
  let emptyTexts = 0
  let anchorTexts = 0
  let comments = 0
  const tags: string[] = []
  const stack: Node[] = []
  for (let c = root.lastChild; c !== null; c = c.previousSibling) stack.push(c)
  while (stack.length > 0) {
    const n = stack.pop() as Node
    if (n.nodeType === ELEMENT_NODE) {
      elements++
      tags.push((n as Element).tagName)
    } else if (n.nodeType === TEXT_NODE) {
      if ((n as Text).data !== '') texts++
      else if (n.previousSibling === null && n.nextSibling === null) {
        texts++
        emptyTexts++
      } else anchorTexts++
    } else if (n.nodeType === COMMENT_NODE) {
      comments++
    }
    for (let c = n.lastChild; c !== null; c = c.previousSibling) stack.push(c)
  }
  const text = root.textContent ?? ''
  return {
    elements,
    texts,
    emptyTexts,
    anchorTexts,
    comments,
    tagHash: fnv1a(tags.join(',')),
    textLength: text.length,
    textHash: fnv1a(text),
  }
}

/**
 * Arms whose framework uses empty text nodes as position anchors even as a
 * parent's only child (see the module comment). Their empty texts are anchors.
 */
export const EMPTY_TEXT_ANCHOR_ARMS: ReadonlySet<string> = new Set(['Svelte 5'])

/** Re-classify every empty text node of `shape` as an anchor. */
export function asAnchorArm(shape: DomShape): DomShape {
  return {
    ...shape,
    texts: shape.texts - shape.emptyTexts,
    emptyTexts: 0,
    anchorTexts: shape.anchorTexts + shape.emptyTexts,
  }
}

/** One captured shape: which arm, which op, which page load. */
export interface DomShapeObservation {
  arm: string
  op: string
  /** Page-load / pass index, so an arm that disagrees with itself is visible. */
  pass: number
  shape: DomShape
}

export interface DomShapeMismatch {
  op: string
  field: DomShapeField
  /** One entry per distinct value, with the arms (and passes) that produced it. */
  groups: { value: string | number; arms: string[] }[]
}

/**
 * Compare every observation of each op across arms (and across passes of one
 * arm). Returns one mismatch per (op, field) on which the observations
 * disagree; empty when every arm built the same DOM.
 */
export function compareDomShapes(
  observations: readonly DomShapeObservation[],
  fields: readonly DomShapeField[] = COMPARED_FIELDS,
  anchorArms: ReadonlySet<string> = EMPTY_TEXT_ANCHOR_ARMS,
): DomShapeMismatch[] {
  const byOp = new Map<string, DomShapeObservation[]>()
  for (const raw of observations) {
    const o = anchorArms.has(raw.arm) ? { ...raw, shape: asAnchorArm(raw.shape) } : raw
    const list = byOp.get(o.op)
    if (list) list.push(o)
    else byOp.set(o.op, [o])
  }
  const out: DomShapeMismatch[] = []
  for (const [op, obs] of byOp) {
    for (const field of fields) {
      const groups = new Map<string | number, Set<string>>()
      for (const o of obs) {
        const v = o.shape[field]
        const set = groups.get(v) ?? new Set<string>()
        set.add(`${o.arm} (pass ${o.pass})`)
        groups.set(v, set)
      }
      if (groups.size > 1) {
        out.push({
          op,
          field,
          groups: [...groups].map(([value, arms]) => ({ value, arms: [...arms].sort() })),
        })
      }
    }
  }
  return out
}

/** Human-readable report lines for `compareDomShapes` output. */
export function formatDomShapeMismatches(
  scenario: string,
  mismatches: readonly DomShapeMismatch[],
): string[] {
  const lines: string[] = []
  for (const m of mismatches) {
    lines.push(`✗ DOM-shape gate: ${scenario} / ${m.op} — arms differ on "${m.field}":`)
    for (const g of m.groups)
      lines.push(`    ${String(g.value).padStart(10)}  ${g.arms.join(', ')}`)
  }
  return lines
}
