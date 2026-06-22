/**
 * /cpse-probe — exercises Custom-Property Style Extraction end-to-end.
 *
 * Used by `e2e/ssr-showcase` (CPSE spec) to prove, in real Chromium against
 * the SSR dev server:
 *   - SSR emits a value-agnostic class + inline `--u-*` custom properties;
 *   - N instances with N DISTINCT values share ONE class (O(N)→O(1) rules);
 *   - after hydration, each box computes its own correct padding (parity);
 *   - a signal-driven box updates its computed padding on click (dynamic).
 */
import { signal } from '@pyreon/reactivity'
import { cpseStyled } from '@pyreon/unistyle'

const Box = cpseStyled('div')

export default function CpseProbe() {
  const pad = signal(8)
  return (
    <main data-testid="cpse-probe">
      <h1>CPSE Probe</h1>
      <Box styles={{ padding: 8 }} data-testid="box-8">
        A
      </Box>
      <Box styles={{ padding: 16 }} data-testid="box-16">
        B
      </Box>
      <Box styles={{ padding: 24 }} data-testid="box-24">
        C
      </Box>
      <Box styles={{ padding: 36 }} data-testid="box-36">
        D
      </Box>
      <Box styles={() => ({ padding: pad() })} data-testid="box-dyn">
        DYN
      </Box>
      <button data-testid="bump" onClick={() => pad.set(pad() + 8)}>
        bump
      </button>
      <span data-testid="pad-val">{() => pad()}</span>
    </main>
  )
}
