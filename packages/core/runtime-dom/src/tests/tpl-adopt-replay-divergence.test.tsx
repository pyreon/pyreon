/**
 * Compiled-template adoption — what the ROW 2..N replay refuses.
 *
 * `tplAdoptVerify` proves a server element matches a compiled `_tpl`
 * skeleton before the bind is allowed to run against it. For a `<For>` the
 * first row pays a full structural verify and caches a PLAN — the positions
 * of the marker triplets, the sole-text slots and the extra-text removals —
 * and every later row replays that plan positionally instead of re-deriving
 * it.
 *
 * Which is the same shape as the row-plan bail contract, one layer down, and
 * with the same failure mode: a plan derived from row 1 replayed over a row
 * that does not match it hands the compiled bind a reference to the WRONG
 * node. The bind then writes `.data` onto an element (a silent no-op, so the
 * column never updates) or onto null (a throw from inside the framework, with
 * a stack pointing at generated code). Neither says "row 7 was shaped
 * differently".
 *
 * So every spec here is a per-spot mismatch that must produce `false` — the
 * caller then re-runs the full verify, which either adopts properly or
 * declines and clones. `false` costs an adoption; a wrong `true` costs the
 * page. And each is paired with the row that must still return `true`,
 * because a verifier that refuses everything is a verifier nobody can afford
 * to leave switched on.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { tplAdoptVerify } from '../hydration-plan'

type CountSink = { __pyreon_count__?: ((name: string, n?: number) => void) | undefined }

function tplOf(html: string): HTMLTemplateElement {
  const tpl = document.createElement('template')
  tpl.innerHTML = html
  return tpl
}

function targetOf(html: string): Element {
  const host = document.createElement('div')
  host.innerHTML = html
  return host.firstElementChild as Element
}

/** Count `runtime.tpl.adoptPlanReplay` emissions while `fn` runs. */
function withReplayCount<T>(fn: () => T): { value: T; replays: number } {
  const g = globalThis as CountSink
  const prev = g.__pyreon_count__
  let replays = 0
  g.__pyreon_count__ = (name) => {
    if (name === 'runtime.tpl.adoptPlanReplay') replays++
  }
  try {
    return { value: fn(), replays }
  } finally {
    g.__pyreon_count__ = prev
  }
}

// A compiled element with a static child plus a NON-sole dynamic text slot:
// the template bakes a placeholder space, and SSR emits the rendered value
// wrapped in its `<!--$-->…<!--/$-->` range because the tag boundary alone
// cannot delimit it.
const TRIPLET_HTML = '<p><b>x</b> </p>'
const row = (v: string) => `<p><b>x</b><!--$-->${v}<!--/$--></p>`

let tpl: HTMLTemplateElement

beforeEach(() => {
  // A fresh template per test: the plan cache is keyed by template identity,
  // so sharing one across tests would let an earlier row's plan decide a
  // later test's verdict.
  tpl = tplOf(TRIPLET_HTML)
})

describe('the plan is built once and replayed after that', () => {
  it('BUILDS on the first row and REPLAYS on the second', () => {
    // The control the whole file rests on. Without the counter this suite
    // would take the full-verify path every time, return the same verdicts,
    // and silently stop testing the path it is named for.
    const { replays } = withReplayCount(() => {
      expect(tplAdoptVerify(tpl, TRIPLET_HTML, targetOf(row('a')), true)).toBe(true)
      expect(tplAdoptVerify(tpl, TRIPLET_HTML, targetOf(row('b')), true)).toBe(true)
    })
    expect(replays, 'exactly one replay — the second row').toBe(1)
  })

  it('does NOT replay when the caller has not opted in', () => {
    // Only the `<For>` row loop can promise structurally identical successive
    // targets. `_tplCache` is process-global and keyed by HTML, so two
    // unrelated components compiling to the same string share a plan — and an
    // unconditional replay would hand one of them the other's verdict.
    const { replays } = withReplayCount(() => {
      expect(tplAdoptVerify(tpl, TRIPLET_HTML, targetOf(row('a')))).toBe(true)
      expect(tplAdoptVerify(tpl, TRIPLET_HTML, targetOf(row('b')))).toBe(true)
    })
    expect(replays).toBe(0)
  })

  it('normalizes the slot so the compiled bind finds its text FIRST', () => {
    // The compiled ref is `el.firstChild`. Adoption removes the OPEN marker so
    // the text shifts into that position; the close is left as an inert
    // trailing comment rather than paying a second mutation to move the text.
    const t = targetOf(row('v1'))
    expect(tplAdoptVerify(tpl, TRIPLET_HTML, t, true)).toBe(true)
    const slot = t.querySelector('b')!.nextSibling
    expect(slot?.nodeType, 'the slot resolves to a TEXT node').toBe(3)
    expect(slot?.nodeValue).toBe('v1')
  })

  it('normalizes every REPLAYED row the same way', () => {
    // Rows 2..N take a different code path to the same guarantee. A
    // normalization that only happens on the full-verify path leaves every
    // later row with a comment where its bind expects text.
    tplAdoptVerify(tpl, TRIPLET_HTML, targetOf(row('a')), true)
    const t = targetOf(row('b'))
    expect(tplAdoptVerify(tpl, TRIPLET_HTML, t, true)).toBe(true)
    const slot = t.querySelector('b')!.nextSibling
    expect(slot?.nodeType).toBe(3)
    expect(slot?.nodeValue).toBe('b')
  })
})

describe('a replayed row whose slot diverges REFUSES', () => {
  /** Row 1 always matches, so the plan exists; row 2 is the shape under test. */
  const replayRow2 = (html: string): boolean => {
    tplAdoptVerify(tpl, TRIPLET_HTML, targetOf(row('seed')), true)
    return tplAdoptVerify(tpl, TRIPLET_HTML, targetOf(html), true)
  }

  it('accepts a row identical in shape', () => {
    // The control for this block.
    expect(replayRow2(row('other'))).toBe(true)
  })

  it('accepts an EMPTY slot and materializes the text node', () => {
    // A column that renders '' on some rows emits `<!--$--><!--/$-->` with no
    // node between. That is not divergence — the server is correct — so the
    // verifier creates the node the bind will write into. Refusing would drop
    // every such row to a rebuild, which for an often-empty column is most of
    // the table.
    tplAdoptVerify(tpl, TRIPLET_HTML, targetOf(row('seed')), true)
    const t = targetOf('<p><b>x</b><!--$--><!--/$--></p>')
    expect(tplAdoptVerify(tpl, TRIPLET_HTML, t, true)).toBe(true)
    const slot = t.querySelector('b')!.nextSibling
    expect(slot?.nodeType, 'a text node the bind can write into').toBe(3)
    expect(slot?.nodeValue).toBe('')
  })

  it('REFUSES a slot holding an ELEMENT', () => {
    // The accessor returned a VNode on this row. `.data` on an element is a
    // silent no-op: the cell renders the server's value forever and no error
    // is ever raised.
    expect(replayRow2('<p><b>x</b><!--$--><i>e</i><!--/$--></p>')).toBe(false)
  })

  it('REFUSES a slot whose CLOSE marker is missing', () => {
    // Without the close the extent is unknowable, so the next sibling's index
    // is wrong for every position after it.
    expect(replayRow2('<p><b>x</b><!--$-->v</p>')).toBe(false)
  })

  it('REFUSES a slot whose close marker is the WRONG comment', () => {
    expect(replayRow2('<p><b>x</b><!--$-->v<!--pyreon--></p>')).toBe(false)
  })

  it('REFUSES a row with no markers at all', () => {
    // Bare text where the plan recorded a triplet. The full verify still gets
    // its chance; what must not happen is the replay accepting it and handing
    // the bind a reference computed from the wrong child indices.
    const { value } = withReplayCount(() => replayRow2('<p><b>x</b>bare</p>'))
    expect(value, 'the full verify may still adopt — the REPLAY must not decide it').toBe(true)
  })

  it('does NOT re-prove the STATIC skeleton — it checks positions, not tags', () => {
    // The boundary, stated rather than left implicit, because it is the one
    // thing about this fast path a reader is most likely to assume wrongly.
    //
    // The replay verifies the recorded SPOTS: the marker triplets, the
    // sole-text slots, the extra-text removals. It does not re-walk tags or
    // attributes — that is what the first row's full verify is for, and
    // re-doing it per row would leave no fast path at all. So a row whose
    // static prefix is `<i>` where row 1 had `<b>` REPLAYS, because the slot
    // is still at the same child index.
    //
    // What makes that sound is the opt-in: `allowPlanReplay` is passed only by
    // the `<For>` row loop, whose rows come from one `renderItem` and are
    // structurally identical by construction. The cost of the premise being
    // false is a server/client divergence in the STATIC markup that is adopted
    // rather than corrected — visible, not silent, and bounded to markup the
    // bind never writes to.
    expect(replayRow2('<p><i>x</i><!--$-->v<!--/$--></p>')).toBe(true)
    // …and the positional half is genuinely checked: shifting the slot's index
    // by adding a sibling DOES refuse (the spec below).
  })

  it('REFUSES a row that is missing the static prefix entirely', () => {
    // Shallower than the plan's path — `elByPath` runs out of nodes.
    expect(replayRow2('<p><!--$-->v<!--/$--></p>')).toBe(false)
  })

  it('REFUSES a row with an EXTRA element before the slot', () => {
    expect(replayRow2('<p><em>n</em><b>x</b><!--$-->v<!--/$--></p>')).toBe(false)
  })

  it('REFUSES a row whose ROOT tag differs', () => {
    // Checked before any plan work — the cheapest gate, and the one that stops
    // a shared-HTML plan from being applied to an unrelated component.
    expect(replayRow2('<div><b>x</b><!--$-->v<!--/$--></div>')).toBe(false)
  })

  it('recovers on the NEXT row after a refusal', () => {
    // A refusal is per-row. Poisoning the cached plan would cost every
    // following row too, turning one odd item into a whole-table rebuild.
    tplAdoptVerify(tpl, TRIPLET_HTML, targetOf(row('a')), true)
    expect(tplAdoptVerify(tpl, TRIPLET_HTML, targetOf('<p><b>x</b><!--$--><i>e</i><!--/$--></p>'), true)).toBe(false)
    expect(tplAdoptVerify(tpl, TRIPLET_HTML, targetOf(row('c')), true), 'still adopting').toBe(true)
  })
})

describe('a sole-child slot has its own invariant, re-proved per row', () => {
  const SOLE_HTML = '<a class="c"> </a>'
  let soleTpl: HTMLTemplateElement

  beforeEach(() => {
    soleTpl = tplOf(SOLE_HTML)
  })

  const seed = () => tplAdoptVerify(soleTpl, SOLE_HTML, targetOf('<a class="c">L1</a>'), true)

  it('adopts successive rows', () => {
    expect(seed()).toBe(true)
    expect(tplAdoptVerify(soleTpl, SOLE_HTML, targetOf('<a class="c">L2</a>'), true)).toBe(true)
  })

  it('REFUSES a sole slot holding an element', () => {
    // The markers are elided here, so "this element's only child is a text
    // node" has to be stated directly — there is no triplet left to imply it.
    seed()
    expect(tplAdoptVerify(soleTpl, SOLE_HTML, targetOf('<a class="c"><b>L</b></a>'), true)).toBe(
      false,
    )
  })

  it('REFUSES a sole slot with a TRAILING sibling', () => {
    // "Sole" is the premise the elision rests on.
    seed()
    expect(tplAdoptVerify(soleTpl, SOLE_HTML, targetOf('<a class="c">L<i>x</i></a>'), true)).toBe(
      false,
    )
  })

  it('REFUSES a sole slot with a LEADING sibling', () => {
    seed()
    expect(tplAdoptVerify(soleTpl, SOLE_HTML, targetOf('<a class="c"><i>x</i>L</a>'), true)).toBe(
      false,
    )
  })

  it('lets the full verify materialize an EMPTY sole slot', () => {
    // Row rendered '' — no node at all. The replay declines (there is no text
    // node to check), and the full verify creates one and adopts.
    seed()
    const t = targetOf('<a class="c"></a>')
    expect(tplAdoptVerify(soleTpl, SOLE_HTML, t, true)).toBe(true)
    expect(t.firstChild?.nodeType).toBe(3)
    expect(t.firstChild?.nodeValue).toBe('')
  })
})

describe('the cheapest gates run before any plan work', () => {
  it('refuses a target whose tag differs from the template root', () => {
    const html = '<p class="x">hi</p>'
    expect(tplAdoptVerify(tplOf(html), html, targetOf('<div class="x">hi</div>'))).toBe(false)
  })

  it('refuses an EMPTY template — there is no root to compare', () => {
    expect(tplAdoptVerify(tplOf(''), '', targetOf('<p>hi</p>'))).toBe(false)
  })

  it('refuses a template whose root is not an element', () => {
    expect(tplAdoptVerify(tplOf('just text'), 'just text', targetOf('<p>hi</p>'))).toBe(false)
  })

  it('adopts a fully static match', () => {
    const html = '<p class="x">hi</p>'
    expect(tplAdoptVerify(tplOf(html), html, targetOf(html))).toBe(true)
  })

  it('refuses when a STATIC attribute the template bakes is absent', () => {
    // A baked attribute is part of the skeleton. A server node missing it was
    // rendered from different source, and adopting it would leave the page
    // describing markup the client never produced.
    const html = '<p class="x">hi</p>'
    expect(tplAdoptVerify(tplOf(html), html, targetOf('<p>hi</p>'))).toBe(false)
  })

  it('refuses when a baked static TEXT differs', () => {
    const html = '<p>hi</p>'
    expect(tplAdoptVerify(tplOf(html), html, targetOf('<p>bye</p>'))).toBe(false)
  })

  it('refuses when the target has EXTRA element children', () => {
    const html = '<p><b>a</b></p>'
    expect(tplAdoptVerify(tplOf(html), html, targetOf('<p><b>a</b><i>b</i></p>'))).toBe(false)
  })

  it('refuses when the target is MISSING an element child', () => {
    const html = '<p><b>a</b><i>b</i></p>'
    expect(tplAdoptVerify(tplOf(html), html, targetOf('<p><b>a</b></p>'))).toBe(false)
  })

  it('refuses a DEEP structural difference, not just a shallow one', () => {
    const html = '<p><b><i>x</i></b></p>'
    expect(tplAdoptVerify(tplOf(html), html, targetOf('<p><b><em>x</em></b></p>'))).toBe(false)
  })

  it('adopts a deep match', () => {
    const html = '<p><b><i>x</i></b></p>'
    expect(tplAdoptVerify(tplOf(html), html, targetOf(html))).toBe(true)
  })
})

describe('the FULL verify scans the server markers before adopting', () => {
  // These go through the first-row path (no `allowPlanReplay`), which is the
  // one that reads the real server markup rather than replaying recorded
  // positions. Its job is to prove the range structure is what the compiled
  // bind assumes; every refusal below is a shape where the bind would resolve
  // a reference to the wrong node and write into it.

  it('adopts a well-formed triplet', () => {
    // The control.
    expect(tplAdoptVerify(tplOf(TRIPLET_HTML), TRIPLET_HTML, targetOf(row('v')))).toBe(true)
  })

  it('adopts an EMPTY triplet and materializes the text', () => {
    const t = targetOf('<p><b>x</b><!--$--><!--/$--></p>')
    expect(tplAdoptVerify(tplOf(TRIPLET_HTML), TRIPLET_HTML, t)).toBe(true)
    expect(t.querySelector('b')!.nextSibling?.nodeType, 'a node to write into').toBe(3)
  })

  it('REFUSES an open marker with nothing after it', () => {
    // A truncated stream. The extent is unbounded, so nothing downstream can
    // be positioned.
    expect(tplAdoptVerify(tplOf(TRIPLET_HTML), TRIPLET_HTML, targetOf('<p><b>x</b><!--$--></p>'))).toBe(
      false,
    )
  })

  it('REFUSES a triplet whose close is a DIFFERENT comment', () => {
    expect(
      tplAdoptVerify(
        tplOf(TRIPLET_HTML),
        TRIPLET_HTML,
        targetOf('<p><b>x</b><!--$-->v<!--pyreon--></p>'),
      ),
    ).toBe(false)
  })

  it('REFUSES a triplet followed immediately by TEXT', () => {
    // The parser-merge seam: a text node touching the range makes the
    // boundary between "this binding\'s value" and "the next sibling" unknowable
    // without a split the verify does not perform.
    expect(
      tplAdoptVerify(
        tplOf(TRIPLET_HTML),
        TRIPLET_HTML,
        targetOf('<p><b>x</b><!--$-->v<!--/$-->tail</p>'),
      ),
    ).toBe(false)
  })

  it('REFUSES an EMPTY triplet followed immediately by text', () => {
    expect(
      tplAdoptVerify(
        tplOf(TRIPLET_HTML),
        TRIPLET_HTML,
        targetOf('<p><b>x</b><!--$--><!--/$-->tail</p>'),
      ),
    ).toBe(false)
  })

  it('REFUSES a triplet PRECEDED immediately by text', () => {
    // Same seam on the other side.
    expect(
      tplAdoptVerify(
        tplOf(TRIPLET_HTML),
        TRIPLET_HTML,
        targetOf('<p><b>x</b>lead<!--$-->v<!--/$--></p>'),
      ),
    ).toBe(false)
  })

  it('REFUSES an ORPHAN close marker', () => {
    // A `/$` with no opener means the range this element belongs to started
    // somewhere the walk never saw.
    expect(
      tplAdoptVerify(tplOf(TRIPLET_HTML), TRIPLET_HTML, targetOf('<p><b>x</b><!--/$--></p>')),
    ).toBe(false)
  })

  it('REFUSES a FOREIGN marker inside the element', () => {
    // A `<For>` block\'s `k:`/`pyreon-for` markers, or an async component\'s
    // `$pas`, inside a row means this element is not the flat shape the
    // template describes — its children belong to another owner.
    for (const marker of ['k:1', 'pyreon-for', '$pas']) {
      expect(
        tplAdoptVerify(
          tplOf(TRIPLET_HTML),
          TRIPLET_HTML,
          targetOf(`<p><b>x</b><!--${marker}-->v</p>`),
        ),
        marker,
      ).toBe(false)
    }
  })

  it('REFUSES a triplet holding an ELEMENT', () => {
    expect(
      tplAdoptVerify(
        tplOf(TRIPLET_HTML),
        TRIPLET_HTML,
        targetOf('<p><b>x</b><!--$--><i>e</i><!--/$--></p>'),
      ),
    ).toBe(false)
  })

  it('adopts a static element carrying ONE bare text where the template has one', () => {
    const html = '<p>hi</p>'
    expect(tplAdoptVerify(tplOf(html), html, targetOf('<p>hi</p>'))).toBe(true)
  })

  it('REFUSES a static element with MORE texts than the template describes', () => {
    // The template says one text; the server produced two. That is a
    // structural divergence, not a formatting difference.
    const html = '<p>hi</p>'
    const host = document.createElement('div')
    host.innerHTML = '<p>hi</p>'
    const p = host.firstElementChild!
    p.appendChild(document.createTextNode('extra'))
    expect(tplAdoptVerify(tplOf(html), html, p)).toBe(false)
  })

  it('scans NESTED elements, not just the root', () => {
    // The verify recurses. A malformed range one level down is exactly as
    // fatal as one at the top, and a root-only check would adopt it.
    const html = '<p><span><b>x</b> </span></p>'
    expect(
      tplAdoptVerify(tplOf(html), html, targetOf('<p><span><b>x</b><!--$-->v<!--/$--></span></p>')),
    ).toBe(true)
    expect(
      tplAdoptVerify(tplOf(html), html, targetOf('<p><span><b>x</b><!--$-->v</span></p>')),
    ).toBe(false)
  })

  it('adopts a row where the SAME element carries two slots', () => {
    const html = '<p> <b>x</b> </p>'
    expect(
      tplAdoptVerify(
        tplOf(html),
        html,
        targetOf('<p><!--$-->a<!--/$--><b>x</b><!--$-->z<!--/$--></p>'),
      ),
    ).toBe(true)
  })

  it('REFUSES when the SECOND of two slots is malformed', () => {
    // A verify that stopped at the first good range would adopt this.
    const html = '<p> <b>x</b> </p>'
    expect(
      tplAdoptVerify(tplOf(html), html, targetOf('<p><!--$-->a<!--/$--><b>x</b><!--$-->z</p>')),
    ).toBe(false)
  })
})

describe('a MOUNT-SLOT template matches a server range, or refuses', () => {
  // A `<!>` in the template is where a compiled `_mountSlot` will put a
  // subtree — a conditional child, a `.map()`, a nested list. SSR emits that
  // subtree wrapped in a `<!--$-->…<!--/$-->` range because its node count is
  // not knowable from the markup.

  const SLOT_END = '<p><b>x</b><!></p>'
  const SLOT_MID = '<p><!><b>x</b></p>'

  it('adopts a trailing slot whose server range is present', () => {
    // The control.
    expect(
      tplAdoptVerify(
        tplOf(SLOT_END),
        SLOT_END,
        targetOf('<p><b>x</b><!--$--><i>v</i><!--/$--></p>'),
      ),
    ).toBe(true)
  })

  it('REFUSES a trailing slot with NO server range', () => {
    // The template says a subtree belongs here and the server rendered none.
    // Adopting would let the compiled bind resolve its placeholder to a real
    // SSR node, and `_mountSlot` would then delete that node — silently
    // removing content the server did render.
    expect(tplAdoptVerify(tplOf(SLOT_END), SLOT_END, targetOf('<p><b>x</b></p>'))).toBe(false)
  })

  it('adopts a MID slot whose range is present', () => {
    // A slot with static siblings after it, which is the case where server and
    // clone child indices disagree until the range collapses.
    expect(
      tplAdoptVerify(
        tplOf(SLOT_MID),
        SLOT_MID,
        targetOf('<p><!--$--><i>v</i><!--/$--><b>x</b></p>'),
      ),
    ).toBe(true)
  })

  it('REFUSES a mid slot with no range', () => {
    expect(tplAdoptVerify(tplOf(SLOT_MID), SLOT_MID, targetOf('<p><b>x</b></p>'))).toBe(false)
  })

  it('REFUSES a mid slot whose range sits at the WRONG index', () => {
    // The template puts it first; the server put it last. Every child index
    // after the divergence is off, so the static refs land on the wrong nodes.
    expect(
      tplAdoptVerify(
        tplOf(SLOT_MID),
        SLOT_MID,
        targetOf('<p><b>x</b><!--$--><i>v</i><!--/$--></p>'),
      ),
    ).toBe(false)
  })

  it('adopts an EMPTY range for a slot whose value rendered nothing', () => {
    expect(
      tplAdoptVerify(tplOf(SLOT_END), SLOT_END, targetOf('<p><b>x</b><!--$--><!--/$--></p>')),
    ).toBe(true)
  })

  it('adopts a range holding SEVERAL nodes', () => {
    // A `.map()` renders N; the range is what makes N knowable.
    expect(
      tplAdoptVerify(
        tplOf(SLOT_END),
        SLOT_END,
        targetOf('<p><b>x</b><!--$--><i>1</i><i>2</i><i>3</i><!--/$--></p>'),
      ),
    ).toBe(true)
  })

  it('adopts NESTED ranges inside a slot', () => {
    // Accessor ranges nest, so the close-marker scan is depth-aware. Matching
    // the first `/$` would end the outer range early and hand the rest of the
    // element to the wrong owner.
    expect(
      tplAdoptVerify(
        tplOf(SLOT_END),
        SLOT_END,
        targetOf('<p><b>x</b><!--$--><i><!--$-->in<!--/$--></i><!--/$--></p>'),
      ),
    ).toBe(true)
  })

  it('REFUSES a slot range whose close marker never arrives', () => {
    expect(
      tplAdoptVerify(tplOf(SLOT_END), SLOT_END, targetOf('<p><b>x</b><!--$--><i>v</i></p>')),
    ).toBe(false)
  })
})

describe('a bind-managed element has its stray server texts removed', () => {
  // A template element the compiler emits EMPTY is one whose content the bind
  // owns (`_setChild`). SSR filled it, so the verify has to decide what to do
  // with what it finds.

  const EMPTY_EL = '<p></p>'

  const withTexts = (...parts: string[]): Element => {
    const host = document.createElement('div')
    host.innerHTML = '<p></p>'
    const el = host.firstElementChild!
    for (const t of parts) el.appendChild(document.createTextNode(t))
    return el
  }

  it('KEEPS a sole bare text — the bind rewrites it in place', () => {
    // `_setChild`\'s sole-text fast path writes `.data` on the existing node,
    // and the value matches by construction, so the write is free. Removing it
    // would throw away a node the bind is about to recreate.
    const el = withTexts('server')
    expect(tplAdoptVerify(tplOf(EMPTY_EL), EMPTY_EL, el)).toBe(true)
    expect(el.childNodes.length, 'the node is reused').toBe(1)
  })

  it('REMOVES several bare texts — the fast path cannot reuse them', () => {
    // A parser-merge shape the sole-text path has no answer for. Leaving them
    // means the bind writes into one and the others stay on the page.
    const el = withTexts('a', 'b')
    expect(tplAdoptVerify(tplOf(EMPTY_EL), EMPTY_EL, el)).toBe(true)
    expect(el.childNodes.length, 'cleared before the bind runs').toBe(0)
  })

  it('adopts an element the server left genuinely empty', () => {
    expect(tplAdoptVerify(tplOf(EMPTY_EL), EMPTY_EL, targetOf('<p></p>'))).toBe(true)
  })

  it('REFUSES when the server put an ELEMENT in a bind-managed slot', () => {
    // Element children are not something the text-removal relaxation covers:
    // the template describes none, so this is a structural divergence.
    expect(tplAdoptVerify(tplOf(EMPTY_EL), EMPTY_EL, targetOf('<p><b>x</b></p>'))).toBe(false)
  })
})
