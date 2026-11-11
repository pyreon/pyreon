/* oxlint-disable jsx-a11y/prefer-tag-over-role -- each option set is a
   `role="group"` of toggle buttons NAMED by the row's label (aria-labelledby).
   A <fieldset> would need its own <legend> — the label already lives in the
   row header, shared with every other control type — and a fieldset is one of
   the elements Element has to flex-fix. The group role is the lighter, exact
   semantics. */
/**
 * The two environment panels.
 *
 * - Canvas — the stage's own tools: zoom, the dotted grid, measure.
 * - Addons — what the component renders UNDER: viewport, background, preview
 *   brand, outline, pseudo state, locale and pseudo-locale. Folds together
 *   what Storybook splits across addon-viewport / addon-backgrounds /
 *   addon-pseudo-states / addon-outline.
 *
 * Viewport/background/locale lists come from the MODEL (per-project presets
 * with shipped defaults), not the addons consts — the pickers must render
 * what the project configured.
 */
import type { Signal } from '@pyreon/reactivity'
import { PSEUDO_STATES } from '../../addons'
import * as C from '../../components'
import type { WorkbenchModel } from '../../model'
import { ZOOM_PCT } from '../../model'
import type { AddonPanelDef } from '../../panels'
import { THEMES } from '../../theme'
import { labelFor, tab } from './shared'

interface Option {
  id: string
  label: string
  testid: string
}

/** A labelled row of toggle buttons — one pressed at a time. */
function choiceRow(
  key: string,
  label: string,
  type: string | (() => string),
  options: readonly Option[],
  isOn: (id: string) => boolean,
  pick: (id: string) => void,
) {
  const labelId = `atlas-env-${key}-label`
  return (
    <C.CtrlRow>
      <C.CtrlHead>
        <C.CtrlLabel id={labelId}>{label}</C.CtrlLabel>
        <C.CtrlType>{type}</C.CtrlType>
      </C.CtrlHead>
      <C.EnumWrap role="group" aria-labelledby={labelId}>
        {options.map((o) => (
          <C.EnumBtn
            data-testid={o.testid}
            aria-pressed={() => (isOn(o.id) ? 'true' : 'false')}
            state={() => (isOn(o.id) ? 'active' : 'idle')}
            onClick={() => pick(o.id)}
          >
            {o.label}
          </C.EnumBtn>
        ))}
      </C.EnumWrap>
    </C.CtrlRow>
  )
}

/** A labelled on/off switch bound to a boolean signal. */
function switchRow(key: string, label: string, type: string, value: Signal<boolean>, testid: string) {
  const id = `atlas-env-${key}`
  return (
    <C.CtrlRow>
      <C.CtrlHead>
        <C.CtrlLabel id={`${id}-label`} {...labelFor(id)}>
          {label}
        </C.CtrlLabel>
        <C.CtrlType>{type}</C.CtrlType>
      </C.CtrlHead>
      <C.Switch
        data-testid={testid}
        id={id}
        role="switch"
        aria-checked={() => (value() ? 'true' : 'false')}
        state={() => (value() ? 'on' : 'off')}
        onClick={() => value.set(!value())}
      >
        <C.Knob state={() => (value() ? 'on' : 'off')} />
      </C.Switch>
    </C.CtrlRow>
  )
}

export const canvasPanel: AddonPanelDef = {
  ...tab('canvas'),
  render: (model) => {
    const m = model as WorkbenchModel
    return (
      <>
        {choiceRow(
          'zoom',
          'Zoom',
          () => `${ZOOM_PCT[m.zoomIdx()]}%`,
          ZOOM_PCT.map((z) => ({ id: String(z), label: `${z}%`, testid: `zoom-${z}` })),
          (id) => String(ZOOM_PCT[m.zoomIdx()]) === id,
          (id) => m.zoomIdx.set(ZOOM_PCT.indexOf(Number(id) as (typeof ZOOM_PCT)[number])),
        )}
        {switchRow('grid', 'Grid', 'stage dots', m.grid, 'grid-toggle')}
        {switchRow('measure', 'Measure', 'hover to inspect', m.measure, 'measure-toggle')}
      </>
    )
  },
}

export const addonsPanel: AddonPanelDef = {
  ...tab('addons'),
  render: (model) => {
    const m = model as WorkbenchModel
    return (
      <>
        {choiceRow(
          'viewport',
          'Viewport',
          () => m.viewportPreset().hint,
          m.viewports.map((v) => ({ id: v.id, label: v.label, testid: `viewport-${v.id}` })),
          (id) => m.viewport() === id,
          (id) => m.viewport.set(id),
        )}
        {choiceRow(
          'background',
          'Background',
          'surface',
          m.backgrounds.map((b) => ({ id: b.id, label: b.label, testid: `background-${b.id}` })),
          (id) => m.background() === id,
          (id) => m.background.set(id),
        )}
        {/* The preview's brand — handed to the project wrapper as `brand`,
            and the token set a catalog built on Atlas's own bases styles
            from. The workbench chrome does not change with it. */}
        {choiceRow(
          'brand',
          'Brand',
          'preview theme',
          THEMES.map((t) => ({ id: t.id, label: t.name, testid: `brand-${t.id}` })),
          (id) => m.brandId() === id,
          (id) => m.brandId.set(id),
        )}
        {switchRow('outline', 'Outline', 'layout debug', m.outline, 'outline-toggle')}
        {choiceRow(
          'pseudo',
          'Pseudo state',
          'rocketstyle',
          [
            { id: 'none', label: 'None', testid: 'pseudo-none' },
            ...PSEUDO_STATES.map((p) => ({ id: p.id, label: p.label, testid: `pseudo-${p.id}` })),
          ],
          (id) => (id === 'none' ? m.pseudo() === null : m.pseudo() === id),
          (id) => {
            const p = PSEUDO_STATES.find((s) => s.id === id)
            m.pseudo.set(!p || m.pseudo() === p.id ? null : p.id)
          },
        )}
        {choiceRow(
          'locale',
          'Locale',
          () => m.dir(),
          m.locales.map((l) => ({ id: l.id, label: l.label, testid: `locale-${l.id}` })),
          (id) => m.locale() === id,
          (id) => m.locale.set(id),
        )}
        {/* Beside the locale switcher because they answer adjacent questions:
            that one changes writing DIRECTION, this one changes every
            string's LENGTH — the layout that clips in German clips here,
            without translating anything. */}
        {switchRow('pseudo-locale', 'Pseudo-locale', 'i18n stress', m.pseudoLocale, 'pseudo-locale-toggle')}
      </>
    )
  },
}
