/* oxlint-disable jsx-a11y/prefer-tag-over-role -- each enum control is a
   `role="group"` of toggle buttons NAMED by the row's label (aria-labelledby).
   A <fieldset> would need its own <legend> — the label already lives in the
   row header, shared with every other control type — and a fieldset is one of
   the elements Element has to flex-fix. The group role is the lighter, exact
   semantics. */
/**
 * Canvas panel — the environment addons in one place: viewport, background,
 * pseudo-state forcing, locale + pseudo-locale, outline, measure. Folds
 * together what Storybook splits across addon-viewport / addon-backgrounds /
 * addon-pseudo-states / addon-outline.
 *
 * Viewport/background/locale lists come from the MODEL (per-project presets
 * with shipped defaults), not the addons consts — the pickers must render
 * what the project configured.
 */
import { PSEUDO_STATES } from '../../addons'
import * as C from '../../components'
import type { WorkbenchModel } from '../../model'
import type { AddonPanelDef } from '../../panels'
import { labelFor, tab } from './shared'

export const canvasPanel: AddonPanelDef = {
  ...tab('canvas'),
  render: (model) => {
    const m = model as WorkbenchModel
    return (
      <>
        <C.CtrlRow>
          <C.CtrlHead>
            <C.CtrlLabel id="atlas-canvas-viewport-label">Viewport</C.CtrlLabel>
            <C.CtrlType>{() => m.viewportPreset().hint}</C.CtrlType>
          </C.CtrlHead>
          <C.EnumWrap role="group" aria-labelledby="atlas-canvas-viewport-label">
            {m.viewports.map((v) => (
              <C.EnumBtn
                data-testid={`viewport-${v.id}`}
                aria-pressed={() => (m.viewport() === v.id ? 'true' : 'false')}
                state={() => (m.viewport() === v.id ? 'active' : 'idle')}
                onClick={() => m.viewport.set(v.id)}
              >
                {v.label}
              </C.EnumBtn>
            ))}
          </C.EnumWrap>
        </C.CtrlRow>

        <C.CtrlRow>
          <C.CtrlHead>
            <C.CtrlLabel id="atlas-canvas-background-label">Background</C.CtrlLabel>
            <C.CtrlType>surface</C.CtrlType>
          </C.CtrlHead>
          <C.EnumWrap role="group" aria-labelledby="atlas-canvas-background-label">
            {m.backgrounds.map((b) => (
              <C.EnumBtn
                data-testid={`background-${b.id}`}
                aria-pressed={() => (m.background() === b.id ? 'true' : 'false')}
                state={() => (m.background() === b.id ? 'active' : 'idle')}
                onClick={() => m.background.set(b.id)}
              >
                {b.label}
              </C.EnumBtn>
            ))}
          </C.EnumWrap>
        </C.CtrlRow>

        <C.CtrlRow>
          <C.CtrlHead>
            <C.CtrlLabel id="atlas-canvas-pseudo-label">Pseudo state</C.CtrlLabel>
            <C.CtrlType>rocketstyle</C.CtrlType>
          </C.CtrlHead>
          <C.EnumWrap role="group" aria-labelledby="atlas-canvas-pseudo-label">
            <C.EnumBtn
              data-testid="pseudo-none"
              aria-pressed={() => (m.pseudo() === null ? 'true' : 'false')}
              state={() => (m.pseudo() === null ? 'active' : 'idle')}
              onClick={() => m.pseudo.set(null)}
            >
              None
            </C.EnumBtn>
            {PSEUDO_STATES.map((p) => (
              <C.EnumBtn
                data-testid={`pseudo-${p.id}`}
                aria-pressed={() => (m.pseudo() === p.id ? 'true' : 'false')}
                state={() => (m.pseudo() === p.id ? 'active' : 'idle')}
                onClick={() => m.pseudo.set(m.pseudo() === p.id ? null : p.id)}
              >
                {p.label}
              </C.EnumBtn>
            ))}
          </C.EnumWrap>
        </C.CtrlRow>

        <C.CtrlRow>
          <C.CtrlHead>
            <C.CtrlLabel id="atlas-canvas-locale-label">Locale</C.CtrlLabel>
            <C.CtrlType>{() => m.dir()}</C.CtrlType>
          </C.CtrlHead>
          <C.EnumWrap role="group" aria-labelledby="atlas-canvas-locale-label">
            {m.locales.map((l) => (
              <C.EnumBtn
                data-testid={`locale-${l.id}`}
                aria-pressed={() => (m.locale() === l.id ? 'true' : 'false')}
                state={() => (m.locale() === l.id ? 'active' : 'idle')}
                onClick={() => m.locale.set(l.id)}
              >
                {l.label}
              </C.EnumBtn>
            ))}
          </C.EnumWrap>
        </C.CtrlRow>

        <C.CtrlRow>
          <C.CtrlHead>
            <C.CtrlLabel id="atlas-canvas-pseudo-locale-label" {...labelFor('atlas-canvas-pseudo-locale')}>Pseudo-locale</C.CtrlLabel>
            <C.CtrlType>i18n stress</C.CtrlType>
          </C.CtrlHead>
          {/* Sits beside the locale switcher because they answer adjacent
              questions: that one changes writing DIRECTION, this one changes
              every string's LENGTH. German and Finnish routinely run 30-40%
              longer than English, and the layout that clips there clips here
              — without translating anything. */}
          <C.Switch
            data-testid="pseudo-locale-toggle"
            id="atlas-canvas-pseudo-locale"
            role="switch"
            aria-checked={() => (m.pseudoLocale() ? 'true' : 'false')}
            state={() => (m.pseudoLocale() ? 'on' : 'off')}
            onClick={() => m.pseudoLocale.set(!m.pseudoLocale())}
          >
            <C.Knob state={() => (m.pseudoLocale() ? 'on' : 'off')} />
          </C.Switch>
        </C.CtrlRow>

        <C.CtrlRow>
          <C.CtrlHead>
            <C.CtrlLabel id="atlas-canvas-outline-label" {...labelFor('atlas-canvas-outline')}>Outline</C.CtrlLabel>
            <C.CtrlType>layout debug</C.CtrlType>
          </C.CtrlHead>
          <C.Switch
            data-testid="outline-toggle"
            id="atlas-canvas-outline"
            role="switch"
            aria-checked={() => (m.outline() ? 'true' : 'false')}
            state={() => (m.outline() ? 'on' : 'off')}
            onClick={() => m.outline.set(!m.outline())}
          >
            <C.Knob state={() => (m.outline() ? 'on' : 'off')} />
          </C.Switch>
        </C.CtrlRow>

        <C.CtrlRow>
          <C.CtrlHead>
            <C.CtrlLabel id="atlas-canvas-measure-label" {...labelFor('atlas-canvas-measure')}>Measure</C.CtrlLabel>
            <C.CtrlType>hover to inspect</C.CtrlType>
          </C.CtrlHead>
          <C.Switch
            data-testid="measure-toggle"
            id="atlas-canvas-measure"
            role="switch"
            aria-checked={() => (m.measure() ? 'true' : 'false')}
            state={() => (m.measure() ? 'on' : 'off')}
            onClick={() => m.measure.set(!m.measure())}
          >
            <C.Knob state={() => (m.measure() ? 'on' : 'off')} />
          </C.Switch>
        </C.CtrlRow>
      </>
    )
  },
}
