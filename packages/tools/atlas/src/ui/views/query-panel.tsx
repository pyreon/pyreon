/**
 * The Data panel — the four states every fetching component has.
 *
 * In Storybook each is a hand-written story plus an `msw` handler, which is why
 * most projects ship the success case and meet the other three in production.
 * Here it is one selector, and the component branches on `ctx.query` exactly as
 * it would on a real `useQuery` result.
 */
import { Show } from '@pyreon/core'
import * as C from '../chrome'
import type { WorkbenchModel } from '../model'
import { registerAddonPanel } from '../panels'
import { EXPECTED, QUERY_STATES, queryStateById } from '../query-states'

export function registerQueryPanel(): void {
  registerAddonPanel({
    id: 'data',
    title: 'Data',
    hint: 'Loading / success / error / refetching, without a network',
    render: (model) => {
      const m = model as WorkbenchModel
      const state = () => queryStateById(m.queryState())
      const q = () => m.queryResult()

      return (
        <>
          <C.CtrlRow>
            <C.CtrlHead>
              <C.CtrlLabel>Query state</C.CtrlLabel>
              <C.CtrlType>{() => state().hint}</C.CtrlType>
            </C.CtrlHead>
            <C.EnumWrap>
              {QUERY_STATES.map((s) => (
                <C.EnumBtn
                  data-testid={`query-${s.id}`}
                  state={() => (m.queryState() === s.id ? 'active' : 'idle')}
                  onClick={() => m.queryState.set(s.id)}
                >
                  {s.label}
                </C.EnumBtn>
              ))}
            </C.EnumWrap>
          </C.CtrlRow>

          {/* What the component SHOULD be showing — the panel teaches the
              distinction rather than only toggling it. Refetching is the case
              hand-written stories get wrong: status stays `success` and the
              PREVIOUS data stays on screen while a request is in flight. */}
          <C.ActionsHead>
            <C.ActionsHint data-testid="query-expected">
              {() => `Expected: ${EXPECTED[m.queryState()]}`}
            </C.ActionsHint>
          </C.ActionsHead>

          <C.A11ySummary data-testid="query-flags">
            <C.A11yStat>
              <C.A11yDot state={() => (q().isSuccess() ? 'ok' : 'unknown')} />
              {() => `status: ${q().status()}`}
            </C.A11yStat>
            <C.A11yStat>
              <C.A11yDot state={() => (q().isLoading() ? 'warn' : 'unknown')} />
              {() => `isLoading: ${q().isLoading()}`}
            </C.A11yStat>
            <C.A11yStat>
              <C.A11yDot state={() => (q().isFetching() ? 'warn' : 'unknown')} />
              {() => `isFetching: ${q().isFetching()}`}
            </C.A11yStat>
            <C.A11yStat>
              <C.A11yDot state={() => (q().isError() ? 'danger' : 'unknown')} />
              {() => `data: ${q().data() === undefined ? 'undefined' : 'present'}`}
            </C.A11yStat>
          </C.A11ySummary>

          <Show when={() => m.queryState() === 'refetching'}>
            <C.A11yRow data-testid="query-note">
              <C.A11yIcon state="warn">!</C.A11yIcon>
              <C.A11yBody>
                <C.A11yTitle>isLoading is false here</C.A11yTitle>
                <C.A11yNote>
                  A refetch is not a first load. If the preview shows a skeleton
                  instead of the previous data, the component is branching on the
                  wrong flag.
                </C.A11yNote>
              </C.A11yBody>
            </C.A11yRow>
          </Show>
        </>
      )
    },
  })
}
