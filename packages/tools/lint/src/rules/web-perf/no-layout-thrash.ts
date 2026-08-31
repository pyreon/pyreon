import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'

/**
 * Reading a layout property after writing style, inside a loop.
 *
 * The browser batches style writes and flushes them lazily. Reading a geometry
 * property forces that flush immediately so it can answer accurately — so a
 * write followed by a read, per iteration, forces one full synchronous reflow
 * per item. Ten rows is invisible; a thousand is a frozen tab, and the cost is
 * superlinear because each reflow is over a growing tree.
 *
 * The fix is to split the passes: read every measurement first, then apply
 * every write. Same work, one reflow.
 *
 * Only the loop case is reported. A single read-after-write is one reflow and
 * frequently unavoidable — measuring an element you just positioned is a real
 * thing to do.
 */
const LAYOUT_READS = new Set([
  'offsetWidth', 'offsetHeight', 'offsetTop', 'offsetLeft',
  'clientWidth', 'clientHeight', 'clientTop', 'clientLeft',
  'scrollWidth', 'scrollHeight', 'scrollTop', 'scrollLeft',
])
const LAYOUT_READ_CALLS = new Set(['getBoundingClientRect', 'getClientRects', 'getComputedStyle'])

function isLayoutRead(node: any): string | null {
  if (node?.type === 'MemberExpression' && node.computed !== true) {
    const p = node.property?.type === 'Identifier' ? String(node.property.name) : null
    if (p !== null && LAYOUT_READS.has(p)) return p
  }
  if (node?.type === 'CallExpression') {
    const c = node.callee
    if (c?.type === 'MemberExpression' && c.property?.type === 'Identifier') {
      const n = String(c.property.name)
      if (LAYOUT_READ_CALLS.has(n)) return `${n}()`
    }
    if (c?.type === 'Identifier' && LAYOUT_READ_CALLS.has(String(c.name))) {
      return `${String(c.name)}()`
    }
  }
  return null
}

/** `el.style.x = …` / `el.classList.add(…)` / `el.setAttribute('style', …)` */
function isStyleWrite(node: any): boolean {
  if (node?.type === 'AssignmentExpression') {
    const l = node.left
    if (l?.type === 'MemberExpression') {
      const o = l.object
      if (o?.type === 'MemberExpression' && o.property?.type === 'Identifier') {
        if (String(o.property.name) === 'style') return true
      }
      if (l.property?.type === 'Identifier' && ['className', 'innerHTML'].includes(String(l.property.name))) {
        return true
      }
    }
  }
  if (node?.type === 'CallExpression') {
    const c = node.callee
    if (c?.type === 'MemberExpression' && c.property?.type === 'Identifier') {
      const n = String(c.property.name)
      if (['add', 'remove', 'toggle'].includes(n) && c.object?.type === 'MemberExpression') {
        const oo = c.object.property
        if (oo?.type === 'Identifier' && String(oo.name) === 'classList') return true
      }
      if (n === 'setProperty' || n === 'setAttribute') return true
    }
  }
  return false
}

export const noLayoutThrash: Rule = {
  meta: {
    id: 'pyreon/no-layout-thrash',
    category: 'web-perf',
    description:
      'A layout read after a style write inside a loop forces one synchronous reflow per iteration — invisible at ten items, a frozen tab at a thousand.',
    severity: 'warn',
    appliesTo: ['client', 'shared'],
    fixable: false,
  },
  create(context) {
    const callbacks: VisitorCallbacks = {
      // Walk each loop body's own statements in order.
      BlockStatement(node: any) {
        const parent = (node as { __loopBody?: boolean }).__loopBody
        if (parent !== true) return
      },
      ForOfStatement: () => undefined,
    }

    /** Scan a loop's body for write-then-read in statement order. */
    function scanLoop(loop: any): void {
      const body = loop?.body
      const stmts: any[] = body?.type === 'BlockStatement' ? (body.body ?? []) : [body]
      let sawWrite = false
      for (const stmt of stmts) {
        let wrote = false
        let readName: string | null = null
        const walk = (n: any, d = 0): void => {
          if (!n || typeof n !== 'object' || d > 8) return
          if (isStyleWrite(n)) wrote = true
          const r = isLayoutRead(n)
          if (r !== null && readName === null) readName = r
          for (const k of Object.keys(n)) {
            if (k === 'type' || k === 'start' || k === 'end' || k === 'loc' || k === 'parent') continue
            const v = (n as Record<string, unknown>)[k]
            if (Array.isArray(v)) for (const c of v) walk(c, d + 1)
            else if (v && typeof v === 'object') walk(v, d + 1)
          }
        }
        walk(stmt)
        if (readName !== null && sawWrite) {
          context.report({
            message: `Reading \`${readName}\` after a style write, inside a loop, forces the browser to flush pending style and reflow so it can answer — once per iteration, over a growing tree. Split the passes: measure everything first, then write everything. Same work, one reflow.`,
            span: getSpan(stmt),
          })
          return
        }
        if (wrote) sawWrite = true
      }
    }

    const loopVisitor = (node: any) => scanLoop(node)
    return {
      ...callbacks,
      ForStatement: loopVisitor,
      ForOfStatement: loopVisitor,
      ForInStatement: loopVisitor,
      WhileStatement: loopVisitor,
    } as VisitorCallbacks
  },
}
