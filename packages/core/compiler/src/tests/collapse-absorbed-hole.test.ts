/**
 * `templatizeComponentChildren` × `collapseRocketstyle` — the two features
 * rewrite the SAME node, and disagreed about where its text was going.
 *
 * Absorbing a component child moves its source range into a call argument
 * (`_mountChild(<Button/>, __root, null)`). Rocketstyle collapse rewrites that
 * same `<Button/>` into a call, and decided whether to wrap it in JSX braces by
 * looking at the AST PARENT — still the enclosing `<div>`, so: yes. The result
 * was `_mountChild({__rsCollapse("…", …)}, __root, null)`, which is not
 * parseable JavaScript.
 *
 * It stayed latent because it needs BOTH features at once, and
 * `templatizeComponentChildren` was opt-in. Defaulting it on made every
 * rocketstyle app that also enables collapse fail to build — caught by
 * `verify-modes` on `ui-showcase × spa`, with 17 syntax errors.
 *
 * The gate is REPARSING, not a string match: the failure mode is "emits text
 * that is not JavaScript", and a parser is the only honest test of that. Both
 * backends are asserted, and asserted to agree — they fix this differently (the
 * JS backend marks the hole nodes in a set, the Rust one clears its
 * `parent_is_jsx` frame flag across the hole walk), so byte-identity is the
 * thing that keeps the two implementations honest about meaning the same thing.
 */
import { parseSync } from 'oxc-parser'
import { describe, expect, it } from 'vitest'
import { transformJSX } from '../index'
import { rocketstyleCollapseKey, transformJSX_JS } from '../jsx'

const SITE = {
  templateHtml: '<button><span>Save</span></button>',
  lightClass: 'L',
  darkClass: 'D',
  rules: ['.L{}'],
  ruleKey: 'b',
}

const opts = (props: Record<string, string>, children: string) => ({
  templatizeComponentChildren: true,
  collapseRocketstyle: {
    candidates: new Set(['Button']),
    sites: new Map([[rocketstyleCollapseKey('Button', props, children), SITE]]),
    mode: { name: 'useMode', source: '@pyreon/ui-core' },
  },
})

const reparses = (code: string): boolean => {
  try {
    return !parseSync('out.tsx', code).errors?.length
  } catch {
    return false
  }
}

const CASES: Array<[string, string]> = [
  // The absorbing shapes — a collapsed component reached through a hole.
  ['sole component child', `const A = () => <div class="a"><Button state="primary">Save</Button></div>`],
  [
    'two component children',
    `const A = () => <div class="a"><Button state="primary">Save</Button><Button state="primary">Save</Button></div>`,
  ],
  [
    'TRAILING hole after a baked static sibling',
    `const A = () => <div class="a"><h2>t</h2><Button state="primary">Save</Button></div>`,
  ],
  [
    'nested — the hole sits under a baked element',
    `const A = () => <div class="a"><main class="m"><Button state="primary">Save</Button></main></div>`,
  ],
  // The shape that proves the NATIVE half: the templatized element is itself a
  // JSX child (sole child of a component, the `_lc` path), so the Rust
  // backend's `parent_is_jsx` frame flag is TRUE when it reaches the hole. At
  // top level that flag is already false, so every case above passes on the
  // native backend with its guard removed and proves only the JS one.
  [
    'hole under a template that is ITSELF a JSX child',
    `const A = () => <Provider><div class="a"><Button state="primary">Save</Button></div></Provider>`,
  ],
  // The bail shape: static AFTER the component, so no hole is created and the
  // collapsed call stays in a real JSX child slot, where braces ARE correct.
  [
    'BAIL shape keeps its braces (still a JSX child)',
    `const A = () => <div class="a"><Button state="primary">Save</Button><span>s</span></div>`,
  ],
]

describe('collapse inside an absorbed component hole', () => {
  for (const [name, src] of CASES) {
    it(`${name} — emits parseable JS in both backends, byte-identically`, () => {
      const o = opts({ state: 'primary' }, 'Save')
      const rs = transformJSX(src, 'App.tsx', o as never).code
      const js = transformJSX_JS(src, 'App.tsx', o as never).code
      expect(rs, 'native and JS backends must agree').toBe(js)
      expect(reparses(rs), `unparseable emit:\n${rs}`).toBe(true)
      // The collapse actually fired — otherwise this would pass by bailing and
      // prove nothing about the interaction it exists to cover.
      expect(rs).toContain('__rsCollapse(')
      // The exact broken shape: a braced expression container handed to a call.
      expect(rs).not.toContain('_mountChild({')
      expect(rs).not.toContain('_mountSlot({')
    })
  }
})
