// `.multiple()` looks and `.params()` values are web-only for now: the native
// rocketstyle plugin reads only `.theme()` / `.states()` / `.sizes()` /
// `.variants()`. Before, both were dropped on iOS and Android with no
// diagnostic, and the `multiple` / param props passed through to the
// primitive. Now each is a named warning and the props are stripped.

import { describe, expect, it } from 'vitest'
import { transform } from './first-party-plugins'

const SRC = `import { Stack, Text } from '@pyreon/primitives'
const Card = rocketstyle()({ name: 'Card', component: Stack })
  .theme(() => ({ padding: '12px' }))
  .multiple({ compact: { padding: '4px' } })
  .params({ columns: (n) => ({ gap: n }), inset: (n) => ({ padding: n }) })
function App() { return (<Card multiple="compact" columns={3} inset={2}><Text>x</Text></Card>) }`

describe('rocketstyle .multiple() / .params() on native', () => {
  for (const target of ['swift', 'kotlin'] as const) {
    it(`warns by name and strips the props (${target})`, () => {
      const { code, warnings } = transform(SRC, { target })
      const text = warnings.join('\n')
      expect(text).toMatch(/'Card': \.multiple\(\) looks are not lowered to native yet — the `multiple` prop's styles are DROPPED/)
      expect(text).toMatch(/'Card': \.params\(\) \(columns, inset\) is not lowered to native yet/)
      expect(code).not.toMatch(/columns|inset|multiple|compact/)
      expect(code).toMatch(/padding\(12/)
    })
  }

  it('a chain without them warns nothing new', () => {
    const plain = SRC.replace(/\n  \.multiple[^\n]*\n  \.params[^\n]*/, '').replace(' multiple="compact" columns={3} inset={2}', '')
    expect(transform(plain, { target: 'swift' }).warnings.join('\n')).not.toMatch(/not lowered to native yet/)
  })
})
