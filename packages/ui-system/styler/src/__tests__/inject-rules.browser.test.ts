import { describe, expect, it } from 'vitest'
import { createSheet } from '../sheet'

// Layer 1 of the P0 rocketstyle-collapse slice: the styler injects
// pre-resolved rule text (captured at build time by the collapse
// resolver) into the LIVE sheet, idempotently, WITHOUT re-hashing — the
// class names are already baked into the rules AND into the collapsed
// _tpl() HTML, so a re-hash would break the contract.

describe('StyleSheet.injectRules (real browser)', () => {
  it('inserts pre-resolved rules into the live sheet verbatim (no re-hash)', () => {
    const s = createSheet()
    const before = s.ruleCountForTest()
    s.injectRules(['.pyr-abc123{color:rgb(1,2,3)}'], 'k1')
    expect(s.ruleCountForTest()).toBe(before + 1)
    // Class name is preserved exactly — proves no re-hash happened.
    const probe = document.createElement('div')
    probe.className = 'pyr-abc123'
    document.body.appendChild(probe)
    expect(getComputedStyle(probe).color).toBe('rgb(1, 2, 3)')
    probe.remove()
  })

  it('is idempotent by key — re-injecting the same bundle adds nothing', () => {
    const s = createSheet()
    s.injectRules(['.pyr-dup{color:red}', '.pyr-dup2{color:blue}'], 'dup')
    const afterFirst = s.ruleCountForTest()
    s.injectRules(['.pyr-dup{color:red}', '.pyr-dup2{color:blue}'], 'dup')
    s.injectRules(['.pyr-dup{color:red}', '.pyr-dup2{color:blue}'], 'dup')
    expect(s.ruleCountForTest()).toBe(afterFirst)
  })

  it('distinct keys inject independently', () => {
    const s = createSheet()
    const before = s.ruleCountForTest()
    s.injectRules(['.pyr-x{margin:1px}'], 'kx')
    s.injectRules(['.pyr-y{margin:2px}'], 'ky')
    expect(s.ruleCountForTest()).toBe(before + 2)
  })
})
