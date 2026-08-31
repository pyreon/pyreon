import { describe, expect, it } from 'vitest'
import { allRules } from '../rules/index'
import { lintFile } from '../runner'

/**
 * The rule locks a teardown ORDER that the repo previously got wrong in its own
 * catalog — and the catalog's wrong version had already been copied into
 * shipped code as a justifying comment. The specs below therefore assert both
 * directions explicitly: the bad order fires, and the good order is silent.
 */
const RULE = 'pyreon/no-close-before-handler-teardown'
const rules = allRules.filter((r) => r.meta.id === RULE)
const cfg = { rules: { [RULE]: 'warn' } } as never

function run(src: string, file = 'src/useSocket.ts') {
  return lintFile(file, src, rules, cfg).diagnostics
}

describe('pyreon/no-close-before-handler-teardown', () => {
  it('is a warning on client + shared files', () => {
    expect(rules).toHaveLength(1)
    expect(rules[0]?.meta.severity).toBe('warn')
    expect(rules[0]?.meta.appliesTo).toEqual(['client', 'shared'])
  })

  it('fires when close() precedes the handler teardown', () => {
    const d = run(`
      function teardown(ws: WebSocket) {
        ws.close()
        ws.onmessage = null
      }
    `)
    expect(d).toHaveLength(1)
    expect(d[0]?.message).toContain('close() only starts the closing handshake')
  })

  it('stays silent on the CORRECT order — the whole point of the rule', () => {
    expect(
      run(`
      function teardown(ws: WebSocket) {
        ws.onmessage = null
        ws.close()
      }
    `),
    ).toEqual([])
  })

  it('reports once per object, not once per nulled handler', () => {
    // A four-handler teardown is ONE defect. Reporting it four times would
    // make the real signal look like a cluster of separate problems.
    const d = run(`
      function teardown(ws: WebSocket) {
        ws.close()
        ws.onopen = null
        ws.onmessage = null
        ws.onerror = null
        ws.onclose = null
      }
    `)
    expect(d).toHaveLength(1)
  })

  it('handles `this.ws` and other stable member paths', () => {
    expect(
      run(`
      class C {
        stop() {
          this.ws.close()
          this.ws.onmessage = null
        }
      }
    `),
    ).toHaveLength(1)
  })

  it('does not fire across DIFFERENT objects', () => {
    expect(
      run(`
      function teardown(a: WebSocket, b: WebSocket) {
        a.close()
        b.onmessage = null
      }
    `),
    ).toEqual([])
  })

  it('fires when close() is wrapped in a readyState guard — the REAL shipped shape', () => {
    // The first cut of this rule matched only same-block statements and
    // therefore found NOTHING in `@pyreon/query`'s use-subscription.ts, which
    // is the defect it was written for. A close that ran before the handlers
    // came off is a defect whatever guarded it.
    const d = run(`
      function teardown(ws: WebSocket) {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close()
        }
        ws.onopen = null
        ws.onmessage = null
      }
    `)
    expect(d).toHaveLength(1)
  })

  it('does not count a close() inside a nested function — it runs later, if ever', () => {
    expect(
      run(`
      function teardown(ws: WebSocket) {
        onIdle(() => { ws.close() })
        ws.onmessage = null
      }
    `),
    ).toEqual([])
  })

  it('does not fire when the null assignment is in a different block', () => {
    // Two blocks may run in either order, or not at all — the rule refuses to
    // guess. A false positive here means telling someone to reorder correct
    // teardown, which is worse than missing one.
    expect(
      run(`
      function teardown(ws: WebSocket, done: boolean) {
        ws.close()
        if (done) {
          ws.onmessage = null
        }
      }
    `),
    ).toEqual([])
  })

  it('ignores a close() on something with no handler teardown at all', () => {
    expect(
      run(`
      function teardown(ws: WebSocket) {
        ws.close()
      }
    `),
    ).toEqual([])
  })

  it('ignores assignment of a real handler, not null', () => {
    expect(
      run(`
      function reconnect(ws: WebSocket, fn: (e: MessageEvent) => void) {
        ws.close()
        ws.onmessage = fn
      }
    `),
    ).toEqual([])
  })

  it('covers EventSource, which has the same handshake shape', () => {
    expect(
      run(`
      function teardown(es: EventSource) {
        es.close()
        es.onerror = null
      }
    `),
    ).toHaveLength(1)
  })
})
